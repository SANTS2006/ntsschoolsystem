import logging

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from apps.common.errors import PasswordChangeRequired
from apps.common.request_id import get_request_id

logger = logging.getLogger("apps")


def _error_code_for(exc):
    if isinstance(exc, PasswordChangeRequired):
        return "PASSWORD_CHANGE_REQUIRED"
    if isinstance(exc, drf_exceptions.AuthenticationFailed):
        return "AUTHENTICATION_FAILED"
    if isinstance(exc, drf_exceptions.NotAuthenticated):
        return "NOT_AUTHENTICATED"
    if isinstance(exc, (drf_exceptions.PermissionDenied, PermissionDenied)):
        return "PERMISSION_DENIED"
    if isinstance(exc, (drf_exceptions.NotFound, Http404)):
        return "NOT_FOUND"
    if isinstance(exc, drf_exceptions.ValidationError):
        return "VALIDATION_ERROR"
    if isinstance(exc, drf_exceptions.Throttled):
        return "THROTTLED"
    if isinstance(exc, drf_exceptions.MethodNotAllowed):
        return "METHOD_NOT_ALLOWED"
    return "ERROR"


def custom_exception_handler(exc, context):
    """
    Normalizes every DRF error response to:
    {"success": false, "message": str, "code": str, "errors": [...]}
    Never leaks tracebacks, SQL, or internal details.
    """
    response = drf_exception_handler(exc, context)

    if response is None:
        request = context.get("request")
        logger.error(
            "Unhandled exception on %s %s: %s",
            getattr(request, "method", "?"),
            getattr(request, "path", "?"),
            exc,
            exc_info=True,
        )
        return Response(
            {
                "success": False,
                "message": "An unexpected error occurred. Please try again.",
                "code": "INTERNAL_ERROR",
                "errors": [],
                "requestId": get_request_id(),
            },
            status=500,
        )

    detail = response.data
    errors = []
    if isinstance(detail, dict):
        message = detail.get("detail")
        if message is None:
            for field, value in detail.items():
                values = value if isinstance(value, list) else [value]
                for v in values:
                    errors.append({"field": field, "message": str(v)})
            message = "Validation failed." if errors else "Request failed."
    elif isinstance(detail, list):
        message = "Request failed."
        errors = [{"field": None, "message": str(v)} for v in detail]
    else:
        message = str(detail)

    response.data = {
        "success": False,
        "message": str(message),
        "code": _error_code_for(exc),
        "errors": errors,
        # Quote this when reporting a problem: it finds the exact log lines for the request.
        "requestId": get_request_id(),
    }
    return response
