import uuid

from .context import (
    reset_current_school_id,
    reset_platform_admin_context,
    set_current_school_id,
    set_platform_admin_context,
)

ACTING_SCHOOL_HEADER = "X-Acting-School"


class TenantContextMixin:
    """
    Sets the request-scoped tenant context for DRF views.

    Must hook in via `perform_authentication`, not `initial()` — DRF's
    `initial()` runs perform_authentication() *then* check_permissions()
    *then* check_throttles() in one call, so context set after
    `super().initial()` returns would not yet exist while permission
    classes run. Permission classes routinely need to query tenant-scoped
    models (e.g. "does this user have role X"), so the context has to be
    live by the time check_permissions() executes — i.e. immediately after
    authentication resolves `request.user`, which is exactly what
    perform_authentication() does.
    """

    _school_ctx_token = None
    _admin_ctx_token = None

    def perform_authentication(self, request):
        super().perform_authentication(request)
        user = request.user
        authenticated = bool(user and user.is_authenticated)
        is_platform_admin = bool(getattr(user, "is_platform_admin", False)) if authenticated else False
        school_id = getattr(user, "school_id", None) if authenticated else None

        # A platform admin has no school of their own, but may be "viewing" one specific
        # school's data (see apps.tenants — the platform-admin "view this school's data" mode).
        # Only they are trusted to set this — a school-scoped user's own `school_id` above always
        # wins for them, this header is never even inspected for a non-platform-admin request.
        if is_platform_admin:
            header_value = request.headers.get(ACTING_SCHOOL_HEADER)
            if header_value:
                try:
                    school_id = uuid.UUID(header_value)
                except ValueError:
                    pass

        self._school_ctx_token = set_current_school_id(school_id)
        self._admin_ctx_token = set_platform_admin_context(is_platform_admin)

    def dispatch(self, request, *args, **kwargs):
        try:
            return super().dispatch(request, *args, **kwargs)
        finally:
            if self._school_ctx_token is not None:
                reset_current_school_id(self._school_ctx_token)
                reset_platform_admin_context(self._admin_ctx_token)
                self._school_ctx_token = None
                self._admin_ctx_token = None
