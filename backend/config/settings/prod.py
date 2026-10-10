from .base import *  # noqa: F401,F403

DEBUG = False

# ---------------------------------------------------------------------------
# Refuse to start with an unsafe configuration
# ---------------------------------------------------------------------------
if not SECRET_KEY or SECRET_KEY.startswith("django-insecure") or len(SECRET_KEY) < 40:  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY must be set to a random value of at least 40 characters in production.")

if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:  # noqa: F405
    raise RuntimeError("DJANGO_ALLOWED_HOSTS must list explicit hostnames (no '*') in production.")

for _origin_setting in ("CORS_ALLOWED_ORIGINS", "CSRF_TRUSTED_ORIGINS"):
    for _origin in globals()[_origin_setting]:
        if not _origin.startswith("https://"):
            raise RuntimeError(f"{_origin_setting} must contain only https:// origins in production (got {_origin!r}).")

if not FRONTEND_URL.startswith("https://"):  # noqa: F405
    raise RuntimeError("FRONTEND_URL must be an https:// URL in production (it is embedded in emailed links).")

# ---------------------------------------------------------------------------
# Transport security
# ---------------------------------------------------------------------------
# TLS terminates at the reverse proxy (Caddy/nginx); it tells Django the original scheme via this
# header. Without it SECURE_SSL_REDIRECT sees every request as plain HTTP and redirects forever.
# Safe only because the app container is reachable ONLY through the proxy (see docker-compose.prod.yml).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = False

if TRUSTED_PROXY_COUNT < 1:  # noqa: F405
    raise RuntimeError(
        "TRUSTED_PROXY_COUNT must be >= 1 in production (the app runs behind the reverse proxy); "
        "at 0 every visitor shares the proxy's IP, so one user's failed logins would throttle everyone."
    )

SECURE_SSL_REDIRECT = True
# The container health probe calls the app over plain HTTP from inside the Docker network.
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/$"]

SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
# Deliberately NOT preloaded: preload is a domain-wide, effectively irreversible commitment, and
# this deployment lives on a subdomain of a domain that hosts other things.
SECURE_HSTS_PRELOAD = False
SILENCED_SYSTEM_CHECKS = ["security.W021"]  # the deliberate "no preload" choice above

# ---------------------------------------------------------------------------
# Cookies
# ---------------------------------------------------------------------------
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
AUTH_COOKIE_SECURE = True

# The SPA and the API are served from ONE origin (the proxy routes /api/* to Django), so the auth
# cookies never need to travel cross-site: Strict is safe and blocks every cross-site send.
AUTH_COOKIE_SAMESITE = "Strict"
SESSION_COOKIE_SAMESITE = "Strict"

# `__Host-` prefix: browsers only accept the cookie if it is Secure, has Path=/ and no Domain
# attribute — so a sibling subdomain (or anything else on ntsdigitalsolutions.com) can never
# overwrite or "toss" our session cookies. (Names only the server reads; the SPA never sees them.)
AUTH_COOKIE_ACCESS_NAME = "__Host-access"
AUTH_COOKIE_REFRESH_NAME = "__Host-refresh"

# ---------------------------------------------------------------------------
# Static files / middleware
# ---------------------------------------------------------------------------
MIDDLEWARE = MIDDLEWARE.copy()  # noqa: F405
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")
# STORAGES is a plain dict shared with the base module's namespace via `import *`
# (mutable, not re-created here) — copy before mutating, same reasoning as MIDDLEWARE above.
STORAGES = {  # noqa: F405
    **STORAGES,  # noqa: F405
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# WhiteNoise also serves the React build at the site root (/assets/*, /nts-logo.webp, ...). Its own
# index handling is off: "/" and every client-side route go through apps.common.spa.spa_index so the
# HTML shell always gets the CSP/cache headers.
WHITENOISE_ROOT = FRONTEND_DIST_DIR  # noqa: F405
WHITENOISE_INDEX_FILE = False
# The PWA manifest's own media type (Python's mimetypes doesn't always know ".webmanifest").
WHITENOISE_MIMETYPES = {".webmanifest": "application/manifest+json"}
def WHITENOISE_ADD_HEADERS_FUNCTION(headers, path, url):  # noqa: N802 - WhiteNoise wants a callable, not a dotted path
    from apps.common.spa import whitenoise_headers

    whitenoise_headers(headers, path, url)

# ---------------------------------------------------------------------------
# Error reporting
# ---------------------------------------------------------------------------
SENTRY_DSN = env("SENTRY_DSN")  # noqa: F405
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
