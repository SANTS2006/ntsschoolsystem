from rest_framework.permissions import BasePermission

from .services import user_has_permission


def require_permission(code: str):
    """
    Usage: `permission_classes = [require_permission("students.view")]`

    Backend-authoritative — frontend permission checks only control UI
    visibility, never actual access. Platform admins and superusers always
    pass (see `services.get_user_permission_codes`).
    """

    class _RequiresPermission(BasePermission):
        message = f"You do not have the '{code}' permission."

        def has_permission(self, request, view):
            return bool(request.user and request.user.is_authenticated) and user_has_permission(
                request.user, code
            )

    _RequiresPermission.__name__ = f"RequiresPermission_{code.replace('.', '_')}"
    return _RequiresPermission


class IsPlatformAdmin(BasePermission):
    message = "This action requires platform-administrator access."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_platform_admin or user.is_superuser))


class IsSchoolMember(BasePermission):
    """Any authenticated non-platform-admin user who belongs to a school."""

    message = "This action requires a school account."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.school_id is not None)
