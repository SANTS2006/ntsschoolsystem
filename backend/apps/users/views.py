from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.services import log_action
from apps.authorization.models import Role, UserRole
from apps.authorization.permissions import require_permission
from apps.authorization.services import assign_role
from apps.common.views import TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from .models import User
from .serializers import InviteUserSerializer, UserSerializer
from .services import invite_user as invite_user_service

_ACTION_PERMISSIONS = {
    "list": "users.view",
    "retrieve": "users.view",
    "invite": "users.create",
    "update": "users.update",
    "partial_update": "users.update",
    "disable": "users.disable",
    "enable": "users.disable",
    "assign_role_action": "users.update",
    "remove_role_action": "users.update",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class UserViewSet(TenantScopedModelViewSet):
    """
    School-scoped user management. `User` is not a `TenantScopedModel` (it's
    referenced by platform admins with no school too), so scoping here is
    manual — get_queryset() is the single point that must never be
    forgotten or bypassed; get_object() (used by retrieve/update/disable/
    role actions) filters through it too, so a cross-school id 404s instead
    of leaking existence.
    """

    serializer_class = UserSerializer
    http_method_names = ["get", "patch", "post", "head", "options"]

    def get_permissions(self):
        code = _ACTION_PERMISSIONS.get(self.action, "users.view")
        return [require_permission(code)()]

    def get_queryset(self):
        school = get_current_school()
        if school is None:
            return User.objects.none()
        return User.objects.filter(school=school).order_by("first_name", "last_name")

    def get_serializer_class(self):
        if self.action == "invite":
            return InviteUserSerializer
        return UserSerializer

    def create(self, request, *args, **kwargs):
        # Direct creation is disallowed: users are always invited (invite_user()
        # enforces an unusable password + activation flow) so accounts can never
        # be created with an admin-chosen password or without a school.
        return Response(
            {
                "success": False,
                "message": "Users cannot be created directly. Use the 'invite' action.",
                "code": "METHOD_NOT_ALLOWED",
                "errors": [],
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=False, methods=["post"])
    def invite(self, request):
        serializer = InviteUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        role_id = data.get("role_id")
        role = get_object_or_404(Role.unscoped_objects, pk=role_id, school=get_current_school()) if role_id else None

        user = invite_user_service(
            email=data["email"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            school=get_current_school(),
            invited_by=request.user,
            role_label=role.name if role else None,
            request=request,
        )
        if role:
            assign_role(user=user, role=role, assigned_by=request.user)

        message = "Account created with the school's default password."
        if not user.invite_email_sent:
            message += " The sign-in email could not be sent — please share the details with them directly."
        return _ok(message, user=UserSerializer(user).data, email_sent=user.invite_email_sent)

    @action(detail=True, methods=["post"])
    def disable(self, request, pk=None):
        user = self.get_object()
        if user.pk == request.user.pk:
            return Response(
                {
                    "success": False,
                    "message": "You cannot disable your own account.",
                    "code": "SELF_DISABLE_FORBIDDEN",
                    "errors": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = False
        user.save(update_fields=["is_active"])
        log_action(
            action="users.disabled",
            actor=request.user,
            school=get_current_school(),
            entity_type="User",
            entity_id=str(user.pk),
        )
        return _ok("User disabled.", user=UserSerializer(user).data)

    @action(detail=True, methods=["post"])
    def enable(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        log_action(
            action="users.enabled",
            actor=request.user,
            school=get_current_school(),
            entity_type="User",
            entity_id=str(user.pk),
        )
        return _ok("User enabled.", user=UserSerializer(user).data)

    @action(detail=True, methods=["post"], url_path="assign-role")
    def assign_role_action(self, request, pk=None):
        user = self.get_object()
        role = get_object_or_404(
            Role.unscoped_objects, pk=request.data.get("role_id"), school=get_current_school()
        )
        assign_role(user=user, role=role, assigned_by=request.user)
        log_action(
            action="users.role_assigned",
            actor=request.user,
            school=get_current_school(),
            entity_type="User",
            entity_id=str(user.pk),
            metadata={"role": role.slug},
        )
        return _ok("Role assigned.", user=UserSerializer(user).data)

    @action(detail=True, methods=["post"], url_path="remove-role")
    def remove_role_action(self, request, pk=None):
        user = self.get_object()
        role_id = request.data.get("role_id")
        deleted, _ = UserRole.unscoped_objects.filter(
            user=user, role_id=role_id, school=get_current_school()
        ).delete()
        if deleted:
            log_action(
                action="users.role_removed",
                actor=request.user,
                school=get_current_school(),
                entity_type="User",
                entity_id=str(user.pk),
                metadata={"role_id": str(role_id)},
            )
        return _ok("Role removed.", user=UserSerializer(user).data)
