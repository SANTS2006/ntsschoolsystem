"""Serving the built React app from Django (production, single origin).

In production one web service answers everything, on whichever of its hostnames is currently
resolving (the Render-given nts-school-system.onrender.com, and/or the custom
school.ntsdigitalsolutions.com once its DNS/certificate are in place — see render.yaml):
  /api/*            -> Django REST API
  /assets/*, files  -> WhiteNoise, straight from the frontend build (long-cached, fingerprinted)
  any other path    -> index.html, so client-side routes like /students/123 survive a page reload

One origin means no CORS at all, and the auth cookies can be SameSite=Strict.
"""

from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.views.defaults import page_not_found

# No inline script, no eval, no third-party script: an XSS bug would find almost nothing to run.
# Cloudinary hosts uploaded files: images/video are shown directly (img/media-src), and the in-app file
# viewer also fetches them to save as a download or preview text (connect-src) and shows PDFs in an
# iframe (frame-src). Daily.co hosts the live-lesson room (iframe + signalling). Google's sign-in script, button
# frame and stylesheet are allowed for "Sign in with Google" (and nothing else of Google's).
SPA_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self' https://accounts.google.com/gsi/client; "
    "style-src 'self' https://accounts.google.com/gsi/style; style-src-attr 'unsafe-inline'; "
    "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com; "
    "media-src 'self' blob: https://res.cloudinary.com; "
    "font-src 'self'; "
    "connect-src 'self' https://res.cloudinary.com https://*.daily.co wss://*.daily.co https://accounts.google.com/gsi/; "
    "frame-src blob: https://res.cloudinary.com https://*.daily.co https://accounts.google.com/gsi/; "
    "manifest-src 'self'; worker-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; "
    "upgrade-insecure-requests"
)

# Camera/microphone/screen-share only for our own origin and the Daily room (live lessons).
SPA_PERMISSIONS_POLICY = (
    'camera=(self "https://*.daily.co"), microphone=(self "https://*.daily.co"), '
    'display-capture=(self "https://*.daily.co"), fullscreen=(self "https://*.daily.co"), '
    "geolocation=(), payment=(), usb=(), interest-cohort=()"
)


def apply_document_headers(headers) -> None:
    """Headers every HTML document (the SPA shell) must carry."""
    headers["Content-Security-Policy"] = SPA_CONTENT_SECURITY_POLICY
    headers["Permissions-Policy"] = SPA_PERMISSIONS_POLICY
    headers["Cross-Origin-Resource-Policy"] = "same-origin"
    # Not "same-origin": that would blank the Google sign-in popup (see SECURE_CROSS_ORIGIN_OPENER_POLICY).
    headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    # The shell must be revalidated on every load so a new deploy is picked up immediately.
    headers["Cache-Control"] = "no-cache"


def whitenoise_headers(headers, path, url):
    """WhiteNoise hook (WHITENOISE_ADD_HEADERS_FUNCTION): runs for each static file it serves."""
    if str(path).endswith(".html"):
        apply_document_headers(headers)
    elif url in ("/sw.js", "/manifest.webmanifest"):
        # The service worker and manifest must always be revalidated, or a new deploy (and the new
        # worker that carries it) could sit behind a stale cache for days. The worker controls the
        # whole site, so it is explicitly allowed the "/" scope.
        headers["Cache-Control"] = "no-cache"
        if url == "/sw.js":
            headers["Service-Worker-Allowed"] = "/"
    elif url.startswith(("/assets/", "/site-assets/")):
        # Vite fingerprints these names by content, so they can be cached forever.
        headers["Cache-Control"] = "public, max-age=31536000, immutable"


# Things the browser asks for as *files*. If one reaches the fallback it doesn't exist (WhiteNoise serves the real
# ones before Django is consulted), so it must be a 404 — answering with the app's HTML instead makes a script
# tag receive "HTML as JavaScript", which is exactly how a stale tab after a deploy ends up as a blank page.
_FILE_SUFFIXES = (
    ".js", ".mjs", ".css", ".map", ".json", ".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2",
    ".ttf", ".txt", ".xml", ".webmanifest",
)


def _is_missing_file_request(path: str) -> bool:
    return path.startswith(("/assets/", "/site-assets/")) or path.lower().endswith(_FILE_SUFFIXES)


def _marketing_page(path: str):
    """The prerendered public-website page for this path, or None if the path isn't one of its pages.

    The website is built to `website_dist/<route>/index.html` plus a `routes.json` listing every page; only listed
    routes are served, so no other path can be turned into a read of an arbitrary file."""
    root = Path(settings.WEBSITE_DIST_DIR)
    manifest = root / "routes.json"
    if not manifest.is_file():
        return None
    import json

    try:
        routes = set(json.loads(manifest.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return None
    clean = "/" + path.strip("/")
    if clean not in routes:
        return None
    page = root / ("index.html" if clean == "/" else f"{clean.strip('/')}/index.html")
    return page if page.is_file() else None


def spa_index(request, *args, **kwargs):
    """Fallback for any non-API, non-file path: a page of the public website if it is one, otherwise the React app's
    HTML shell."""
    if request.method not in ("GET", "HEAD"):
        raise Http404
    if _is_missing_file_request(request.path):
        raise Http404("No such file.")
    page = _marketing_page(request.path)
    if page is not None:
        response = FileResponse(open(page, "rb"), content_type="text/html; charset=utf-8")
        apply_document_headers(response.headers)
        # Lets the service worker tell a marketing page from the app's shell (it must never cache one as the other).
        response.headers["X-NTS-Surface"] = "marketing"
        # Marketing pages are the same for everyone, so they may be cached briefly by browsers and the CDN.
        response.headers["Cache-Control"] = "public, max-age=300, must-revalidate"
        return response
    index = Path(settings.FRONTEND_DIST_DIR) / "index.html"
    if not index.is_file():
        raise Http404("Frontend build not found.")
    response = FileResponse(open(index, "rb"), content_type="text/html; charset=utf-8")
    apply_document_headers(response.headers)
    return response


def not_found(request, exception=None):
    """404 handler: API clients always get the JSON envelope, never an HTML page."""
    if request.path.startswith("/api/"):
        return JsonResponse(
            {"success": False, "message": "Not found.", "code": "NOT_FOUND", "errors": []}, status=404
        )
    return page_not_found(request, exception)
