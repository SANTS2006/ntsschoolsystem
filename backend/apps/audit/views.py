from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedReadOnlyViewSet

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(TenantScopedReadOnlyViewSet):
    """
    Platform admins see every entry; school users with `audit.view` see only
    their own school's. `AuditLog` isn't a `TenantScopedModel` (platform-level
    events have no school at all), so scoping is manual here rather than via
    the tenant manager.
    """

    serializer_class = AuditLogSerializer
    permission_classes = [require_permission("audit.view")]
    filterset_fields = ["action", "severity", "entity_type"]
    search_fields = ["action", "actor_email", "entity_type", "entity_id"]
    ordering_fields = ["created_at"]
    summary_stats = {
        "total": {},
        "by_severity": {"groupby": "severity"},
    }

    def get_queryset(self):
        user = self.request.user
        if user.is_platform_admin or user.is_superuser:
            return AuditLog.objects.all()
        if user.school_id:
            return AuditLog.objects.filter(school_id=user.school_id)
        return AuditLog.objects.none()
