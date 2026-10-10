from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.services import log_action
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from .models import Guardian
from .serializers import GuardianSerializer


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


class GuardianViewSet(TenantScopedModelViewSet):
    """
    Linking a guardian to a specific student happens through
    `StudentViewSet.guardians` (apps.students), not here — a guardian
    record can exist and be managed independently of any one relationship.
    """

    serializer_class = GuardianSerializer
    search_fields = ["first_name", "last_name", "email", "phone_number"]
    ordering_fields = ["last_name", "first_name"]
    summary_stats = {
        "total": {},
    }

    def get_permissions(self):
        if self.action == "reset_password":
            return [require_permission("users.reset_password")()]
        code = f"parents.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        # A method, not a class-level `queryset =` attribute — see the note
        # on apps.academics.views.AcademicsModelViewSet for why that matters
        # for a TenantScopedModel.
        return Guardian.objects.all()

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        """Same default-password scheme as Staff — a no-op (400) for the common case where this
        guardian has no portal account at all, since most don't."""
        from apps.tenants.services import generate_default_password

        guardian = self.get_object()
        if guardian.user_id is None:
            return Response(
                {
                    "success": False,
                    "message": "This guardian has no login account to reset.",
                    "code": "NO_ACCOUNT",
                    "errors": [],
                },
                status=400,
            )
        default_password = generate_default_password(guardian.school)
        guardian.user.set_password(default_password)
        guardian.user.must_change_password = True
        guardian.user.save(update_fields=["password", "must_change_password"])
        log_action(
            action="users.password_reset_to_default",
            actor=request.user,
            school=get_current_school(),
            entity_type="User",
            entity_id=str(guardian.user_id),
            severity="warning",
        )
        return _ok("Password reset to the school default.", default_password=default_password)
