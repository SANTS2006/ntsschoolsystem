import contextvars

_current_request_ctx = contextvars.ContextVar("current_request_ctx", default=None)


def set_request_context(ctx: dict):
    return _current_request_ctx.set(ctx)


def get_request_context() -> dict:
    return _current_request_ctx.get() or {}


def reset_request_context(token):
    _current_request_ctx.reset(token)


def _client_ip(request):
    from apps.common.net import get_client_ip

    return get_client_ip(request)
