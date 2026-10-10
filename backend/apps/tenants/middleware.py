from .context import (
    reset_current_school_id,
    reset_platform_admin_context,
    set_current_school_id,
    set_platform_admin_context,
)


class TenantMiddleware:
    """
    Derives the request's tenant context strictly from the authenticated
    user (set upstream by Django's AuthenticationMiddleware / DRF auth on
    the view, whichever runs first). Never reads a school id from the
    request path, query string, or body — those are attacker-controlled.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        school_id = None
        is_platform_admin = False

        if user is not None and getattr(user, "is_authenticated", False):
            is_platform_admin = bool(getattr(user, "is_platform_admin", False))
            school_id = getattr(user, "school_id", None)

        school_token = set_current_school_id(school_id)
        admin_token = set_platform_admin_context(is_platform_admin)
        try:
            return self.get_response(request)
        finally:
            reset_current_school_id(school_token)
            reset_platform_admin_context(admin_token)
