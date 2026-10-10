from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.services import log_action
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet
from apps.tenants.context import get_current_school_id
from apps.tenants.services import get_current_school

from .models import Student
from .serializers import StudentSerializer
from .services import provision_student_account, scope_students_for_teacher

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


class StudentViewSet(TenantScopedModelViewSet):
    """`DELETE` never hard-deletes — perform_destroy archives instead (status=archived)."""

    serializer_class = StudentSerializer
    filterset_fields = ["status", "current_class", "current_section", "current_academic_year", "gender"]
    search_fields = ["first_name", "last_name", "admission_number"]
    ordering_fields = ["last_name", "first_name", "admission_date"]
    summary_stats = {
        "total": {},
        "active": {"status": Student.Status.ACTIVE},
        "by_status": {"groupby": "status"},
    }

    def get_queryset(self):
        # A method, not a class-level `queryset =` attribute — see the note
        # on apps.academics.views.AcademicsModelViewSet for why that matters
        # for a TenantScopedModel.
        qs = Student.objects.select_related("current_academic_year", "current_class", "current_section").all()
        return scope_students_for_teacher(qs, self.request.user)

    def get_permissions(self):
        if self.action == "guardians":
            code = "students.view" if self.request.method.lower() == "get" else "students.update"
        elif self.action == "bulk_status":
            code = "students.update"
        else:
            code = f"students.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def perform_create(self, serializer):
        student = serializer.save(school_id=get_current_school_id())
        provision_student_account(student)

    def perform_destroy(self, instance):
        instance.status = Student.Status.ARCHIVED
        instance.save(update_fields=["status"])
        log_action(
            action="students.archived",
            actor=self.request.user,
            school=get_current_school(),
            entity_type="Student",
            entity_id=str(instance.pk),
            severity="warning",
        )

    @action(detail=False, methods=["post"], url_path="bulk-status")
    def bulk_status(self, request):
        """Change the status of several students in one request, for the list page's
        multi-select toolbar. Archiving here goes through the same path as a single-row
        archive (status=archived), never a hard delete."""
        student_ids = request.data.get("student_ids") or []
        new_status = request.data.get("status")
        valid_statuses = {choice for choice, _label in Student.Status.choices}
        if not student_ids or new_status not in valid_statuses:
            return Response(
                {
                    "success": False,
                    "message": "Provide student_ids and a valid status.",
                    "code": "VALIDATION_ERROR",
                    "errors": [],
                },
                status=400,
            )

        students = list(self.get_queryset().filter(pk__in=student_ids))
        updated = 0
        for student in students:
            if student.status != new_status:
                student.status = new_status
                student.save(update_fields=["status"])
                updated += 1
            log_action(
                action="students.status_changed",
                actor=request.user,
                school=get_current_school(),
                entity_type="Student",
                entity_id=str(student.pk),
                after={"status": new_status},
            )
        return _ok(f"Updated {updated} student(s).", updated=updated)

    @action(detail=True, methods=["get", "post", "delete"])
    def guardians(self, request, pk=None):
        from apps.parents.models import Guardian, StudentGuardian
        from apps.parents.serializers import StudentGuardianSerializer

        student = self.get_object()
        method = request.method.lower()

        if method == "get":
            relationships = StudentGuardian.objects.filter(student=student).select_related("guardian")
            return _ok(guardians=StudentGuardianSerializer(relationships, many=True).data)

        if method == "delete":
            guardian_id = request.query_params.get("guardian_id") or request.data.get("guardian_id")
            deleted, _ = StudentGuardian.objects.filter(student=student, guardian_id=guardian_id).delete()
            if deleted:
                log_action(
                    action="students.guardian_unlinked",
                    actor=request.user,
                    school=get_current_school(),
                    entity_type="Student",
                    entity_id=str(student.pk),
                    metadata={"guardian_id": str(guardian_id)},
                )
            return _ok("Guardian unlinked.")

        guardian_id = request.data.get("guardian_id")
        guardian = get_object_or_404(Guardian, pk=guardian_id, school=get_current_school())
        relationship, _created = StudentGuardian.objects.get_or_create(
            school=get_current_school(),
            student=student,
            guardian=guardian,
            defaults={
                "relationship": request.data.get("relationship", StudentGuardian.Relationship.GUARDIAN),
                "is_primary": bool(request.data.get("is_primary", False)),
                "is_emergency_contact": bool(request.data.get("is_emergency_contact", False)),
            },
        )
        log_action(
            action="students.guardian_linked",
            actor=request.user,
            school=get_current_school(),
            entity_type="Student",
            entity_id=str(student.pk),
            metadata={"guardian_id": str(guardian.pk)},
        )
        return _ok("Guardian linked.", guardian=StudentGuardianSerializer(relationship).data)
