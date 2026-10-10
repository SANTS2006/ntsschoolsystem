"""A dashboard for a role the school created itself: built by scanning the permissions the person holds (as the role they
are working as) and adding a section for each module they can see, each linking to that module. A role that later gains
or loses a permission gains or loses the matching section — nothing to configure."""

from django.db.models import F

from .dashboards import (
    _alert,
    _attendance_rate_on,
    _attendance_trend,
    _can,
    _chart,
    _enrollment_by_class,
    _finance_totals,
    _kpi,
    _num,
    _rate,
    _results_status_counts,
    _today,
)


def custom_role_dashboard(school, user, ctx, role_name: str) -> dict:
    today = _today(school)
    kpis, charts, tables, alerts, actions = [], [], [], [], []

    def link(label, to):
        actions.append({"label": label, "to": to})

    if _can(user, "students.view"):
        from apps.students.models import Student

        kpis.append(_kpi("students", "Active students", Student.unscoped_objects.filter(school=school, status=Student.Status.ACTIVE).count(), link="/students"))
        charts.append(_chart("enrollment", "Enrollment by class", "bar", _enrollment_by_class(school, ctx)))
        link("Students", "/students")
    if _can(user, "staff.view"):
        from apps.staff.models import Staff

        kpis.append(_kpi("staff", "Active staff", Staff.unscoped_objects.filter(school=school, employment_status=Staff.EmploymentStatus.ACTIVE).count(), link="/staff"))
    if _can(user, "attendance.view"):
        rate, total = _attendance_rate_on(school, today, ctx)
        kpis.append(_kpi("attendance", "Today's attendance", rate, fmt="percent", hint=f"{total} records today" if total else "Not taken yet today", link="/attendance"))
        charts.append(_chart("attendance", "Attendance rate, last 14 days", "line", _attendance_trend(school, today, ctx), fmt="percent"))
    if _can(user, "fees.view"):
        f = _finance_totals(school, ctx)
        kpis.append(_kpi("outstanding", "Outstanding fees", _num(f["outstanding"]), fmt="currency", link="/finance/invoices"))
        kpis.append(_kpi("collection", "Fee collection rate", _rate(f["collected"], f["billed"]), fmt="percent", link="/finance/invoices"))
    if _can(user, "library.view"):
        from apps.library.models import Book, BookLoan, BookReservation

        kpis.append(_kpi("books", "Books", Book.unscoped_objects.filter(school=school).count(), link="/library/books"))
        out = BookLoan.unscoped_objects.filter(school=school, status=BookLoan.Status.BORROWED)
        kpis.append(_kpi("loans", "Books out on loan", out.count(), link="/library/loans"))
        pending = BookReservation.unscoped_objects.filter(school=school, status=BookReservation.Status.PENDING).count()
        kpis.append(_kpi("reservations", "Reservations to decide", pending, tone="warning" if pending else "success", link="/library/reservations"))
        overdue = out.filter(due_date__lt=today).count()
        if overdue:
            alerts.append(_alert("warning", f"{overdue} borrowed books are overdue.", "/library/loans"))
        if pending:
            alerts.append(_alert("info", f"{pending} book reservations are waiting for a decision.", "/library/reservations"))
        link("Reservations", "/library/reservations")
    if _can(user, "hostel.view"):
        from apps.hostel.models import Bed, HostelAllocation

        occupied = HostelAllocation.unscoped_objects.filter(school=school, status=HostelAllocation.Status.ACTIVE).count()
        beds = Bed.unscoped_objects.filter(school=school).count()
        kpis.append(_kpi("hostel", "Hostel beds occupied", occupied, hint=f"of {beds} beds", link="/hostel/allocations"))
    if _can(user, "transport.view"):
        from apps.transport.models import Vehicle

        kpis.append(_kpi("vehicles", "Active vehicles", Vehicle.unscoped_objects.filter(school=school, status=Vehicle.Status.ACTIVE).count(), link="/transport/vehicles"))
    if _can(user, "medical.view"):
        from apps.medical.models import MedicalVisit

        month = today.replace(day=1)
        kpis.append(_kpi("visits", "Medical visits this month", MedicalVisit.unscoped_objects.filter(school=school, visited_at__date__gte=month).count(), link="/medical/visits"))
    if _can(user, "discipline.view"):
        from apps.discipline.models import DisciplineIncident

        n = DisciplineIncident.unscoped_objects.filter(school=school).exclude(status=DisciplineIncident.Status.RESOLVED).count()
        kpis.append(_kpi("incidents", "Open discipline incidents", n, tone="warning" if n else "success", link="/discipline"))
    if _can(user, "complaints.view"):
        from apps.complaints.models import Complaint

        n = Complaint.unscoped_objects.filter(school=school, status__in=[Complaint.Status.SUBMITTED, Complaint.Status.UNDER_REVIEW]).count()
        kpis.append(_kpi("complaints", "Open complaints", n, tone="warning" if n else "success", link="/complaints"))
    if _can(user, "events.view"):
        from apps.events.models import Event

        kpis.append(_kpi("events", "Upcoming events", Event.unscoped_objects.filter(school=school, start_datetime__date__gte=today).count(), link="/events"))
    if _can(user, "inventory.view"):
        from apps.inventory.models import InventoryItem

        low = InventoryItem.unscoped_objects.filter(school=school, is_active=True, quantity_in_stock__lte=F("reorder_level")).count()
        kpis.append(_kpi("low_stock", "Low-stock items", low, tone="danger" if low else "success", link="/inventory/items"))
    if _can(user, "procurement.view"):
        from apps.procurement.models import PurchaseRequest

        n = PurchaseRequest.unscoped_objects.filter(school=school, status=PurchaseRequest.Status.SUBMITTED).count()
        kpis.append(_kpi("requests", "Purchase requests to review", n, tone="warning" if n else "success", link="/procurement/requests"))
    if _can(user, "admissions.view"):
        from apps.admissions.models import Application

        n = Application.unscoped_objects.filter(school=school, status__in=["submitted", "shortlisted", "interview_scheduled"]).count()
        kpis.append(_kpi("applications", "Applications to review", n, tone="warning" if n else "success", link="/admissions"))
    if _can(user, "results.view"):
        counts = _results_status_counts(school, ctx)
        waiting = counts.get("submitted", 0) + counts.get("reviewed", 0)
        kpis.append(_kpi("awaiting", "Results awaiting approval", waiting, tone="warning" if waiting else "success", link="/examinations/exams"))

    return {
        "title": f"{role_name} overview",
        "subtitle": "What your role gives you access to.",
        "kpis": kpis,
        "charts": charts,
        "tables": tables,
        "alerts": alerts,
        "actions": actions[:6],
        "unavailable": [],
    }
