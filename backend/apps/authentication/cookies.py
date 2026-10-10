from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken


def issue_tokens_for_user(user) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def set_auth_cookies(response, *, access_token: str, refresh_token: str) -> None:
    common = dict(
        httponly=True,
        secure=getattr(settings, "AUTH_COOKIE_SECURE", False),
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        settings.AUTH_COOKIE_ACCESS_NAME,
        access_token,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        **common,
    )
    response.set_cookie(
        settings.AUTH_COOKIE_REFRESH_NAME,
        refresh_token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        **common,
    )


def clear_auth_cookies(response) -> None:
    response.delete_cookie(settings.AUTH_COOKIE_ACCESS_NAME, path="/")
    response.delete_cookie(settings.AUTH_COOKIE_REFRESH_NAME, path="/")
