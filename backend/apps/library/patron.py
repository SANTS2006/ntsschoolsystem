"""The library as seen by a student or a teacher: browse the catalogue, reserve a book, borrow one, and see their own
reservations and loans. Gated by the `library.borrow` permission (so a school can grant or withdraw it per role) and
always scoped to the signed-in person — nobody can see or act on anyone else's reservations or loans."""

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView

from . import services
from .models import Book, BookCopy, BookLoan, BookReservation
from .serializers import BookLoanSerializer, BookReservationSerializer


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code="VALIDATION_ERROR", http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "code": code, "errors": [{"field": None, "message": message}]}, status=http_status)


class _Patron(TenantScopedAPIView):
    def get_permissions(self):
        return [require_permission("library.borrow")()]

    def patron(self, request):
        """(student, staff) — exactly one is set for a student or a teacher; both None for anyone else."""
        return getattr(request.user, "student_profile", None), getattr(request.user, "staff_profile", None)


class LibraryCatalogView(_Patron):
    """GET /library/catalog/?search=&category= — every book, how many copies are free, and what this person already
    has on it."""

    def get(self, request):
        student, staff = self.patron(request)
        qs = Book.objects.select_related("category").annotate(
            free=Count("copies", filter=Q(copies__status=BookCopy.Status.AVAILABLE)),
            total=Count("copies"),
        )
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(author__icontains=search) | Q(isbn__icontains=search))
        category = request.query_params.get("category")
        if category:
            qs = qs.filter(category_id=category)
        books = list(qs.order_by("title")[:60])

        mine = {"student": student} if student else {"staff": staff}
        reservations = {
            r.book_id: r.status
            for r in BookReservation.objects.filter(
                book__in=books, status__in=[BookReservation.Status.PENDING, BookReservation.Status.APPROVED], **mine
            )
        }
        loans = {
            l.copy.book_id: l.due_date.isoformat()
            for l in BookLoan.objects.filter(copy__book__in=books, status=BookLoan.Status.BORROWED, **mine).select_related("copy")
        }
        return _ok(
            books=[
                {
                    "id": str(b.id),
                    "title": b.title,
                    "author": b.author,
                    "isbn": b.isbn,
                    "category_name": b.category.name if b.category_id else None,
                    "description": b.description,
                    "available_copies": b.free,
                    "total_copies": b.total,
                    "my_reservation": reservations.get(b.id),
                    "my_loan_due": loans.get(b.id),
                }
                for b in books
            ]
        )


class LibraryReserveView(_Patron):
    def post(self, request, pk):
        student, staff = self.patron(request)
        if student is None and staff is None:
            return _error("Only students and staff can reserve books.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        book = Book.objects.filter(pk=pk).first()
        if book is None:
            return _error("Book not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        try:
            reservation = services.reserve_for_patron(book=book, student=student, staff=None if student else staff)
        except services.LibraryError as exc:
            return _error(str(exc))
        return _ok("Reservation sent to the librarian.", reservation=BookReservationSerializer(reservation).data)


class LibraryBorrowView(_Patron):
    def post(self, request, pk):
        student, staff = self.patron(request)
        if student is None and staff is None:
            return _error("Only students and staff can borrow books.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        book = Book.objects.filter(pk=pk).first()
        if book is None:
            return _error("Book not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        try:
            loan = services.borrow_for_patron(book=book, student=student, staff=None if student else staff)
        except services.LibraryError as exc:
            return _error(str(exc))
        return _ok("Book borrowed.", loan=BookLoanSerializer(loan).data)


class MyLibraryView(_Patron):
    """GET /library/my/ — this person's reservations and loans (never anyone else's)."""

    def get(self, request):
        student, staff = self.patron(request)
        mine = {"student": student} if student else {"staff": staff} if staff else None
        if mine is None:
            return _ok(reservations=[], loans=[])
        reservations = BookReservation.objects.filter(**mine).select_related("book", "student", "staff__user").order_by("-reserved_at")[:50]
        loans = BookLoan.objects.filter(**mine).select_related("copy__book", "student", "staff__user").order_by("-borrowed_date")[:50]
        return _ok(
            reservations=BookReservationSerializer(reservations, many=True).data,
            loans=BookLoanSerializer(loans, many=True).data,
        )


class MyReservationCancelView(_Patron):
    def post(self, request, pk):
        student, staff = self.patron(request)
        mine = {"student": student} if student else {"staff": staff} if staff else None
        reservation = BookReservation.objects.filter(pk=pk, **(mine or {"pk": None})).first() if mine else None
        if reservation is None:
            return _error("Reservation not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        if reservation.status not in (BookReservation.Status.PENDING, BookReservation.Status.APPROVED):
            return _error("This reservation can't be cancelled any more.")
        reservation.status = BookReservation.Status.CANCELLED
        reservation.save(update_fields=["status", "updated_at"])
        return _ok("Reservation cancelled.")
