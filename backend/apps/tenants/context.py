"""
Per-request tenant context.

A ContextVar is safe here because it is set and reset within a single
request/response cycle by TenantMiddleware (try/finally), and DRF/Django's
WSGI handling processes one request at a time per context. It must never be
used to cache or share business data across requests.
"""

import contextvars

_current_school_id = contextvars.ContextVar("current_school_id", default=None)
_is_platform_admin = contextvars.ContextVar("is_platform_admin", default=False)


def set_current_school_id(school_id):
    return _current_school_id.set(school_id)


def get_current_school_id():
    return _current_school_id.get()


def reset_current_school_id(token):
    _current_school_id.reset(token)


def set_platform_admin_context(value: bool):
    return _is_platform_admin.set(value)


def is_platform_admin_context() -> bool:
    return _is_platform_admin.get()


def reset_platform_admin_context(token):
    _is_platform_admin.reset(token)
