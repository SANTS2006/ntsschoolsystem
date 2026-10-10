from .context import get_request_context
from .models import AuditLog

_SENSITIVE_KEYS = {"password", "token", "access_token", "refresh_token", "secret", "api_key"}


def _scrub(data):
    if not isinstance(data, dict):
        return data
    return {
        k: ("***" if k.lower() in _SENSITIVE_KEYS else v)
        for k, v in data.items()
    }


def log_action(
    *,
    action: str,
    actor=None,
    school=None,
    entity_type: str = "",
    entity_id: str = "",
    severity: str = AuditLog.Severity.INFO,
    before: dict | None = None,
    after: dict | None = None,
    metadata: dict | None = None,
):
    """Central write path for audit entries. Never pass raw secrets in before/after."""
    ctx = get_request_context()
    AuditLog.objects.create(
        action=action,
        actor=actor,
        actor_email=getattr(actor, "email", ""),
        school=school or getattr(actor, "school", None),
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else "",
        severity=severity,
        before=_scrub(before),
        after=_scrub(after),
        metadata=metadata or {},
        ip_address=ctx.get("ip_address"),
        user_agent=ctx.get("user_agent", ""),
    )
