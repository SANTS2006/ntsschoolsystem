from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import DEFAULT_FINE_PER_DAY, DEFAULT_LOAN_DAYS, MAX_RENEWALS, BookCopy, BookLoan


class LibraryError(Exception):
    """Raised for library business-rule violations — callers turn this into a 400."""


@transaction.atomic
def checkout_book(*, copy, student=None, staff=None, loan_days: int = DEFAULT_LOAN_DAYS) -> BookLoan:
    """
    Locks the copy row so two simultaneous checkout requests for the same
    physical copy can't both succeed — the second sees `status != available`
    once it acquires the lock (after the first commits) and is rejected.
    Same select_for_update()-then-recheck template as
    apps.finance.services.record_payment(). Uses `unscoped_objects` for the
    same reason documented there: this is called from request-scoped views
    *and* directly (tests), so it can't depend on ambient tenant context.
    """
    copy = BookCopy.unscoped_objects.select_for_update().get(pk=copy.pk)

    if copy.status != BookCopy.Status.AVAILABLE:
        raise LibraryError(f"This copy is not available (status: {copy.status}).")
    if bool(student) == bool(staff):
        raise LibraryError("Exactly one of student or staff must borrow the book.")

    today = timezone.now().date()
    loan = BookLoan.objects.create(
        school=copy.school,
        copy=copy,
        student=student,
        staff=staff,
        borrowed_date=today,
        due_date=today + timedelta(days=loan_days),
    )
    copy.status = BookCopy.Status.BORROWED
    copy.save(update_fields=["status", "updated_at"])
    return loan


@transaction.atomic
def return_book(*, loan, fine_per_day: Decimal = DEFAULT_FINE_PER_DAY) -> BookLoan:
    loan = BookLoan.unscoped_objects.select_for_update().get(pk=loan.pk)
    copy = BookCopy.unscoped_objects.select_for_update().get(pk=loan.copy_id)

    if loan.status != BookLoan.Status.BORROWED:
        raise LibraryError(f"This loan is not currently borrowed (status: {loan.status}).")

    today = timezone.now().date()
    overdue_days = max((today - loan.due_date).days, 0)
    loan.fine_amount = fine_per_day * overdue_days
    loan.returned_date = today
    loan.status = BookLoan.Status.RETURNED
    loan.save(update_fields=["fine_amount", "returned_date", "status", "updated_at"])

    copy.status = BookCopy.Status.AVAILABLE
    copy.save(update_fields=["status", "updated_at"])
    return loan


@transaction.atomic
def renew_loan(*, loan, loan_days: int = DEFAULT_LOAN_DAYS) -> BookLoan:
    loan = BookLoan.unscoped_objects.select_for_update().get(pk=loan.pk)

    if loan.status != BookLoan.Status.BORROWED:
        raise LibraryError(f"This loan is not currently borrowed (status: {loan.status}).")
    if loan.renewal_count >= MAX_RENEWALS:
        raise LibraryError(f"This loan has already been renewed the maximum ({MAX_RENEWALS}) times.")

    loan.due_date = loan.due_date + timedelta(days=loan_days)
    loan.renewal_count += 1
    loan.save(update_fields=["due_date", "renewal_count", "updated_at"])
    return loan


MAX_ACTIVE_LOANS_PER_PATRON = 3


def _patron_user(reservation_or_loan_owner_student, staff):
    if reservation_or_loan_owner_student is not None and reservation_or_loan_owner_student.user_id:
        return reservation_or_loan_owner_student.user
    if staff is not None:
        return staff.user
    return None


def decide_reservation(reservation, *, approve: bool, by, note: str = ""):
    """The librarian's yes/no on a reservation a student or teacher asked for. Tells the requester, in the app and by
    email, either way."""
    from django.utils.html import escape

    from apps.notifications.services import notify

    from .models import BookReservation

    if reservation.status != BookReservation.Status.PENDING:
        raise LibraryError(f"This reservation is already {reservation.status}.")
    note = (note or "").strip()[:500]
    reservation.status = BookReservation.Status.APPROVED if approve else BookReservation.Status.REJECTED
    reservation.decision_note = note
    reservation.decided_at = timezone.now()
    reservation.decided_by = by
    reservation.save(update_fields=["status", "decision_note", "decided_at", "decided_by", "updated_at"])

    user = _patron_user(reservation.student if reservation.student_id else None, reservation.staff if reservation.staff_id else None)
    if user:
        title_text = reservation.book.title
        if approve:
            subject, message = f"Reservation approved: {title_text}", f"Your reservation for \"{title_text}\" was approved. Please collect it from the library."
        else:
            subject, message = f"Reservation not approved: {title_text}", f"Your reservation for \"{title_text}\" was not approved." + (f" Reason: {note}" if note else "")
        notify(
            recipient=user,
            category="library",
            title=subject,
            message=message,
            link="/my-library",
            email_subject=subject,
            email_html=f"<p>{escape(message)}</p>" + (f"<p>{escape(note)}</p>" if approve and note else ""),
        )
    return reservation


def reserve_for_patron(*, book, student=None, staff=None):
    """A student or teacher asks the library to reserve a book for them. One open request per book per person."""
    from apps.authorization.models import UserRole
    from apps.notifications.services import notify_bulk

    from .models import BookReservation

    open_states = [BookReservation.Status.PENDING, BookReservation.Status.APPROVED]
    existing = BookReservation.unscoped_objects.filter(school=book.school, book=book, status__in=open_states)
    existing = existing.filter(student=student) if student else existing.filter(staff=staff)
    if existing.exists():
        raise LibraryError("You already have an open reservation for this book.")
    reservation = BookReservation.objects.create(school=book.school, book=book, student=student, staff=staff)
    # Tell the librarians there is something to decide.
    users = [
        ur.user
        for ur in UserRole.unscoped_objects.filter(role__school=book.school, role__slug="librarian", role__is_active=True).select_related("user")
    ]
    who = student.full_name if student else staff.user.full_name
    notify_bulk(
        recipients=users,
        category="library",
        title="New book reservation",
        message=f"{who} asked to reserve \"{book.title}\".",
        link="/library/reservations",
    )
    return reservation


def borrow_for_patron(*, book, student=None, staff=None):
    """A student or teacher borrows an available copy themselves. Limited to a few books at once, and not while
    anything they hold is overdue."""
    from django.utils.html import escape

    from apps.notifications.services import notify

    from .models import BookLoan

    loans = BookLoan.unscoped_objects.filter(school=book.school, status=BookLoan.Status.BORROWED)
    loans = loans.filter(student=student) if student else loans.filter(staff=staff)
    if loans.count() >= MAX_ACTIVE_LOANS_PER_PATRON:
        raise LibraryError(f"You can borrow up to {MAX_ACTIVE_LOANS_PER_PATRON} books at a time. Return one first.")
    if loans.filter(due_date__lt=timezone.now().date()).exists():
        raise LibraryError("You have an overdue book. Please return it before borrowing another.")
    copy = BookCopy.unscoped_objects.filter(school=book.school, book=book, status=BookCopy.Status.AVAILABLE).order_by("copy_number").first()
    if copy is None:
        raise LibraryError("No copy of this book is available right now. You can reserve it instead.")
    loan = checkout_book(copy=copy, student=student, staff=staff)
    user = _patron_user(student, staff)
    if user:
        message = f"You borrowed \"{book.title}\" (copy {copy.copy_number}). Please return it by {loan.due_date:%d %b %Y}."
        notify(
            recipient=user,
            category="library",
            title=f"Book borrowed: {book.title}",
            message=message,
            link="/my-library",
            email_subject=f"Book borrowed: {book.title}",
            email_html=f"<p>{escape(message)}</p>",
        )
    return loan
