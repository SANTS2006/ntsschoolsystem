from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.views import TenantScopedReadOnlyViewSet

from . import services
from .models import Notification
from .serializers import NotificationSerializer


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class NotificationViewSet(TenantScopedReadOnlyViewSet):
    """
    Read-only + mark-read actions — notifications are always system-
    generated (see apps.notifications.services.notify/notify_bulk), never
    created directly through this API. Always scoped to the caller's own
    notifications; no separate permission beyond being authenticated, since
    "my own inbox" needs no additional authorization check.
    """

    serializer_class = NotificationSerializer
    filterset_fields = ["category", "priority", "is_read"]
    summary_stats = {
        "total": {},
        "unread": {"is_read": False},
    }

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        services.mark_read(notification)
        return _ok("Marked as read.", notification=NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True, read_at=timezone.now())
        return _ok(f"Marked {updated} notification(s) as read.")
