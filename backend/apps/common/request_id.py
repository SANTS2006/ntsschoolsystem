"""A correlation id for every request: taken from the caller's `X-Request-ID` (when it looks sane) or generated, put on
the response, in every log line written while the request is handled, and in error bodies — so "it failed at 14:02"
becomes one id that finds the exact log lines."""

import logging
import re
import uuid
from contextvars import ContextVar

_request_id: ContextVar[str] = ContextVar("request_id", default="-")
_SAFE = re.compile(r"^[A-Za-z0-9._\-]{8,64}$")

HEADER = "X-Request-ID"


def get_request_id() -> str:
    return _request_id.get()


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.META.get("HTTP_X_REQUEST_ID", "")
        request_id = incoming if _SAFE.match(incoming) else uuid.uuid4().hex
        token = _request_id.set(request_id)
        request.request_id = request_id
        try:
            response = self.get_response(request)
        finally:
            _request_id.reset(token)
        response[HEADER] = request_id
        return response


class RequestIdFilter(logging.Filter):
    """Adds `%(request_id)s` to every log record."""

    def filter(self, record):
        record.request_id = _request_id.get()
        return True
