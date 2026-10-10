from django.db import transaction
from django.utils import timezone

from apps.parents.services import notify_student_guardians

from .models import Bed, HostelAllocation


class HostelError(Exception):
    """Raised for hostel business-rule violations — callers turn this into a 400."""


@transaction.atomic
def allocate_bed(*, bed, student, check_in_date=None) -> HostelAllocation:
    """
    Locks the bed row for the transaction's duration so two simultaneous
    allocation requests for the same bed can't both succeed — the second
    sees the bed already actively allocated once it acquires the lock
    (after the first commits) and is rejected. Same
    select_for_update()-then-recheck template as
    apps.finance.services.record_payment() / apps.library.services.checkout_book().
    `unscoped_objects` throughout for the same reason documented there.
    """
    bed = Bed.unscoped_objects.select_for_update().get(pk=bed.pk)

    if HostelAllocation.unscoped_objects.filter(bed=bed, status=HostelAllocation.Status.ACTIVE).exists():
        raise HostelError("This bed is already occupied.")
    if HostelAllocation.unscoped_objects.filter(student=student, status=HostelAllocation.Status.ACTIVE).exists():
        raise HostelError("This student already has an active hostel allocation.")

    allocation = HostelAllocation.objects.create(
        school=bed.school,
        bed=bed,
        student=student,
        check_in_date=check_in_date or timezone.now().date(),
    )
    # Tell the student themselves, in the app and by email, where they have been placed.
    if student.user_id:
        from django.utils.html import escape

        from apps.notifications.services import notify

        place = f"{bed.room.hostel.name}, room {bed.room.room_number}, bed {bed.bed_number}"
        notify(
            recipient=student.user,
            category="hostel",
            title="You have been given a hostel bed",
            message=f"You have been allocated {place}, from {allocation.check_in_date:%d %b %Y}.",
            link="/my-hostel",
            email_subject="Your hostel allocation",
            email_html=(
                f"<p>You have been allocated <strong>{escape(place)}</strong>, from {allocation.check_in_date:%d %b %Y}.</p>"
                "<p>Sign in and open <em>My hostel</em> for the details.</p>"
            ),
        )
    notify_student_guardians(
        student,
        category="hostel",
        title="Hostel room assigned",
        message=f"{student.full_name} has been allocated {bed.room.hostel.name}, room {bed.room.room_number}, bed {bed.bed_number}.",
        link="/hostel/allocations",
        email_subject=f"Hostel allocation: {student.full_name}",
        email_html=(
            f"<p>{student.full_name} has been allocated a bed in {bed.room.hostel.name}, "
            f"room {bed.room.room_number}, bed {bed.bed_number}, effective "
            f"{allocation.check_in_date:%Y-%m-%d}.</p>"
        ),
    )
    return allocation


@transaction.atomic
def check_out(*, allocation, check_out_date=None) -> HostelAllocation:
    allocation = HostelAllocation.unscoped_objects.select_for_update().get(pk=allocation.pk)

    if allocation.status != HostelAllocation.Status.ACTIVE:
        raise HostelError("This allocation is not currently active.")

    allocation.status = HostelAllocation.Status.CHECKED_OUT
    allocation.check_out_date = check_out_date or timezone.now().date()
    allocation.save(update_fields=["status", "check_out_date", "updated_at"])
    return allocation
