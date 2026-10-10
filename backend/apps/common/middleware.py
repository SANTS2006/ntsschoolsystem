"""Defence-in-depth HTTP middleware: response security headers and request-size limits."""

from django.http import JsonResponse

# Non-file request bodies (JSON / form posts) have no legitimate reason to be large. Django's own
# DATA_UPLOAD_MAX_MEMORY_SIZE is meant to enforce this, but Django REST Framework's `request.data`
# parser historically bypassed it, so it is enforced here on the declared Content-Length as well.
MAX_NON_FILE_BODY_BYTES = 2 * 1024 * 1024
# Multipart uploads: the largest legitimate file is a lesson video (200MB, see
# apps.common.validators.MAX_VIDEO_SIZE_BYTES) plus form fields/overhead.
MAX_MULTIPART_BODY_BYTES = 210 * 1024 * 1024


class RequestSizeLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        raw_length = request.META.get("CONTENT_LENGTH")
        if raw_length:
            try:
                length = int(raw_length)
            except ValueError:
                return self._reject("Invalid Content-Length.", 400)
            content_type = (request.META.get("CONTENT_TYPE") or "").lower()
            limit = MAX_MULTIPART_BODY_BYTES if content_type.startswith("multipart/") else MAX_NON_FILE_BODY_BYTES
            if length > limit:
                return self._reject("Request body too large.", 413)
        return self.get_response(request)

    @staticmethod
    def _reject(message, status):
        return JsonResponse(
            {"success": False, "message": message, "code": "REQUEST_TOO_LARGE", "errors": []}, status=status
        )


class SecurityHeadersMiddleware:
    """Headers Django's SecurityMiddleware doesn't set.

    - API responses are never cacheable: a school PC shared between users must not be able to show
      the previous person's student records from the browser cache/back button.
    - The API only ever returns JSON, so its CSP is the most restrictive possible: nothing may be
      loaded or framed, even if a response were somehow rendered as a document.
    - Permissions-Policy switches off browser features this app never uses (camera/mic are enabled
      only on the frontend origin, for live lessons, by the reverse proxy's own header).
    """

    API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    PERMISSIONS_POLICY = "geolocation=(), payment=(), usb=(), interest-cohort=()"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.headers.setdefault("Permissions-Policy", self.PERMISSIONS_POLICY)
        response.headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers.setdefault("Content-Security-Policy", self.API_CSP)
        return response
