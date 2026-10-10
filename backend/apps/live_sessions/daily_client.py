import logging

import requests
from django.conf import settings

logger = logging.getLogger("apps")

DAILY_API_BASE = "https://api.daily.co/v1"


def create_room(name: str, expiry_minutes: int = 180) -> tuple[str, str] | None:
    """
    Creates a Daily.co video room for one live lesson. Returns `(room_url, room_name)` on
    success, or `None` on any failure or when `DAILY_API_KEY` isn't configured — mirroring
    `apps.common.email.send_email`'s "never raise, just log and let the caller degrade cleanly"
    contract, so a school that hasn't set up Daily.co simply can't start live calls without
    breaking anything else in the app.
    """
    if not settings.DAILY_API_KEY:
        logger.warning("DAILY_API_KEY not configured; cannot create a Daily.co room for %r", name)
        return None

    try:
        response = requests.post(
            f"{DAILY_API_BASE}/rooms",
            headers={"Authorization": f"Bearer {settings.DAILY_API_KEY}"},
            json={
                "name": name,
                "properties": {
                    "exp": _expiry_timestamp(expiry_minutes),
                    "enable_chat": True,
                    "enable_screenshare": True,
                },
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        return data["url"], data["name"]
    except requests.RequestException:
        logger.error("Daily.co room creation failed for %r", name, exc_info=True)
        return None


def _expiry_timestamp(minutes: int) -> int:
    from django.utils import timezone

    return int((timezone.now() + timezone.timedelta(minutes=minutes)).timestamp())
