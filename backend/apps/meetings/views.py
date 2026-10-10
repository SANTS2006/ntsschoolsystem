from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.ownership import OwnerOnlyMutationsMixin
from apps.authorization.services import user_has_permission
from apps.common.views import TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import Meeting, MeetingInvitee
from .serializers import (
    AudiencePreviewSerializer,
    MeetingCreateSerializer,
    MeetingDetailSerializer,
    MeetingSerializer,
)


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, http_status=status.HTTP_400_BAD_REQUEST, code="VALIDATION_ERROR"):
    return Response({"success": False, "message": message, "code": code, "errors": [message]}, status=http_status)


_ACTION_PERMISSION = {
    "create": "meetings.create",
    "preview": "meetings.create",
    "start": "meetings.update",
    "end": "meetings.update",
    "cancel": "meetings.update",
    "resend": "meetings.update",
}
_SELF_SERVICE_ACTIONS = {"my", "join"}


class MeetingViewSet(OwnerOnlyMutationsMixin, TenantScopedModelViewSet):
    owner_field = "host"
    owner_only_actions = {"update", "partial_update", "destroy", "start", "end", "cancel", "resend"}
    owner_message = "Only the person who scheduled this meeting can start, end, cancel or change it."
    """Principal/admin-facing management of school-wide meetings, plus two self-service actions
    (`my`, `join`) for invitees — those have no permission gate beyond being signed in, because
    what they return is scoped to meetings the caller was actually invited to."""

    serializer_class = MeetingSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["status"]
    search_fields = ["title"]
    ordering_fields = ["scheduled_start", "created_at"]
    summary_stats = {
        "total": {},
        "scheduled": {"status": Meeting.Status.SCHEDULED},
        "live": {"status": Meeting.Status.LIVE},
        "ended": {"status": Meeting.Status.ENDED},
    }

    def get_permissions(self):
        if self.action in _SELF_SERVICE_ACTIONS:
            return [IsAuthenticated()]
        return [require_permission(_ACTION_PERMISSION.get(self.action, "meetings.view"))()]

    def get_queryset(self):
        return Meeting.objects.select_related("host", "school").prefetch_related("invitees").all()

    def get_serializer_class(self):
        return MeetingDetailSerializer if self.action == "retrieve" else MeetingSerializer

    def create(self, request, *args, **kwargs):
        serializer = MeetingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            meeting = services.create_meeting(school=get_current_school(), host=request.user, **data)
        except services.MeetingError as exc:
            code = "FEATURE_NOT_CONFIGURED" if "configured" in str(exc) else "VALIDATION_ERROR"
            return _error(
                str(exc), status.HTTP_503_SERVICE_UNAVAILABLE if code == "FEATURE_NOT_CONFIGURED" else 400, code
            )
        services.dispatch_invitations(meeting)
        response = _ok(
            f"Meeting created. Invitations are being sent to {meeting.invitees.count()} people.",
            meeting=MeetingDetailSerializer(meeting).data,
        )
        response.status_code = status.HTTP_201_CREATED
        return response

    @action(detail=False, methods=["post"])
    def preview(self, request):
        """How many people a given audience setting would reach — lets the form show "42 people
        (3 without an email address)" before anything is created or sent."""
        serializer = AudiencePreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        people = services.resolve_invitees(school=get_current_school(), **serializer.validated_data)
        by_kind = {"staff": 0, "parent": 0, "student": 0}
        for person in people:
            by_kind[person["kind"]] += 1
        return _ok(
            total=len(people), by_kind=by_kind, without_email=sum(1 for p in people if not p["email"])
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        try:
            meeting = services.start_meeting(self.get_object())
        except services.MeetingError as exc:
            return _error(str(exc), code="INVALID_TRANSITION")
        return _ok("Meeting started.", meeting=MeetingSerializer(meeting).data)

    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        try:
            meeting = services.end_meeting(self.get_object())
        except services.MeetingError as exc:
            return _error(str(exc), code="INVALID_TRANSITION")
        return _ok("Meeting ended.", meeting=MeetingSerializer(meeting).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        try:
            meeting = services.cancel_meeting(self.get_object(), actor=request.user)
        except services.MeetingError as exc:
            return _error(str(exc), code="INVALID_TRANSITION")
        services.dispatch_cancellation_notices(meeting)
        return _ok("Meeting cancelled. Invitees who were emailed are being told.", meeting=MeetingSerializer(meeting).data)

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        """Retries the invitations that failed (or never went out) — never re-sends to anyone who
        already received theirs."""
        meeting = self.get_object()
        if meeting.status in (Meeting.Status.ENDED, Meeting.Status.CANCELLED):
            return _error("This meeting is over — there's no one left to invite.", code="INVALID_TRANSITION")
        services.dispatch_invitations(meeting)
        return _ok("Sending the outstanding invitations.")

    @action(detail=False, methods=["get"])
    def my(self, request):
        """Meetings the signed-in user was invited to (upcoming and live, most imminent first)."""
        ids = MeetingInvitee.objects.filter(user=request.user).values_list("meeting_id", flat=True)
        qs = self.get_queryset().filter(pk__in=ids).exclude(
            status__in=[Meeting.Status.CANCELLED, Meeting.Status.ENDED]
        ).order_by("scheduled_start")
        return _ok(meetings=MeetingSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def join(self, request, pk=None):
        """The join details for one meeting — only for someone invited to it, its host, or staff
        who manage meetings."""
        meeting = self.get_object()
        user = request.user
        allowed = (
            meeting.host_id == user.id
            or MeetingInvitee.objects.filter(meeting=meeting, user=user).exists()
            or user_has_permission(user, "meetings.view")
        )
        if not allowed:
            return _error("You weren't invited to this meeting.", status.HTTP_403_FORBIDDEN, "FORBIDDEN")
        if meeting.status in (Meeting.Status.CANCELLED, Meeting.Status.ENDED):
            return _ok(meeting=MeetingSerializer(meeting).data, room_url="")
        return _ok(meeting=MeetingSerializer(meeting).data, room_url=meeting.daily_room_url)
