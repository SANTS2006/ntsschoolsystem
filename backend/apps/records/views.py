from rest_framework.permissions import IsAuthenticated

from apps.authorization.permissions import require_permission
from apps.common.ownership import OwnerOnlyMutationsMixin
from apps.common.views import TenantScopedModelViewSet
from apps.tenants.services import get_current_school_id

from .models import Record
from .serializers import RecordSerializer

_WRITE_PERMISSION = {
    "create": "records.create",
    "update": "records.update",
    "partial_update": "records.update",
    "destroy": "records.delete",
}


class RecordViewSet(OwnerOnlyMutationsMixin, TenantScopedModelViewSet):
    owner_field = "created_by"
    owner_message = "You can only edit or delete records you created."
    """Read side is deliberately open to every signed-in account of the school — staff of any
    role and students alike, exactly the "students and other roles should just view records"
    requirement — so `list`/`retrieve` fall through to the plain `IsAuthenticated` default rather
    than a `records.view` code that a student (holding zero RBAC permissions, same as every other
    self-service account in this codebase) could never be granted. Only the two roles who can
    actually change what's here (Principal — via the broad `""` grant, and School Administrator —
    granted `records.*` explicitly, see `DEFAULT_ROLE_PERMISSION_PREFIXES`) hold the write codes
    below."""

    serializer_class = RecordSerializer
    filterset_fields = ["category"]
    search_fields = ["title", "category", "body"]
    ordering_fields = ["created_at", "title"]
    summary_stats = {
        "total": {},
    }

    def get_permissions(self):
        code = _WRITE_PERMISSION.get(self.action)
        if code is None:
            return [IsAuthenticated()]
        return [require_permission(code)()]

    def get_queryset(self):
        return Record.objects.select_related("created_by").all()

    def perform_create(self, serializer):
        serializer.save(school_id=get_current_school_id(), created_by=self.request.user)
