from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .daily_client import create_room
from .models import LiveSession, LiveSessionRecipient
from .serializers import LiveSessionRecipientSerializer, LiveSessionSerializer

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "start": "update",
    "end": "update",
    "remind": "update",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code, http_status, errors=None):
    return Response(
        {"success": False, "message": message, "code": code, "errors": errors or [message]}, status=http_status
    )


class LiveSessionViewSet(TenantScopedModelViewSet):
    serializer_class = LiveSessionSerializer
    search_fields = ["title", "subject__name"]
    filterset_fields = ["school_class", "section", "subject", "lesson", "status"]
    summary_stats = {
        "total": {},
        "by_status": {"groupby": "status"},
        "live": {"status": LiveSession.Status.LIVE},
    }

    def get_permissions(self):
        code = f"live_sessions.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        qs = LiveSession.objects.select_related("subject", "school_class", "section", "lesson", "teacher__user").all()
        if getattr(self.request.user, "student_profile", None) is not None:
            return services.scope_for_student(qs, self.request.user)
        if services.works_as_teacher(self.request.user):
            # A teacher only ever sees (and can start, end, remind or change) the sessions they scheduled themselves.
            return qs.filter(teacher=self.request.user.staff_profile)
        return qs

    def perform_create(self, serializer):
        staff_profile = getattr(self.request.user, "staff_profile", None)
        if staff_profile is None:
            raise serializers.ValidationError("Only staff members can schedule live sessions.")
        serializer.save(school=get_current_school(), teacher=staff_profile)

    def perform_destroy(self, instance):
        from apps.academics.services import assert_year_not_archived

        if instance.section_id:
            try:
                assert_year_not_archived(instance.section.academic_year)
            except ValueError as exc:
                raise serializers.ValidationError(str(exc)) from exc
        instance.delete()

    @action(detail=False, methods=["get"])
    def options(self, request):
        """What the schedule form may offer: for a teacher, only the subjects and classes they are assigned to."""
        if not services.works_as_teacher(request.user):
            return _ok(restricted=False, pairs=[])
        pairs = services.teaching_pairs(request.user)
        return _ok(restricted=True, pairs=[{"subject": str(s), "school_class": str(c)} for s, c in sorted(pairs, key=str)])

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        session = self.get_object()
        if session.status != LiveSession.Status.SCHEDULED:
            return _error(
                f"Cannot start a session with status '{session.status}'.", "INVALID_TRANSITION",
                status.HTTP_400_BAD_REQUEST,
            )
        result = create_room(name=f"session-{session.id}")
        if result is None:
            return _error(
                "Live video calls aren't configured for this school yet.", "FEATURE_NOT_CONFIGURED",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        room_url, room_name = result
        session.daily_room_url = room_url
        session.daily_room_name = room_name
        session.status = LiveSession.Status.LIVE
        session.started_at = timezone.now()
        session.save(update_fields=["daily_room_url", "daily_room_name", "status", "started_at"])
        notified = services.notify_session_started(session)
        return _ok(f"Session started. Notified {notified} student(s).", session=LiveSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        session = self.get_object()
        if session.status != LiveSession.Status.LIVE:
            return _error(
                f"Cannot end a session with status '{session.status}'.", "INVALID_TRANSITION",
                status.HTTP_400_BAD_REQUEST,
            )
        session.status = LiveSession.Status.ENDED
        session.ended_at = timezone.now()
        session.save(update_fields=["status", "ended_at"])
        return _ok("Session ended.", session=LiveSessionSerializer(session).data)

    @action(detail=True, methods=["post"])
    def remind(self, request, pk=None):
        """Manual "Send reminder now" — re-runs the same recipient-resolution + notify used at
        `start`, on demand. See `services.send_reminder`'s docstring for why this is manual
        rather than scheduled."""
        session = self.get_object()
        notified = services.send_reminder(session)
        return _ok(f"Reminder sent to {notified} student(s).")


class LiveSessionRecipientViewSet(TenantScopedModelViewSet):
    """Manages the explicit audience list for sessions with target_type=specific_students — same
    shape as `apps.education.views.LessonEnrollmentViewSet`. Every action is gated
    `live_sessions.update`, not the usual list→view mapping, for the same reason: inviting a
    student is an update-the-session's-audience action."""

    serializer_class = LiveSessionRecipientSerializer
    filterset_fields = ["session"]

    def get_permissions(self):
        return [require_permission("live_sessions.update")()]

    def get_queryset(self):
        return LiveSessionRecipient.objects.select_related("session", "student").all()

    def perform_create(self, serializer):
        recipient = serializer.save(school=get_current_school())
        services.notify_new_recipient(recipient)


class MyLiveSessionsView(TenantScopedAPIView):
    """Student self-service: live sessions for the student's own class/section, mirroring
    MyLessonsView/MyAssignmentsView exactly (no permission gate). The filter is the same union
    MyLessonsView uses (see its docstring): the class/section match for `target_type=
    class_section` sessions (unchanged from before this field existed) OR an explicit
    `LiveSessionRecipient` match for `target_type=specific_students` sessions."""

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            return _ok(sessions=[])
        class_section_match = Q(
            target_type=LiveSession.TargetType.CLASS_SECTION,
            school_class_id=student_profile.current_class_id,
        ) & (Q(section__isnull=True) | Q(section_id=student_profile.current_section_id))
        specific_students_match = Q(
            target_type=LiveSession.TargetType.SPECIFIC_STUDENTS,
            recipients__student=student_profile,
        )
        qs = LiveSession.objects.filter(
            class_section_match | specific_students_match
        ).exclude(status=LiveSession.Status.CANCELLED).distinct().select_related(
            "subject", "school_class", "section", "teacher__user"
        )
        data = LiveSessionSerializer(qs, many=True, context={"request": request}).data
        return _ok(sessions=data)
