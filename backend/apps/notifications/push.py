"""Web Push: tells a person's browsers about a new notification the moment it is created, even if the app is closed.

The browser's push service delivers the message; nothing here holds a connection open. If VAPID keys are not configured
this does nothing, and the in-app bell (which polls) still works."""

import json
import logging

from django.conf import settings

from .models import PushSubscription

logger = logging.getLogger("apps")


def push_enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def _send_one(subscription: PushSubscription, payload: str) -> None:
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={"endpoint": subscription.endpoint, "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}},
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=86400,
        )
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):  # the browser says this subscription no longer exists
            subscription.delete()
        else:
            logger.warning("Push to %s failed: %s", subscription.pk, exc)


def send_push_to_users(user_ids, title: str, body: str, url: str = "", tag: str = "") -> None:
    """Sends one alert to every subscribed device of the given users. Never raises."""
    if not push_enabled():
        return
    payload = json.dumps({"title": title[:120], "body": body[:240], "url": url or "/notifications", "tag": tag})
    for subscription in PushSubscription.objects.filter(user_id__in=list(user_ids)):
        try:
            _send_one(subscription, payload)
        except Exception:  # noqa: BLE001 - one bad device must not stop the others
            logger.exception("Push to %s failed", subscription.pk)
