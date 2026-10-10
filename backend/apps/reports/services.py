from decimal import Decimal

from django.db.models import Avg, Count, F, Sum
from django.utils import timezone

ZERO = Decimal("0.00")


def dashboard_overview(school, user):
    """
    One combined snapshot pulling headline numbers from six domains — the
    thing that makes Reports its own app rather than each domain's own
    `stats`-style action repeated. Every query is explicitly scoped by
    `school=school` and uses `unscoped_objects`, since this may be called
    outside request context (management command, scheduled job) same as
    every other cross-cutting service function in this codebase.

    Each field is computed only if `user` holds that domain's own `.view`
    permission — this endpoint no longer requires `reports.view` itself (see
    `DashboardOverviewView`), so every logged-in school user can load a
    dashboard at all; a field the caller can't see is simply omitted rather
    than everyone getting every number or nobody getting any. A user with
    none of the six view permissions (e.g. a bare self-service account) gets
    an empty dict back, which the frontend already renders as "no headline
    stats" rather than an error.
    """
    from apps.authorization.services import user_has_permission

    result = {}

    if user_has_permission(user, "students.view"):
        from apps.students.models import Student

        result["active_students"] = Student.unscoped_objects.filter(
            school=school, status=Student.Status.ACTIVE
        ).count()

    if user_has_permission(user, "staff.view"):
        from apps.staff.models import Staff

        result["active_staff"] = Staff.unscoped_objects.filter(
            school=school, employment_status=Staff.EmploymentStatus.ACTIVE
        ).count()

    if user_has_permission(user, "attendance.view"):
        from apps.attendance.models import AttendanceStatus, StudentAttendance

        today = timezone.now().date()
        todays_attendance = StudentAttendance.unscoped_objects.filter(school=school, date=today, period__isnull=True)
        todays_total = todays_attendance.count()
        todays_present = todays_attendance.filter(status=AttendanceStatus.PRESENT).count()
        result["todays_attendance_rate_percent"] = (
            round((todays_present / todays_total) * 100, 2) if todays_total else None
        )

    if user_has_permission(user, "fees.view"):
        from apps.finance.models import Invoice

        result["outstanding_fees"] = (
            Invoice.unscoped_objects.filter(school=school)
            .exclude(status=Invoice.Status.CANCELLED)
            .aggregate(total=Sum("balance"))["total"]
            or ZERO
        )

    if user_has_permission(user, "inventory.view"):
        from apps.inventory.models import InventoryItem

        result["low_stock_items"] = InventoryItem.unscoped_objects.filter(
            school=school, is_active=True, quantity_in_stock__lte=F("reorder_level")
        ).count()

    if user_has_permission(user, "procurement.view"):
        from apps.procurement.models import PurchaseRequest

        result["pending_purchase_requests"] = PurchaseRequest.unscoped_objects.filter(
            school=school, status=PurchaseRequest.Status.SUBMITTED
        ).count()

    return result


def enrollment_summary(school):
    from apps.students.models import Student

    qs = Student.unscoped_objects.filter(school=school)
    active = qs.filter(status=Student.Status.ACTIVE)

    return {
        "total_students": qs.count(),
        "by_status": list(qs.values("status").annotate(count=Count("id")).order_by("status")),
        "by_class": list(
            active.values("current_class__name").annotate(count=Count("id")).order_by("current_class__name")
        ),
        "by_gender": list(active.values("gender").annotate(count=Count("id")).order_by("gender")),
    }


def attendance_summary(school, *, start_date, end_date, school_class_id=None):
    from apps.attendance.models import AttendanceStatus, StudentAttendance

    # period__isnull=True: daily/homeroom records only, per StudentAttendance's own
    # "period=None means daily attendance" convention — excludes subject-level records
    # so a student isn't counted multiple times per day.
    qs = StudentAttendance.unscoped_objects.filter(
        school=school, period__isnull=True, date__gte=start_date, date__lte=end_date
    )
    if school_class_id:
        qs = qs.filter(student__current_class_id=school_class_id)

    by_status = list(qs.values("status").annotate(count=Count("id")).order_by("status"))
    total = sum(row["count"] for row in by_status)
    present = next((row["count"] for row in by_status if row["status"] == AttendanceStatus.PRESENT), 0)

    return {
        "total_records": total,
        "by_status": by_status,
        "attendance_rate_percent": round((present / total) * 100, 2) if total else None,
    }


def academic_performance_summary(school, *, exam_id):
    from apps.examinations.models import Result

    # Only published/locked results count — same rule as ResultViewSet.report_card():
    # a draft/submitted/reviewed/approved score isn't official yet.
    qs = Result.unscoped_objects.filter(
        school=school, exam_schedule__exam_id=exam_id, status__in=[Result.Status.PUBLISHED, Result.Status.LOCKED]
    )
    overall = qs.aggregate(average_score=Avg("score"), result_count=Count("id"))

    return {
        "overall_average_score": overall["average_score"],
        "total_results": overall["result_count"],
        "by_subject": list(
            qs.values("exam_schedule__subject__name")
            .annotate(average_score=Avg("score"), result_count=Count("id"))
            .order_by("exam_schedule__subject__name")
        ),
        "by_class": list(
            qs.values("exam_schedule__school_class__name")
            .annotate(average_score=Avg("score"), result_count=Count("id"))
            .order_by("exam_schedule__school_class__name")
        ),
    }


def finance_summary(school, *, academic_year_id=None):
    from apps.finance.models import Invoice

    qs = Invoice.unscoped_objects.filter(school=school)
    if academic_year_id:
        qs = qs.filter(academic_year_id=academic_year_id)
    active = qs.exclude(status=Invoice.Status.CANCELLED)

    totals = active.aggregate(
        total_invoiced=Sum("total"), total_collected=Sum("amount_paid"), total_outstanding=Sum("balance")
    )
    overdue = active.filter(
        due_date__lt=timezone.now().date(), status__in=[Invoice.Status.UNPAID, Invoice.Status.PARTIALLY_PAID]
    ).aggregate(count=Count("id"), amount=Sum("balance"))

    return {
        "total_invoiced": totals["total_invoiced"] or ZERO,
        "total_collected": totals["total_collected"] or ZERO,
        "total_outstanding": totals["total_outstanding"] or ZERO,
        "overdue_count": overdue["count"] or 0,
        "overdue_amount": overdue["amount"] or ZERO,
        "by_status": list(active.values("status").annotate(count=Count("id")).order_by("status")),
    }
