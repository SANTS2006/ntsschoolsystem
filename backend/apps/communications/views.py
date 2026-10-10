from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.authorization.services import user_has_permission
from apps.common.audience import visible_filter
from apps.common.views import CreatorOnlyActionsMixin, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import Announcement, AnnouncementRecipient
from .serializers import AnnouncementRecipientSerializer, AnnouncementSerializer

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "publish": "create",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class AnnouncementViewSet(CreatorOnlyActionsMixin, TenantScopedModelViewSet):
    creator_only_actions = {"update", "partial_update", "destroy", "publish"}
    creator_only_message = "You can only edit, delete or publish announcements you created."
    serializer_class = AnnouncementSerializer
    filterset_fields = ["target_type", "is_active"]
    search_fields = ["title", "body"]
    summary_stats = {
        "total": {},
        "active": {"is_active": True},
        "by_target_type": {"groupby": "target_type"},
    }

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        code = f"communications.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        qs = Announcement.objects.select_related("target_class", "target_section", "target_department").all()
        user = self.request.user
        if not user_has_permission(user, "communications.view"):
            return qs.filter(published_at__isnull=False, specific_recipients__user=user).distinct()
        return qs.filter(visible_filter(user, "specific_recipients")).distinct()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school(), created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        """Resolves the tenant-scoped audience and creates in-app (+ optional email) notifications."""
        announcement = self.get_object()
        if announcement.published_at:
            return Response(
                {"success": False, "message": "This announcement has already been published.",
                 "code": "ALREADY_PUBLISHED", "errors": []},
                status=400,
            )
        announcement.published_by = request.user
        recipient_count = services.publish_announcement(announcement)
        return _ok(
            f"Published to {recipient_count} recipient(s).",
            announcement=AnnouncementSerializer(announcement).data,
        )


class AnnouncementRecipientViewSet(TenantScopedModelViewSet):
    """Manages the explicit recipient list for announcements with target_type=specific_users."""

    serializer_class = AnnouncementRecipientSerializer
    filterset_fields = ["announcement"]
    summary_stats = {"total": {}}

    def get_permissions(self):
        code = f"communications.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return AnnouncementRecipient.objects.select_related("announcement", "user").all()
