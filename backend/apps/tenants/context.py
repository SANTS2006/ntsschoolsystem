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


class YearCorrection:
    """Per request: may this person write to a closed academic year, and which closed years did they actually touch?
    `allowed` asks the permission check only when a closed-year write is first attempted (most requests never do)."""

    def __init__(self, check):
        self._check = check
        self._allowed = None
        self.years: set[str] = set()

    @property
    def allowed(self) -> bool:
        if self._allowed is None:
            try:
                self._allowed = bool(self._check())
            except Exception:  # noqa: BLE001 - a failing check must mean "no", never "yes"
                self._allowed = False
        return self._allowed

    def note(self, year_name: str) -> None:
        self.years.add(year_name)


_year_correction = contextvars.ContextVar("year_correction", default=None)


def set_year_correction(value):
    return _year_correction.set(value)


def get_year_correction():
    return _year_correction.get()


def reset_year_correction(token):
    _year_correction.reset(token)
