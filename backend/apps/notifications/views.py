from django.utils import timezone
from django.conf import settings
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from rest_framework.views import APIView

from apps.common.views import TenantScopedReadOnlyViewSet

from . import services
from .models import Notification, PushSubscription
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


class PushKeyView(APIView):
    """GET - the public key the browser needs to subscribe, and whether push is switched on at all."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        key = settings.VAPID_PUBLIC_KEY if settings.VAPID_PRIVATE_KEY else ""
        return _ok(enabled=bool(key), public_key=key)


class _SubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=2000)
    p256dh = serializers.CharField(max_length=255)
    auth = serializers.CharField(max_length=255)


class PushSubscribeView(APIView):
    """POST - remember this browser for the signed-in user. DELETE - forget it (on sign-out, or when switched off)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = _SubscribeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        PushSubscription.objects.update_or_create(
            endpoint=data["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": data["p256dh"],
                "auth": data["auth"],
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:300],
            },
        )
        return _ok("Alerts are on for this device.")

    def delete(self, request):
        endpoint = str(request.data.get("endpoint", ""))
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return _ok("Alerts are off for this device.")
