from rest_framework.response import Response

from apps.authentication.serializers import SchoolSummarySerializer
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from .models import Exam, ExamSchedule, GradeBoundary, GradingScale, Result
from .serializers import (
    ExamScheduleSerializer,
    ExamSerializer,
    GradeBoundarySerializer,
    GradingScaleSerializer,
)

_EXAM_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class ExaminationsModelViewSet(TenantScopedModelViewSet):
    """Shared permission wiring for the examinations.* codes (exam/schedule config, not results)."""

    def get_permissions(self):
        code = f"examinations.{_EXAM_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]


class GradingScaleViewSet(ExaminationsModelViewSet):
    serializer_class = GradingScaleSerializer
    search_fields = ["name"]
    summary_stats = {
        "total": {},
        "default": {"is_default": True},
    }

    def get_queryset(self):
        return GradingScale.objects.all()


class GradeBoundaryViewSet(ExaminationsModelViewSet):
    serializer_class = GradeBoundarySerializer
    filterset_fields = ["grading_scale"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return GradeBoundary.objects.select_related("grading_scale").all()


class ExamViewSet(ExaminationsModelViewSet):
    serializer_class = ExamSerializer
    filterset_fields = ["term", "exam_type"]
    search_fields = ["name"]
    ordering_fields = ["start_date"]
    summary_stats = {
        "total": {},
        "by_exam_type": {"groupby": "exam_type"},
    }

    def get_queryset(self):
        return Exam.objects.select_related("term", "grading_scale").all()


class ExamScheduleViewSet(ExaminationsModelViewSet):
    serializer_class = ExamScheduleSerializer
    filterset_fields = ["exam", "school_class", "subject"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return ExamSchedule.objects.select_related("exam", "school_class", "subject").all()



class MyTranscriptView(TenantScopedAPIView):
    """
    Student self-service: this student's own transcript. No permission gate — same
    identity-keyed pattern as MyAssignmentsView — only published/locked results count (a
    draft/in-review mark isn't final), grouped by term, with the school's own name/logo embedded
    so the rendered page is visibly that school's transcript.
    """

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        school = get_current_school()
        school_data = SchoolSummarySerializer(school).data if school else None
        if student_profile is None:
            return _ok(school=school_data, student=None, terms=[])

        qs = Result.objects.filter(
            student=student_profile, status__in=[Result.Status.PUBLISHED, Result.Status.LOCKED]
        ).select_related("exam_schedule__exam__term", "exam_schedule__subject")

        terms: dict[str, dict] = {}
        for r in qs:
            term = r.exam_schedule.exam.term
            bucket = terms.setdefault(
                str(term.id), {"id": str(term.id), "name": term.name, "results": []}
            )
            bucket["results"].append(
                {
                    "subject": r.exam_schedule.subject.name,
                    "exam": r.exam_schedule.exam.name,
                    "ca_score": r.ca_score,
                    "exam_score": r.exam_score,
                    "score": r.score,
                    "max_score": r.exam_schedule.max_score,
                    "grade": r.grade,
                    "teacher_comment": r.teacher_comment,
                }
            )

        return _ok(
            school=school_data,
            student={"id": str(student_profile.id), "name": student_profile.full_name},
            terms=list(terms.values()),
        )
