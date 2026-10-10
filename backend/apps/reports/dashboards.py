"""Role dashboards: one payload shape for every role, so the frontend renders them all with the same components.

    {role, title, subtitle, kpis[], charts[], tables[], alerts[], actions[], unavailable[]}

Every number comes from the school's own records (always filtered by `school=` and run through `unscoped_objects`,
like the rest of this app's cross-cutting services), and a section is only built when the caller holds the permission
for that domain — a role that lacks it simply doesn't get the section. Calculations are defined once, here:

* attendance rate  = PRESENT / all daily (period-less) attendance records in the window
* collection rate  = amount_paid / total over non-cancelled invoices (what has been billed vs what has come in)
* outstanding      = sum of `balance` over non-cancelled invoices (the invoice model already nets payments,
                     discounts and refunds, so this matches the finance module exactly)
* collections      = Payment.amount for payments that are not fully refunded, less nothing else: a partially
                     refunded payment counts net of its refunds
"""

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Avg, Count, F, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

ZERO = Decimal("0.00")

# The roles that have a dashboard of their own, in the order a person holding several would land on if they hadn't
# chosen one (the role switcher normally decides).
ROLE_ORDER = ["principal", "school-administrator", "accountant", "exams-director", "teacher", "student"]


@dataclass
class Ctx:
    """What the dashboard is being asked about: the school, the person, and the optional filters.

    `term` / `klass` narrow the figures that belong to a term or a class. `compare_term` is the term the comparison
    section is about (the chosen term, else the school's current one) and `prev_term` the term just before it."""

    school: object
    user: object
    term: object = None
    klass: str | None = None
    compare_term: object = None
    prev_term: object = None

    def invoices(self, qs, via=""):
        if self.term is not None:
            qs = qs.filter(**{f"{via}term": self.term})
        if self.klass:
            qs = qs.filter(**{f"{via}student__current_class_id": self.klass})
        return qs

    def students(self, qs, via=""):
        return qs.filter(**{f"{via}current_class_id": self.klass}) if self.klass else qs

    def results(self, qs):
        if self.term is not None:
            qs = qs.filter(exam_schedule__exam__term=self.term)
        if self.klass:
            qs = qs.filter(exam_schedule__school_class_id=self.klass)
        return qs


# ---- payload helpers ------------------------------------------------------------------------------


def _kpi(key, label, value, *, fmt="number", tone="neutral", hint="", link=None):
    return {"key": key, "label": label, "value": value, "format": fmt, "tone": tone, "hint": hint, "link": link}


def _chart(key, title, kind, data, *, fmt="number", empty="No data for this period yet."):
    return {"key": key, "title": title, "kind": kind, "data": data, "format": fmt, "empty": empty}


def _table(key, title, columns, rows, *, link=None, empty="Nothing to show."):
    return {"key": key, "title": title, "columns": columns, "rows": rows, "link": link, "empty": empty}


def _alert(tone, message, link=None):
    return {"tone": tone, "message": message, "link": link}


def _rate(part, whole):
    # floats, not Decimals: the API would send a Decimal as a string, which the page can't format as a percentage
    return round(float(part) / float(whole) * 100, 1) if whole else None


def _num(value):
    return float(value or 0)


def _today(school):
    try:
        return timezone.now().astimezone(ZoneInfo(school.timezone or "UTC")).date()
    except Exception:  # noqa: BLE001 - an unknown zone name falls back to the server's date
        return timezone.localdate()


def _can(user, code):
    from apps.authorization.services import user_has_permission

    return user_has_permission(user, code)


# ---- shared building blocks -----------------------------------------------------------------------


def _attendance_trend(school, today, ctx, days=14):
    from apps.attendance.models import AttendanceStatus, StudentAttendance
    from django.db.models import Q

    start = today - timedelta(days=days - 1)
    rows = (
        ctx.students(StudentAttendance.unscoped_objects.filter(school=school, period__isnull=True, date__gte=start, date__lte=today), "student__")
        .values("date")
        .annotate(total=Count("id"), present=Count("id", filter=Q(status=AttendanceStatus.PRESENT)))
        .order_by("date")
    )
    return [{"label": r["date"].strftime("%d %b"), "value": _rate(r["present"], r["total"]) or 0} for r in rows]


def _attendance_rate_on(school, day, ctx):
    from apps.attendance.models import AttendanceStatus, StudentAttendance

    qs = ctx.students(StudentAttendance.unscoped_objects.filter(school=school, period__isnull=True, date=day), "student__")
    total = qs.count()
    return _rate(qs.filter(status=AttendanceStatus.PRESENT).count(), total), total


def _enrollment_by_class(school, ctx):
    from apps.students.models import Student

    rows = (
        ctx.students(Student.unscoped_objects.filter(school=school, status=Student.Status.ACTIVE))
        .values("current_class__name", "current_class__order")
        .annotate(n=Count("id"))
        .order_by("current_class__order", "current_class__name")
    )
    return [{"label": r["current_class__name"] or "No class", "value": r["n"]} for r in rows]


def _finance_totals(school, ctx):
    from apps.finance.models import Invoice

    active = ctx.invoices(Invoice.unscoped_objects.filter(school=school)).exclude(status=Invoice.Status.CANCELLED)
    totals = active.aggregate(billed=Sum("total"), collected=Sum("amount_paid"), outstanding=Sum("balance"))
    overdue = active.filter(
        due_date__lt=timezone.localdate(), status__in=[Invoice.Status.UNPAID, Invoice.Status.PARTIALLY_PAID]
    ).aggregate(n=Count("id"), amount=Sum("balance"))
    return {
        "billed": totals["billed"] or ZERO,
        "collected": totals["collected"] or ZERO,
        "outstanding": totals["outstanding"] or ZERO,
        "overdue_count": overdue["n"] or 0,
        "overdue_amount": overdue["amount"] or ZERO,
    }


def _collections_by_month(school, ctx, months=6):
    from apps.finance.models import Payment

    start = (timezone.now() - timedelta(days=31 * months)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = (
        ctx.invoices(Payment.unscoped_objects.filter(school=school, paid_at__gte=start), "invoice__")
        .exclude(status=Payment.Status.REFUNDED)
        .annotate(month=TruncMonth("paid_at"))
        .values("month")
        .annotate(total=Sum("amount"))
        .order_by("month")
    )
    return [{"label": r["month"].strftime("%b %Y"), "value": _num(r["total"])} for r in rows]


def _outstanding_by_class(school, ctx):
    from apps.finance.models import Invoice

    rows = (
        ctx.invoices(Invoice.unscoped_objects.filter(school=school))
        .exclude(status=Invoice.Status.CANCELLED)
        .values("student__current_class__name", "student__current_class__order")
        .annotate(total=Sum("balance"))
        .filter(total__gt=0)
        .order_by("student__current_class__order")
    )
    return [{"label": r["student__current_class__name"] or "No class", "value": _num(r["total"])} for r in rows]


def _results_status_counts(school, ctx):
    from apps.examinations.models import Result

    counts = {r["status"]: r["n"] for r in ctx.results(Result.unscoped_objects.filter(school=school)).values("status").annotate(n=Count("id"))}
    return counts


# ---- role builders --------------------------------------------------------------------------------


def principal(school, user, ctx):
    today = _today(school)
    kpis, charts, tables, alerts, unavailable = [], [], [], [], []

    if _can(user, "students.view"):
        from apps.students.models import Student

        kpis.append(_kpi("students", "Active students", ctx.students(Student.unscoped_objects.filter(school=school, status=Student.Status.ACTIVE)).count(), link="/students"))
        charts.append(_chart("enrollment", "Enrollment by class", "bar", _enrollment_by_class(school, ctx)))
    if _can(user, "staff.view"):
        from apps.staff.models import Staff

        kpis.append(_kpi("staff", "Active staff", Staff.unscoped_objects.filter(school=school, employment_status=Staff.EmploymentStatus.ACTIVE).count(), link="/staff"))
    if _can(user, "attendance.view"):
        rate, total = _attendance_rate_on(school, today, ctx)
        tone = "neutral" if rate is None else "success" if rate >= 90 else "warning" if rate >= 75 else "danger"
        kpis.append(_kpi("attendance", "Today's attendance", rate, fmt="percent", tone=tone, hint=f"{total} daily records today" if total else "Not taken yet today", link="/attendance"))
        charts.append(_chart("attendance", "Attendance rate, last 14 days", "line", _attendance_trend(school, today, ctx), fmt="percent"))
        if rate is not None and rate < 75:
            alerts.append(_alert("danger", f"Attendance today is {rate}% — below 75%.", "/attendance"))
    if _can(user, "fees.view"):
        f = _finance_totals(school, ctx)
        rate = _rate(f["collected"], f["billed"])
        kpis.append(_kpi("collection", "Fee collection rate", rate, fmt="percent", hint="Paid ÷ billed, all invoices", link="/finance/invoices"))
        kpis.append(_kpi("outstanding", "Outstanding fees", _num(f["outstanding"]), fmt="currency", tone="warning" if f["outstanding"] > 0 else "neutral", link="/finance/invoices"))
        charts.append(_chart("collections", "Collections by month", "bar", _collections_by_month(school, ctx), fmt="currency"))
        charts.append(_chart("outstanding_class", "Outstanding fees by class", "bar", _outstanding_by_class(school, ctx), fmt="currency"))
        if f["overdue_count"]:
            alerts.append(_alert("warning", f"{f['overdue_count']} overdue invoices totalling {_num(f['overdue_amount']):,.2f}.", "/finance/invoices"))
    if _can(user, "results.view"):
        counts = _results_status_counts(school, ctx)
        waiting = counts.get("submitted", 0) + counts.get("reviewed", 0)
        kpis.append(_kpi("awaiting", "Results awaiting approval", waiting, tone="warning" if waiting else "success", link="/examinations/exams"))
        if waiting:
            alerts.append(_alert("warning", f"{waiting} results are waiting for approval.", "/examinations/exams"))
    if _can(user, "academics.view"):
        from apps.academics.models import SchoolClass

        kpis.append(_kpi("classes", "Classes", SchoolClass.unscoped_objects.filter(school=school).count(), link="/academics"))
    unavailable.append({"label": "Expenses and net cash movement", "reason": "The system has no expense records yet."})
    return {
        "title": "School overview",
        "subtitle": "How the school is doing right now.",
        "kpis": kpis, "charts": charts, "tables": tables, "alerts": alerts,
        "actions": [{"label": "Students", "to": "/students"}, {"label": "Attendance", "to": "/attendance"}, {"label": "Reports", "to": "/reports"}],
        "unavailable": unavailable,
    }


def school_administrator(school, user, ctx):
    from apps.academics.models import Section
    from apps.admissions.models import Application
    from apps.students.models import Student

    kpis, charts, tables, alerts = [], [], [], []
    if _can(user, "students.view"):
        kpis.append(_kpi("students", "Active students", ctx.students(Student.unscoped_objects.filter(school=school, status=Student.Status.ACTIVE)).count(), link="/students"))
        charts.append(_chart("enrollment", "Enrollment by class", "bar", _enrollment_by_class(school, ctx)))
    if _can(user, "staff.view"):
        from apps.staff.models import Staff

        kpis.append(_kpi("staff", "Active staff", Staff.unscoped_objects.filter(school=school, employment_status=Staff.EmploymentStatus.ACTIVE).count(), link="/staff"))
    if _can(user, "admissions.view"):
        apps_qs = Application.unscoped_objects.filter(school=school)
        by_status = {r["status"]: r["n"] for r in apps_qs.values("status").annotate(n=Count("id"))}
        pending = by_status.get("submitted", 0) + by_status.get("shortlisted", 0) + by_status.get("interview_scheduled", 0)
        kpis.append(_kpi("pending_apps", "Pending applications", pending, tone="warning" if pending else "success", link="/admissions"))
        kpis.append(_kpi("accepted", "Accepted applications", by_status.get("accepted", 0), link="/admissions"))
        charts.append(_chart("apps", "Applications by status", "pie", [{"label": k.replace("_", " ").title(), "value": v} for k, v in by_status.items()]))
        recent = apps_qs.order_by("-created_at")[:8]
        tables.append(_table("recent_apps", "Latest applications", ["Applicant", "Status", "Received"],
                             [[f"{a.first_name} {a.last_name}".strip(), a.get_status_display(), a.created_at.strftime("%d %b %Y")] for a in recent],
                             link="/admissions", empty="No applications yet."))
        if pending:
            alerts.append(_alert("info", f"{pending} applications need review.", "/admissions"))
    if _can(user, "academics.view"):
        sections = list(Section.unscoped_objects.filter(school=school, academic_year__is_current=True).select_related("school_class"))
        counts = {
            r["current_section"]: r["n"]
            for r in Student.unscoped_objects.filter(school=school, status=Student.Status.ACTIVE, current_section__isnull=False)
            .values("current_section").annotate(n=Count("id"))
        }
        kpis.append(_kpi("sections", "Sections this year", len(sections), link="/academics"))
        full = [(s, counts.get(s.id, 0)) for s in sections if counts.get(s.id, 0) >= s.capacity]
        tables.append(_table("capacity", "Class capacity", ["Class / section", "Students", "Capacity"],
                             [[f"{s.school_class.name} {s.name}", counts.get(s.id, 0), s.capacity] for s in sorted(sections, key=lambda s: -(counts.get(s.id, 0) / (s.capacity or 1)))[:8]],
                             link="/academics", empty="No sections set up for the current year."))
        if full:
            alerts.append(_alert("warning", f"{len(full)} section(s) are at or over capacity.", "/academics"))
    return {
        "title": "Administration overview",
        "subtitle": "Admissions, enrollment and staffing at a glance.",
        "kpis": kpis, "charts": charts, "tables": tables, "alerts": alerts,
        "actions": [{"label": "Register a student", "to": "/students"}, {"label": "Review admissions", "to": "/admissions"}, {"label": "Staff", "to": "/staff"}],
        "unavailable": [],
    }


def accountant(school, user, ctx):
    from apps.finance.models import Invoice, Payment, Refund

    kpis, charts, tables, alerts = [], [], [], []
    if not _can(user, "fees.view"):
        return {"title": "Finance overview", "subtitle": "", "kpis": [], "charts": [], "tables": [], "alerts": [], "actions": [], "unavailable": []}
    f = _finance_totals(school, ctx)
    today = _today(school)
    todays = (
        Payment.unscoped_objects.filter(school=school, paid_at__date=today).exclude(status=Payment.Status.REFUNDED).aggregate(t=Sum("amount"))["t"]
        or ZERO
    )
    refunds = Refund.unscoped_objects.filter(school=school).aggregate(t=Sum("amount"))["t"] or ZERO
    kpis += [
        _kpi("billed", "Fees billed", _num(f["billed"]), fmt="currency", link="/finance/invoices"),
        _kpi("collected", "Collected", _num(f["collected"]), fmt="currency", tone="success", hint="Net of refunds", link="/finance/invoices"),
        _kpi("outstanding", "Outstanding", _num(f["outstanding"]), fmt="currency", tone="warning" if f["outstanding"] > 0 else "neutral", link="/finance/invoices"),
        _kpi("overdue", "Overdue", _num(f["overdue_amount"]), fmt="currency", tone="danger" if f["overdue_count"] else "neutral", hint=f"{f['overdue_count']} invoices", link="/finance/invoices"),
        _kpi("today", "Collected today", _num(todays), fmt="currency"),
        _kpi("rate", "Collection rate", _rate(f["collected"], f["billed"]), fmt="percent", hint="Paid ÷ billed"),
        _kpi("refunds", "Refunds issued", _num(refunds), fmt="currency"),
    ]
    charts.append(_chart("collections", "Collections by month", "line", _collections_by_month(school, ctx), fmt="currency"))
    charts.append(_chart("outstanding_class", "Outstanding fees by class", "bar", _outstanding_by_class(school, ctx), fmt="currency"))
    methods = (
        Payment.unscoped_objects.filter(school=school).exclude(status=Payment.Status.REFUNDED)
        .values("method").annotate(t=Sum("amount")).order_by("-t")
    )
    charts.append(_chart("methods", "Payment methods", "pie", [{"label": dict(Payment.Method.choices).get(m["method"], m["method"]), "value": _num(m["t"])} for m in methods], fmt="currency"))
    status_rows = Invoice.unscoped_objects.filter(school=school).values("status").annotate(n=Count("id"))
    charts.append(_chart("invoice_status", "Invoices by status", "pie", [{"label": dict(Invoice.Status.choices).get(r["status"], r["status"]), "value": r["n"]} for r in status_rows]))
    recent = ctx.invoices(Payment.unscoped_objects.filter(school=school), "invoice__").select_related("invoice__student").order_by("-paid_at")[:8]
    tables.append(_table("recent_payments", "Recent payments", ["Receipt", "Student", "Amount", "Method", "Date"],
                         [[p.receipt_number, p.invoice.student.full_name, f"{p.amount:,.2f}", p.get_method_display(), p.paid_at.strftime("%d %b %Y")] for p in recent],
                         link="/finance/invoices", empty="No payments recorded yet."))
    overdue = (
        ctx.invoices(Invoice.unscoped_objects.filter(school=school, due_date__lt=timezone.localdate(), status__in=[Invoice.Status.UNPAID, Invoice.Status.PARTIALLY_PAID]))
        .select_related("student").order_by("-balance")[:8]
    )
    tables.append(_table("overdue", "Largest overdue balances", ["Invoice", "Student", "Due", "Balance"],
                         [[i.invoice_number, i.student.full_name, i.due_date.strftime("%d %b %Y"), f"{i.balance:,.2f}"] for i in overdue],
                         link="/finance/invoices", empty="No overdue invoices."))
    if f["overdue_count"]:
        alerts.append(_alert("warning", f"{f['overdue_count']} invoices are overdue ({_num(f['overdue_amount']):,.2f}).", "/finance/invoices"))
    return {
        "title": "Finance overview", "subtitle": "Billing, collections and balances.",
        "kpis": kpis, "charts": charts, "tables": tables, "alerts": alerts,
        "actions": [{"label": "Record a payment", "to": "/finance/payments"}, {"label": "Invoices", "to": "/finance/invoices"}],
        "unavailable": [{"label": "Expenses and net cash movement", "reason": "The system has no expense records yet."}],
    }


def exams_director(school, user, ctx):
    from apps.examinations.models import Exam, ExamSchedule, Result

    kpis, charts, tables, alerts = [], [], [], []
    if not _can(user, "examinations.view"):
        return {"title": "Examinations", "subtitle": "", "kpis": [], "charts": [], "tables": [], "alerts": [], "actions": [], "unavailable": []}
    today = _today(school)
    exams = Exam.unscoped_objects.filter(school=school)
    counts = _results_status_counts(school, ctx)
    waiting = counts.get("submitted", 0) + counts.get("reviewed", 0)
    kpis += [
        _kpi("running", "Exams running now", exams.filter(start_date__lte=today, end_date__gte=today).count(), link="/examinations/exams"),
        _kpi("upcoming", "Upcoming exams", exams.filter(start_date__gt=today).count(), link="/examinations/exams"),
        _kpi("draft", "Results in draft", counts.get("draft", 0), link="/examinations/exams"),
        _kpi("awaiting", "Awaiting review / approval", waiting, tone="warning" if waiting else "success", link="/examinations/exams"),
        _kpi("approved", "Approved, not published", counts.get("approved", 0), link="/examinations/exams"),
        _kpi("published", "Published results", counts.get("published", 0) + counts.get("locked", 0), tone="success", link="/examinations/exams"),
    ]
    order = ["draft", "submitted", "reviewed", "approved", "published", "locked"]
    charts.append(_chart("workflow", "Results by workflow stage", "bar", [{"label": s.title(), "value": counts.get(s, 0)} for s in order]))
    official = ctx.results(Result.unscoped_objects.filter(school=school, status__in=[Result.Status.PUBLISHED, Result.Status.LOCKED]))
    by_subject = official.values("exam_schedule__subject__name").annotate(a=Avg("score")).order_by("exam_schedule__subject__name")
    charts.append(_chart("subjects", "Average score by subject (published)", "bar", [{"label": r["exam_schedule__subject__name"], "value": round(float(r["a"] or 0), 1)} for r in by_subject]))
    upcoming = (
        ExamSchedule.unscoped_objects.filter(school=school, date__gte=today).select_related("exam", "subject", "school_class").order_by("date")[:8]
    )
    tables.append(_table("upcoming", "Upcoming papers", ["Date", "Exam", "Class", "Subject"],
                         [[s.date.strftime("%d %b %Y"), s.exam.name, s.school_class.name, s.subject.name] for s in upcoming],
                         link="/examinations/exams", empty="No upcoming papers scheduled."))
    if waiting:
        alerts.append(_alert("warning", f"{waiting} results are waiting for review or approval.", "/examinations/exams"))
    return {
        "title": "Examinations", "subtitle": "Where results are in the workflow.",
        "kpis": kpis, "charts": charts, "tables": tables, "alerts": alerts,
        "actions": [{"label": "Examinations", "to": "/examinations/exams"}],
        "unavailable": [],
    }


def teacher(school, user, ctx):
    from apps.academics.models import SubjectOffering
    from apps.assignments.models import Assignment, AssignmentSubmission
    from apps.students.models import Student
    from apps.timetable.models import TimetableEntry
    from django.db.models import Q

    staff = getattr(user, "staff_profile", None)
    if staff is None:
        return {"title": "My teaching", "subtitle": "Your account isn't linked to a staff record.", "kpis": [], "charts": [], "tables": [], "alerts": [], "actions": [], "unavailable": []}
    today = _today(school)
    offerings = SubjectOffering.unscoped_objects.filter(school=school).filter(Q(main_teacher=staff) | Q(assistant_teacher=staff))
    class_ids = set(offerings.values_list("school_class_id", flat=True))
    students = Student.unscoped_objects.filter(school=school, status=Student.Status.ACTIVE, current_class_id__in=class_ids).count()
    day = today.strftime("%A").lower()
    lessons = list(
        TimetableEntry.unscoped_objects.filter(school=school, teacher=staff, day_of_week=day)
        .select_related("period", "subject", "section__school_class", "room").order_by("period__order")
    )
    my_assignments = Assignment.unscoped_objects.filter(school=school, teacher=staff)
    ungraded = AssignmentSubmission.unscoped_objects.filter(school=school, assignment__in=my_assignments).exclude(status=AssignmentSubmission.Status.GRADED)
    ungraded_n = ungraded.count()
    kpis = [
        _kpi("classes", "Classes I teach", len(class_ids), link="/my-subjects"),
        _kpi("subjects", "Subject offerings", offerings.count(), link="/subjects"),
        _kpi("students", "Students in my classes", students),
        _kpi("lessons", "Lessons today", len(lessons), link="/my-timetable"),
        _kpi("marking", "Submissions to mark", ungraded_n, tone="warning" if ungraded_n else "success", link="/assignments"),
    ]
    status_rows = AssignmentSubmission.unscoped_objects.filter(school=school, assignment__in=my_assignments).values("status").annotate(n=Count("id"))
    charts = [_chart("submissions", "My assignment submissions", "pie", [{"label": r["status"].title(), "value": r["n"]} for r in status_rows])]
    avg = (
        AssignmentSubmission.unscoped_objects.filter(school=school, assignment__in=my_assignments, score__isnull=False)
        .values("assignment__title").annotate(a=Avg("score")).order_by("-assignment__due_date")[:8]
    )
    charts.append(_chart("avg", "Average score on recent assignments", "bar", [{"label": r["assignment__title"][:24], "value": round(float(r["a"] or 0), 1)} for r in avg]))
    tables = [
        _table("today", "Today's lessons", ["Time", "Class", "Subject", "Room"],
               [[f"{l.period.start_time:%H:%M}–{l.period.end_time:%H:%M}", f"{l.section.school_class.name} {l.section.name}", l.subject.name if l.subject else "—", l.room.name if l.room else "—"] for l in lessons],
               link="/my-timetable", empty="No lessons scheduled for you today."),
        _table("to_mark", "Waiting to be marked", ["Student", "Assignment", "Submitted"],
               [[s.student.full_name, s.assignment.title, s.submitted_at.strftime("%d %b %H:%M")] for s in ungraded.select_related("student", "assignment").order_by("submitted_at")[:8]],
               link="/assignments", empty="Nothing waiting to be marked."),
    ]
    alerts = [_alert("info", f"{ungraded_n} submissions are waiting for your marks.", "/assignments")] if ungraded_n else []
    return {
        "title": "My teaching", "subtitle": "Your classes, lessons and marking.",
        "kpis": kpis, "charts": charts, "tables": tables, "alerts": alerts,
        "actions": [{"label": "Take attendance", "to": "/attendance"}, {"label": "Assignments", "to": "/assignments"}, {"label": "My subjects", "to": "/my-subjects"}],
        "unavailable": [],
    }


def student(school, user, ctx):
    from apps.assignments.models import Assignment, AssignmentSubmission
    from apps.attendance.models import AttendanceStatus, StudentAttendance
    from apps.examinations.models import ExamSchedule, Result
    from apps.timetable.models import TimetableEntry

    me = getattr(user, "student_profile", None)
    if me is None:
        return {"title": "My dashboard", "subtitle": "Your account isn't linked to a student record.", "kpis": [], "charts": [], "tables": [], "alerts": [], "actions": [], "unavailable": []}
    today = _today(school)
    att = StudentAttendance.unscoped_objects.filter(school=school, student=me, period__isnull=True)
    att_total = att.count()
    att_rate = _rate(att.filter(status=AttendanceStatus.PRESENT).count(), att_total)
    mine = Assignment.unscoped_objects.filter(school=school, school_class=me.current_class_id, due_date__gte=timezone.now())
    if me.current_section_id:
        from django.db.models import Q

        mine = mine.filter(Q(section__isnull=True) | Q(section_id=me.current_section_id))
    done = set(AssignmentSubmission.unscoped_objects.filter(school=school, student=me).values_list("assignment_id", flat=True))
    pending = [a for a in mine.order_by("due_date")[:30] if a.id not in done]
    official = Result.unscoped_objects.filter(school=school, student=me, status__in=[Result.Status.PUBLISHED, Result.Status.LOCKED])
    average = official.aggregate(a=Avg("score"))["a"]
    exams = list(
        ExamSchedule.unscoped_objects.filter(school=school, school_class_id=me.current_class_id, date__gte=today)
        .select_related("exam", "subject").order_by("date")[:6]
    )
    day = today.strftime("%A").lower()
    lessons = list(
        TimetableEntry.unscoped_objects.filter(school=school, section_id=me.current_section_id, day_of_week=day)
        .select_related("period", "subject", "teacher__user").order_by("period__order")
    ) if me.current_section_id else []
    kpis = [
        _kpi("attendance", "My attendance", att_rate, fmt="percent", tone="neutral" if att_rate is None else "success" if att_rate >= 90 else "warning" if att_rate >= 75 else "danger", hint=f"{att_total} days recorded" if att_total else "No attendance recorded yet", link="/my-attendance"),
        _kpi("average", "Published results average", round(float(average), 1) if average is not None else None, hint="Only results your school has published"),
        _kpi("pending", "Assignments due", len(pending), tone="warning" if pending else "success", link="/assignments"),
        _kpi("exams", "Upcoming exam papers", len(exams)),
    ]
    by_subject = official.values("exam_schedule__subject__name").annotate(a=Avg("score")).order_by("exam_schedule__subject__name")
    charts = [_chart("subjects", "My average by subject", "bar", [{"label": r["exam_schedule__subject__name"], "value": round(float(r["a"] or 0), 1)} for r in by_subject], empty="No published results yet.")]
    tables = [
        _table("today", "Today's timetable", ["Time", "Subject", "Teacher"],
               [[f"{l.period.start_time:%H:%M}–{l.period.end_time:%H:%M}", l.subject.name if l.subject else "—", l.teacher.user.full_name if l.teacher else "—"] for l in lessons],
               link="/my-timetable", empty="No lessons today."),
        _table("assignments", "Assignments due", ["Assignment", "Due"], [[a.title, a.due_date.strftime("%d %b %H:%M")] for a in pending[:8]], link="/assignments", empty="You're all caught up."),
        _table("exam_papers", "Upcoming exam papers", ["Date", "Exam", "Subject"], [[e.date.strftime("%d %b %Y"), e.exam.name, e.subject.name] for e in exams], empty="No exam papers scheduled."),
    ]
    return {
        "title": "My dashboard", "subtitle": f"{me.current_class.name if me.current_class_id else 'Your school'} · your week at a glance.",
        "kpis": kpis, "charts": charts, "tables": tables, "alerts": [],
        "actions": [{"label": "My timetable", "to": "/my-timetable"}, {"label": "My subjects", "to": "/my-subjects"}],
        "unavailable": [],
    }


BUILDERS = {
    "principal": principal,
    "school-administrator": school_administrator,
    "accountant": accountant,
    "exams-director": exams_director,
    "teacher": teacher,
    "student": student,
}


def resolve_role(user) -> str | None:
    """Which role's dashboard to show: the one the person is working as (role switcher), else the first they hold."""
    from apps.authorization.models import UserRole
    from apps.authorization.services import active_role_slug

    active = active_role_slug(user)
    if active in BUILDERS:
        return active
    if active:
        return None  # working as a role without a dedicated dashboard (a custom role): the permission-built one is used
    if getattr(user, "student_profile", None) is not None:
        return "student"
    held = set(UserRole.unscoped_objects.filter(user=user, role__is_active=True).values_list("role__slug", flat=True))
    return next((slug for slug in ROLE_ORDER if slug in held), None)


# ---- term comparison ------------------------------------------------------------------------------

# Which comparisons each role gets, and whether a higher value is the good direction.
COMPARISONS = {
    "principal": ["attendance", "collection", "average", "admissions"],
    "school-administrator": ["admissions", "attendance"],
    "accountant": ["collection", "billed"],
    "exams-director": ["average"],
}


def _term_metrics(school, term, ctx):
    """The same figures for one term, so two terms can be set side by side. Each is None when the term has no data."""
    from apps.attendance.models import AttendanceStatus, StudentAttendance
    from apps.examinations.models import Result
    from apps.finance.models import Invoice
    from apps.students.models import Student

    att = ctx.students(
        StudentAttendance.unscoped_objects.filter(school=school, period__isnull=True, date__gte=term.start_date, date__lte=term.end_date),
        "student__",
    )
    att_total = att.count()
    inv = ctx.students(Invoice.unscoped_objects.filter(school=school, term=term).exclude(status=Invoice.Status.CANCELLED), "student__")
    totals = inv.aggregate(billed=Sum("total"), paid=Sum("amount_paid"))
    scores = ctx.students(
        Result.unscoped_objects.filter(
            school=school, exam_schedule__exam__term=term, status__in=[Result.Status.PUBLISHED, Result.Status.LOCKED]
        ),
        "student__",
    ).aggregate(a=Avg("score"))["a"]
    admitted = ctx.students(
        Student.unscoped_objects.filter(school=school, admission_date__gte=term.start_date, admission_date__lte=term.end_date)
    ).count()
    return {
        "attendance": _rate(att.filter(status=AttendanceStatus.PRESENT).count(), att_total),
        "collection": _rate(totals["paid"] or 0, totals["billed"] or 0),
        "billed": _num(totals["billed"]) if totals["billed"] is not None else None,
        "average": round(float(scores), 1) if scores is not None else None,
        "admissions": admitted,
    }


COMPARISON_META = {
    "attendance": ("Attendance rate", "percent"),
    "collection": ("Fee collection rate", "percent"),
    "billed": ("Fees billed", "currency"),
    "average": ("Average published score", "number"),
    "admissions": ("New admissions", "number"),
}


def _comparison_block(school, role, ctx):
    wanted = COMPARISONS.get(role)
    if not wanted or ctx.compare_term is None:
        return None
    cur = _term_metrics(school, ctx.compare_term, ctx)
    prev = _term_metrics(school, ctx.prev_term, ctx) if ctx.prev_term is not None else None
    rows = []
    for key in wanted:
        label, fmt = COMPARISON_META[key]
        now = cur[key]
        before = prev[key] if prev else None
        delta = None if now is None or before is None else round(now - before, 1)
        # A percentage change against a zero baseline is meaningless, so it is left out rather than shown as infinite.
        pct = None if delta is None or not before else round(delta / before * 100, 1)
        rows.append({"key": key, "label": label, "format": fmt, "current": now, "previous": before, "delta": delta, "delta_pct": pct})
    return {
        "current": {"id": str(ctx.compare_term.id), "name": ctx.compare_term.name, "year": ctx.compare_term.academic_year.name},
        "previous": (
            {"id": str(ctx.prev_term.id), "name": ctx.prev_term.name, "year": ctx.prev_term.academic_year.name} if ctx.prev_term else None
        ),
        "rows": rows,
    }


def _filter_options(school, role):
    from apps.academics.models import SchoolClass, Term

    if role in ("student", "teacher"):
        return None
    terms = Term.unscoped_objects.filter(school=school).select_related("academic_year").order_by("-start_date")[:24]
    return {
        "terms": [{"id": str(t.id), "name": f"{t.academic_year.name} · {t.name}", "is_current": t.is_current} for t in terms],
        "classes": [{"id": str(c.id), "name": c.name} for c in SchoolClass.unscoped_objects.filter(school=school).order_by("order", "name")],
    }


def _parse_filters(school, params):
    """Validates the filter ids: they must belong to this school, so another school's id can't be probed."""
    import uuid

    from apps.academics.models import SchoolClass, Term

    def valid(raw):
        try:
            return str(uuid.UUID(str(raw)))
        except (ValueError, TypeError):
            return None

    term = klass = None
    if params.get("term") and (tid := valid(params.get("term"))):
        term = Term.unscoped_objects.select_related("academic_year").filter(school=school, pk=tid).first()
    if params.get("school_class") and (cid := valid(params.get("school_class"))):
        klass = SchoolClass.unscoped_objects.filter(school=school, pk=cid).values_list("pk", flat=True).first()
    return term, (str(klass) if klass else None)


def build_role_dashboard(school, user, params=None) -> dict:
    role = resolve_role(user)
    if role is None:
        # A role the school created itself has no dedicated dashboard: build one from the permissions it holds.
        from apps.authorization.models import UserRole
        from apps.authorization.services import active_role_slug, get_user_permission_codes

        from .custom_dashboards import custom_role_dashboard

        if get_user_permission_codes(user):
            active = active_role_slug(user)
            rows = UserRole.unscoped_objects.filter(user=user, role__is_active=True).select_related("role")
            if active:
                rows = rows.filter(role__slug=active)
            first = rows.first()
            ctx = Ctx(school=school, user=user)
            return {
                "role": "custom",
                **custom_role_dashboard(school, user, ctx, first.role.name if first else "Your role"),
                "filters": None,
                "comparison": None,
            }
        return {"role": None, "title": "Dashboard", "subtitle": "", "kpis": [], "charts": [], "tables": [], "alerts": [], "actions": [], "unavailable": [], "filters": None, "comparison": None}
    from apps.academics.models import Term

    term, klass = _parse_filters(school, params or {}) if role not in ("student", "teacher") else (None, None)
    compare = term
    if compare is None:
        compare = Term.unscoped_objects.select_related("academic_year").filter(school=school, is_current=True).first()
    prev = None
    if compare is not None:
        prev = (
            Term.unscoped_objects.select_related("academic_year")
            .filter(school=school, end_date__lt=compare.start_date)
            .order_by("-end_date")
            .first()
        )
    ctx = Ctx(school=school, user=user, term=term, klass=klass, compare_term=compare, prev_term=prev)
    data = BUILDERS[role](school, user, ctx)
    return {
        "role": role,
        **data,
        "filters": {"options": _filter_options(school, role), "applied": {"term": str(term.id) if term else None, "school_class": klass}},
        "comparison": _comparison_block(school, role, ctx),
    }
