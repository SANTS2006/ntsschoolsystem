from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.services import log_action
from apps.common.views import TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from .models import Permission, Role, RolePermission, SuppressedSystemRole
from .permissions import require_permission
from .serializers import PermissionSerializer, RoleSerializer

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "permissions": "view",
    "set_permissions": "update",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code, http_status):
    from rest_framework import status as drf_status

    return Response(
        {"success": False, "message": message, "code": code, "errors": [message]},
        status=http_status or drf_status.HTTP_400_BAD_REQUEST,
    )


class RoleViewSet(TenantScopedModelViewSet):
    """
    Roles are seeded per-school for the standard system roles (see
    seed_default_roles_for_school) but can also be created freely here for a school's own custom
    roles. A system role can never be renamed away from its seeded identity or deleted (its slug
    is load-bearing — several features key scoping off e.g. `role__slug="teacher"`), but ANY
    role's permission set — system or custom — can be edited via the `permissions` action; doing
    marks it `customized`, so a later `resync_role_permissions` run (see deploy/start.sh, which runs it
    on every deploy) adds newly introduced default permissions to it but never removes or overwrites
    what the school chose.
    """

    serializer_class = RoleSerializer
    search_fields = ["name", "slug"]
    ordering_fields = ["name"]
    summary_stats = {
        "total": {},
        "system": {"is_system": True},
    }

    def get_permissions(self):
        code = f"roles.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        # Deactivated roles stay in the list so they can be reactivated or deleted.
        return Role.objects.prefetch_related("permissions").order_by("name")

    def perform_update(self, serializer):
        instance = serializer.instance
        before = {"name": instance.name, "description": instance.description, "is_active": instance.is_active}
        role = serializer.save()
        if role.is_system:
            # A standard role the school has renamed or switched off is theirs now: the deploy sync must not put the
            # name back or re-activate it (it still adds newly introduced default permissions).
            role.customized = True
            role.save(update_fields=["customized", "updated_at"])
        log_action(
            action="roles.updated",
            actor=self.request.user,
            school=get_current_school(),
            entity_type="Role",
            entity_id=str(role.pk),
            before=before,
            after={"name": role.name, "description": role.description, "is_active": role.is_active},
        )

    def perform_destroy(self, instance):
        school = get_current_school()
        if instance.is_system:
            # Remember the deletion, or the next deploy would recreate the standard role.
            SuppressedSystemRole.objects.get_or_create(school=school, slug=instance.slug)
        log_action(
            action="roles.deleted",
            actor=self.request.user,
            school=school,
            entity_type="Role",
            entity_id=str(instance.pk),
            before={"name": instance.name, "is_system": instance.is_system, "users": instance.user_roles.count()},
        )
        instance.delete()

    @action(detail=True, methods=["get"])
    def permissions(self, request, pk=None):
        """Every permission in the catalog, each flagged with whether this role currently grants
        it — the shape a multi-select assignment UI needs in one call."""
        role = self.get_object()
        granted_ids = set(role.permissions.values_list("id", flat=True))
        all_permissions = Permission.objects.all().order_by("module", "code")
        data = [
            {**PermissionSerializer(p).data, "granted": p.id in granted_ids} for p in all_permissions
        ]
        return _ok(permissions=data)

    @action(detail=True, methods=["post"], url_path="set-permissions")
    def set_permissions(self, request, pk=None):
        """Replaces this role's entire permission set with the given list of permission ids —
        the multi-select "these, and only these" assignment the Roles admin page uses, rather
        than incremental add/remove calls."""
        role = self.get_object()
        permission_ids = request.data.get("permission_ids")
        if not isinstance(permission_ids, list):
            return _error("permission_ids must be a list.", "VALIDATION_ERROR", 400)

        permissions = list(Permission.objects.filter(id__in=permission_ids))
        school = get_current_school()
        RolePermission.unscoped_objects.filter(role=role).delete()
        RolePermission.unscoped_objects.bulk_create(
            [RolePermission(school=school, role=role, permission=p) for p in permissions]
        )
        # Kept as a system role (it still can't be deleted or renamed), but flagged so a later resync
        # adds newly introduced default permissions to it without taking away the school's choices.
        role.customized = True
        role.known_permission_codes = sorted(Permission.objects.values_list("code", flat=True))
        role.save(update_fields=["customized", "known_permission_codes", "updated_at"])

        log_action(
            action="roles.permissions_updated",
            actor=request.user,
            school=school,
            entity_type="Role",
            entity_id=str(role.pk),
            after={"permission_codes": sorted(p.code for p in permissions)},
        )
        return _ok("Permissions updated.", role=RoleSerializer(role).data)


class PermissionViewSet(TenantScopedModelViewSet):
    """The global permission catalog (not tenant-scoped — see the Permission model). Most
    permissions come from `apps.authorization.catalog` and are recreated by `seed_permissions` on
    every deploy, so editing/deleting one of those has no lasting effect; this is really for a
    school's own custom permission codes, which only ever do something once a school-specific
    workflow is built to check them (a permission with no code checking it is inert)."""

    serializer_class = PermissionSerializer
    search_fields = ["code", "name", "module"]
    ordering_fields = ["module", "code"]
    summary_stats = {
        "total": {},
        "by_module": {"groupby": "module"},
    }

    def get_permissions(self):
        code = f"permissions.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return Permission.objects.all()

    def perform_create(self, serializer):
        serializer.save()
