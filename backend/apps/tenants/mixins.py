import uuid

from .context import (
    YearCorrection,
    get_year_correction,
    reset_current_school_id,
    reset_platform_admin_context,
    reset_year_correction,
    set_current_school_id,
    set_platform_admin_context,
    set_year_correction,
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
    _correction_token = None

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

        # Whether this person may correct records of a CLOSED academic year (the principal, school administrator and exams
        # director by default). Checked lazily, only if such a write is attempted; see apps.academics.services.
        if authenticated and school_id is not None and not is_platform_admin:

            def can_correct(user=user):
                from apps.authorization.services import user_has_permission

                return user_has_permission(user, "academics.correct_closed_year")

            self._correction_token = set_year_correction(YearCorrection(can_correct))

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        correction = get_year_correction()
        if correction is not None and correction.years and request.method not in ("GET", "HEAD", "OPTIONS") and response.status_code < 400:
            # Every successful change to a closed year is recorded: who, which year(s), and what they called.
            from apps.audit.services import log_action
            from apps.tenants.services import get_current_school

            log_action(
                action="academics.closed_year_correction",
                actor=request.user,
                school=get_current_school(),
                entity_type="ClosedYearCorrection",
                entity_id=request.path,
                severity="warning",
                metadata={"years": sorted(correction.years), "method": request.method, "path": request.path},
            )
            correction.years.clear()
        return response

    def dispatch(self, request, *args, **kwargs):
        try:
            return super().dispatch(request, *args, **kwargs)
        finally:
            if self._school_ctx_token is not None:
                reset_current_school_id(self._school_ctx_token)
                reset_platform_admin_context(self._admin_ctx_token)
                self._school_ctx_token = None
                self._admin_ctx_token = None
            if self._correction_token is not None:
                reset_year_correction(self._correction_token)
                self._correction_token = None
