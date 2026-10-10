from .context import _client_ip, reset_request_context, set_request_context


class RequestContextMiddleware:
    """
    Stashes request metadata (IP, user agent, path) needed for audit
    logging so services/signal handlers don't need `request` threaded
    through every call. Note: at this point in the middleware stack the
    authenticated user may not yet be resolved for JWT-cookie API requests
    (DRF authenticates lazily inside the view) — callers that need the
    user should read `request.user` directly from within the view instead
    of relying on this context.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ctx = {
            "ip_address": _client_ip(request),
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:500],
            "path": request.path,
            "method": request.method,
        }
        token = set_request_context(ctx)
        try:
            return self.get_response(request)
        finally:
            reset_request_context(token)
