from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from apps.common.errors import PasswordChangeRequired


class _CSRFCheck(CsrfViewMiddleware):
    def _reject(self, request, reason):
        return reason


class CookieJWTAuthentication(JWTAuthentication):
    """
    Reads the access token from an httpOnly cookie instead of the
    Authorization header, so tokens are never reachable from JS (mitigates
    XSS token theft).

    DRF's APIView.as_view() wraps dispatch in @csrf_exempt, and CSRF is
    normally re-enforced only inside SessionAuthentication — a custom
    cookie-based authenticator gets none of that for free, so we replicate
    it here (same pattern DRF itself uses) for every unsafe request that
    authenticates via this cookie.
    """

    # While `must_change_password` is set, these are the ONLY endpoints the account may call: read
    # who it is, change the password, keep the session alive, sign out. Everything else is refused
    # here, in the one place every authenticated request passes through, so no individual view can
    # forget the rule.
    PASSWORD_CHANGE_ALLOWED_PATHS = frozenset(
        {
            "/api/v1/auth/me/",
            "/api/v1/auth/change-password/",
            "/api/v1/auth/heartbeat/",
            "/api/v1/auth/logout/",
        }
    )

    def authenticate(self, request):
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS_NAME)
        if raw_token is None:
            return None
        try:
            validated_token = self.get_validated_token(raw_token)
        except InvalidToken:
            return None
        self.enforce_csrf(request)
        user = self.get_user(validated_token)
        # Which of their roles a multi-role user is working as (see apps.authorization.services.active_role_slug).
        user.active_role_slug = (request.META.get("HTTP_X_ACTIVE_ROLE", "") or "").strip().lower()[:100] or None
        if user.must_change_password and request.path not in self.PASSWORD_CHANGE_ALLOWED_PATHS:
            raise PasswordChangeRequired()
        return user, validated_token

    def enforce_csrf(self, request):
        check = _CSRFCheck(lambda r: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")
