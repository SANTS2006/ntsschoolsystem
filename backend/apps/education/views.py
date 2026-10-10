from django.db.models import Q
from rest_framework import serializers
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import Lesson, LessonEnrollment, LessonMaterial
from .serializers import LessonEnrollmentSerializer, LessonMaterialSerializer, LessonSerializer

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class LessonViewSet(TenantScopedModelViewSet):
    serializer_class = LessonSerializer
    filterset_fields = ["school_class", "section", "subject", "teacher", "is_active"]
    search_fields = ["title", "description"]
    summary_stats = {
        "total": {},
        "active": {"is_active": True},
    }

    def get_permissions(self):
        code = f"education.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return Lesson.objects.select_related("subject", "school_class", "section", "teacher__user").all()

    def perform_create(self, serializer):
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            raise serializers.ValidationError("Only staff members can create lessons.")
        serializer.save(school=get_current_school(), teacher=staff_profile)


class LessonMaterialViewSet(TenantScopedModelViewSet):
    serializer_class = LessonMaterialSerializer
    filterset_fields = ["lesson", "material_type"]

    def get_permissions(self):
        code = f"education.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return LessonMaterial.objects.select_related("lesson", "uploaded_by").all()

    def perform_create(self, serializer):
        material = serializer.save(school=get_current_school(), uploaded_by=self.request.user)
        services.notify_new_material(material)


class LessonEnrollmentViewSet(TenantScopedModelViewSet):
    """Manages the explicit audience list for lessons with target_type=specific_students — same
    shape as `apps.events.views.EventRecipientViewSet`. Every action (not just create/delete) is
    gated `education.update`, not the usual list→view mapping: enrolling/unenrolling a student is
    an update-the-lesson's-audience action, and there's no separate "view enrollments" use case
    distinct from managing them."""

    serializer_class = LessonEnrollmentSerializer
    filterset_fields = ["lesson"]

    def get_permissions(self):
        return [require_permission("education.update")()]

    def get_queryset(self):
        return LessonEnrollment.objects.select_related("lesson", "student").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school())


class MyLessonsView(TenantScopedAPIView):
    """Student self-service: lessons targeted at the student's own class/section, mirroring
    MyAssignmentsView's identity-keyed pattern exactly (no permission gate). Materials are
    nested inline here (unlike the staff-side LessonSerializer, which only exposes a count) so
    the student can view/download/stream everything in one request.

    The filter is a union of two independent matches: the existing class/section match (for
    `target_type=class_section` lessons — the default, so every lesson created before this field
    existed behaves identically to before) OR an explicit `LessonEnrollment` match (for
    `target_type=specific_students` lessons). `distinct()` because a lesson could theoretically
    satisfy both halves of the OR (e.g. a specific_students lesson happens to also match the
    class/section filter) — without it such a lesson would appear twice."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(lessons=[])
        class_section_match = Q(
            target_type=Lesson.TargetType.CLASS_SECTION,
            school_class_id=student_profile.current_class_id,
        ) & (Q(section__isnull=True) | Q(section_id=student_profile.current_section_id))
        specific_students_match = Q(
            target_type=Lesson.TargetType.SPECIFIC_STUDENTS,
            enrollments__student=student_profile,
        )
        qs = Lesson.objects.filter(is_active=True).filter(
            class_section_match | specific_students_match
        ).distinct().prefetch_related("materials")
        lessons = LessonSerializer(qs, many=True, context={"request": request}).data
        for lesson_data, lesson in zip(lessons, qs):
            lesson_data["materials"] = LessonMaterialSerializer(
                lesson.materials.all(), many=True, context={"request": request}
            ).data
        return _ok(lessons=lessons)
