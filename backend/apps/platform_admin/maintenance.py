"""Maintenance mode: the notice itself, and emailing everyone when it is switched on."""

import logging
from html import escape

from django.utils import timezone

from apps.common.email import send_email
from apps.users.models import User

from .models import MaintenanceNotice

logger = logging.getLogger("apps")

DEFAULT_MESSAGE = (
    "The system is currently under maintenance. Some things may be unavailable or slow for a while. "
    "We're sorry for the inconvenience and will be back shortly."
)


def notice_payload(notice: MaintenanceNotice) -> dict:
    return {
        "enabled": notice.enabled,
        "message": notice.message or DEFAULT_MESSAGE,
        "all_pages": notice.all_pages,
        "pages": list(notice.pages or []),
        "enabled_at": notice.enabled_at.isoformat() if notice.enabled_at else None,
    }


def send_maintenance_emails() -> int:
    """Tells every active user with an email address that the system is under maintenance. Each email goes
    out in that user's own school's branded template. Returns how many were sent."""
    notice = MaintenanceNotice.get_solo()
    message = notice.message or DEFAULT_MESSAGE
    sent = 0
    users = User.objects.filter(is_active=True).exclude(email="").select_related("school")
    for user in users.iterator():
        school = user.school
        body = f"""
            <p>Hi {escape(user.first_name or "there")},</p>
            <p>{escape(message).replace(chr(10), "<br>")}</p>
            <p>You don't need to do anything. We'll let you know through the app when it's all back to normal.</p>
        """
        if send_email(
            to_email=user.email,
            to_name=user.full_name,
            subject="The system is under maintenance",
            html_content=body,
            school=school,
        ):
            sent += 1
    MaintenanceNotice.objects.filter(pk=notice.pk).update(emailed_at=timezone.now())
    logger.info("Maintenance notice emailed to %s users", sent)
    return sent
