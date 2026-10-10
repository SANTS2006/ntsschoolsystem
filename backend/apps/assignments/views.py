from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.live_sessions.services import works_as_teacher
from apps.common.validators import validate_upload_file
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import Assignment, AssignmentSubmission
from .serializers import AssignmentSerializer, AssignmentSubmissionSerializer, GradeSubmissionSerializer

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "grade": "update",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code, http_status, errors=None):
    return Response(
        {"success": False, "message": message, "code": code, "errors": errors or [message]}, status=http_status
    )


class AssignmentViewSet(TenantScopedModelViewSet):
    serializer_class = AssignmentSerializer
    filterset_fields = ["school_class", "section", "subject", "teacher", "is_active"]
    search_fields = ["title", "description"]
    summary_stats = {
        "total": {},
        "active": {"is_active": True},
    }

    def get_permissions(self):
        code = f"assignments.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        qs = Assignment.objects.select_related("school_class", "section", "subject", "teacher__user").all()
        if works_as_teacher(self.request.user):
            # A teacher sees (and manages) only the assignments they set themselves.
            return qs.filter(teacher=self.request.user.staff_profile)
        return qs

    def perform_create(self, serializer):
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            # `teacher` is a required FK — without this check, a user with `assignments.create`
            # but no linked Staff record (e.g. principal, school-administrator) hits an
            # unhandled `RelatedObjectDoesNotExist` in `Assignment.save()`'s cross-school guard
            # and gets a raw 500 instead of a clean 400.
            raise serializers.ValidationError("Only staff members can create assignments.")
        assignment = serializer.save(school=get_current_school(), teacher=staff_profile)
        services.notify_new_assignment(assignment)


class AssignmentSubmissionViewSet(TenantScopedModelViewSet):
    serializer_class = AssignmentSubmissionSerializer
    filterset_fields = ["assignment", "student", "status"]
    summary_stats = {
        "total": {},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        code = f"assignments.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        qs = AssignmentSubmission.objects.select_related("assignment", "student", "graded_by__user").all()
        if works_as_teacher(self.request.user):
            return qs.filter(assignment__teacher=self.request.user.staff_profile)
        return qs

    @action(detail=True, methods=["post"])
    def grade(self, request, pk=None):
        submission = self.get_object()
        serializer = GradeSubmissionSerializer(data=request.data, context={"submission": submission})
        serializer.is_valid(raise_exception=True)
        staff_profile = getattr(request.user, "staff_profile", None)
        services.grade_submission(
            submission,
            score=serializer.validated_data["score"],
            feedback=serializer.validated_data.get("feedback", ""),
            graded_by=staff_profile,
        )
        return _ok("Submission graded.", submission=AssignmentSubmissionSerializer(submission).data)


class _StudentPermission(TenantScopedAPIView):
    """Seeing and submitting assigned work is the `assignments.submit` permission, so a school can grant or take it
    away from the Student role (or any other) on the role screen."""

    def get_permissions(self):
        return [require_permission("assignments.submit")()]


class MyAssignmentsView(_StudentPermission):
    """Student self-service: assignments targeted at the student's own class/section, each with the student's own
    submission (status, score, feedback) if they have handed something in."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None or not student_profile.current_class_id:
            return _ok(assignments=[])
        qs = Assignment.objects.filter(
            school_class_id=student_profile.current_class_id, is_active=True
        ).filter(Q(section__isnull=True) | Q(section_id=student_profile.current_section_id))
        data = AssignmentSerializer(qs, many=True, context={"request": request}).data
        mine = {
            s.assignment_id: s
            for s in AssignmentSubmission.objects.filter(student=student_profile, assignment__in=qs)
        }
        for row in data:
            sub = mine.get(UUID(str(row["id"])))
            row["my_submission"] = (
                {
                    "status": sub.status,
                    "submitted_at": sub.submitted_at.isoformat(),
                    "score": str(sub.score) if sub.score is not None else None,
                    "feedback": sub.feedback,
                    "attachment": sub.attachment.url if sub.attachment else None,
                }
                if sub
                else None
            )
        return _ok(assignments=data)


class SubmitAssignmentView(_StudentPermission):
    """Student self-service: submit (or resubmit) an attachment for one assignment."""

    def post(self, request, assignment_id):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _error("Only students can submit assignments.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)

        try:
            assignment = Assignment.objects.get(pk=assignment_id)
        except Assignment.DoesNotExist:
            return _error("Assignment not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)

        # Only work set for the student's own class (and section, if it names one), and not once it has been marked.
        in_class = assignment.is_active and assignment.school_class_id == student_profile.current_class_id and (
            assignment.section_id is None or assignment.section_id == student_profile.current_section_id
        )
        if not in_class:
            return _error("Assignment not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        existing = AssignmentSubmission.objects.filter(assignment=assignment, student=student_profile).first()
        if existing is not None and existing.status == AssignmentSubmission.Status.GRADED:
            return _error("This work has already been marked, so it can't be resubmitted.", "ALREADY_GRADED", status.HTTP_400_BAD_REQUEST)

        attachment = request.FILES.get("attachment")
        if attachment is None:
            return _error("An attachment file is required.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        try:
            validate_upload_file(attachment)
        except DjangoValidationError as exc:
            return _error("; ".join(exc.messages), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        try:
            submission = services.submit_assignment(assignment, student=student_profile, attachment=attachment)
        except ValueError as exc:
            return _error(str(exc), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        return _ok("Submission received.", submission=AssignmentSubmissionSerializer(submission).data)
