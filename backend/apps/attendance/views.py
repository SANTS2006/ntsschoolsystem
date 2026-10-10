from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response


from apps.academics.models import Section, Subject
from apps.academics.services import assert_year_not_archived
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.parents.services import notify_student_guardians
from apps.students.models import Student
from apps.tenants.services import get_current_school

from .models import AttendanceStatus, StaffAttendance, StudentAttendance
from .serializers import (
    BulkMarkStudentAttendanceSerializer,
    StaffAttendanceSerializer,
    StudentAttendanceSerializer,
)

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "bulk_mark": "create",
    "stats": "view",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _notify_if_absent(record: StudentAttendance):
    """Absence is the one attendance outcome a guardian needs to hear about same-day —
    present/late/excused/early-departure don't warrant a push for every student, every day."""
    if record.status != AttendanceStatus.ABSENT:
        return
    notify_student_guardians(
        record.student,
        category="attendance",
        title="Absence recorded",
        message=f"{record.student.full_name} was marked absent on {record.date:%Y-%m-%d}.",
        link="/attendance/students",
        email_subject=f"Absence recorded: {record.student.full_name}",
        email_html=f"<p>{record.student.full_name} was marked absent on {record.date:%Y-%m-%d}.</p>",
    )


class StudentAttendanceViewSet(TenantScopedModelViewSet):
    serializer_class = StudentAttendanceSerializer
    filterset_fields = ["student", "date", "section", "subject", "status"]
    ordering_fields = ["date"]

    def get_permissions(self):
        code = f"attendance.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return StudentAttendance.objects.select_related("student", "section", "subject").all()

    def perform_create(self, serializer):
        record = serializer.save(school=get_current_school(), recorded_by=self.request.user)
        _notify_if_absent(record)

    @action(detail=False, methods=["post"], url_path="bulk-mark")
    def bulk_mark(self, request):
        """
        Marks a whole class's daily attendance for one subject in one call (`period` is always
        null here — daily, per-subject attendance, not a timetable-period one). Idempotent by
        design (update_or_create per student) — re-submitting to correct a mistake overwrites the
        prior entry rather than conflicting with it; the DB unique constraint on
        (student, date, period) is what actually prevents two different records for the same
        student/date from ever coexisting.
        """
        serializer = BulkMarkStudentAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        school = get_current_school()

        section = get_object_or_404(Section, pk=data["section"], school=school)
        subject = get_object_or_404(Subject, pk=data["subject"], school=school)
        try:
            assert_year_not_archived(section.academic_year)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        results = []
        with transaction.atomic():
            for entry in data["entries"]:
                student = get_object_or_404(Student, pk=entry["student_id"], school=school)
                record, _created = StudentAttendance.objects.update_or_create(
                    school=school,
                    student=student,
                    date=data["date"],
                    period=None,
                    defaults={
                        "status": entry["status"],
                        "notes": entry.get("notes", ""),
                        "section": section,
                        "subject": subject,
                        "recorded_by": request.user,
                    },
                )
                results.append(record)

        for record in results:
            _notify_if_absent(record)

        return _ok(
            f"Marked attendance for {len(results)} student(s).",
            results=StudentAttendanceSerializer(results, many=True).data,
        )

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.filter_queryset(self.get_queryset())
        counts = {row["status"]: row["count"] for row in qs.values("status").annotate(count=Count("id"))}
        return _ok(stats={code: counts.get(code, 0) for code, _label in AttendanceStatus.choices})


class StaffAttendanceViewSet(TenantScopedModelViewSet):
    serializer_class = StaffAttendanceSerializer
    filterset_fields = ["staff", "date", "status"]
    ordering_fields = ["date"]
    summary_stats = {
        "total": {},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        code = f"staff_attendance.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return StaffAttendance.objects.select_related("staff__user").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school(), recorded_by=self.request.user)


class MyStudentAttendanceView(TenantScopedAPIView):
    """Student self-service: this student's own attendance history, read-only — no permission
    gate (a student holds no RBAC permissions at all beyond the "student" role's narrow grants),
    same pattern as MyResultsView/MyLessonsView elsewhere in this codebase."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(records=[])
        records = StudentAttendance.objects.filter(student=student_profile).select_related("section", "subject")
        return _ok(records=StudentAttendanceSerializer(records, many=True).data)


class MyStaffAttendanceView(TenantScopedAPIView):
    """Staff self-service: this staff member's own attendance history, read-only — a teacher or
    any other staff role with no staff_attendance.* grant can still see their own record once a
    Principal/School Administrator has marked it."""

    def get(self, request):
        staff_profile = getattr(request.user, "staff_profile", None)
        if staff_profile is None:
            return _ok(records=[])
        records = StaffAttendance.objects.filter(staff=staff_profile).select_related("recorded_by")
        return _ok(records=StaffAttendanceSerializer(records, many=True).data)
