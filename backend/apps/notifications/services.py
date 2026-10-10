from django.utils import timezone

from apps.common.email import send_email

from .models import Notification


def notify(
    *,
    recipient,
    category: str,
    title: str,
    message: str,
    link: str = "",
    priority: str = Notification.Priority.NORMAL,
    email_subject: str | None = None,
    email_html: str | None = None,
) -> Notification:
    """
    The single entry point for "a business event happened, tell someone" —
    creates the in-app Notification and, if email_subject/email_html are
    given, sends the email too. Centralizing both channels here is what the
    spec means by "a business event should be capable of triggering a
    database notification and an email notification" without duplicating
    that logic in every app that wants to notify someone.
    """
    notification = Notification.objects.create(
        school=recipient.school,
        recipient=recipient,
        category=category,
        priority=priority,
        title=title,
        message=message,
        link=link,
    )
    if email_subject and email_html and recipient.email:
        send_email(
            to_email=recipient.email,
            to_name=recipient.full_name,
            subject=email_subject,
            html_content=email_html,
            school=recipient.school,
        )
    return notification


def notify_bulk(
    *,
    recipients,
    category: str,
    title: str,
    message: str,
    link: str = "",
    priority: str = Notification.Priority.NORMAL,
) -> list[Notification]:
    """
    Bulk in-app notification for many recipients at once (e.g. an
    announcement) — one bulk_create rather than N individual creates. Email
    is intentionally not part of this path (a broad blast is a separate,
    explicit decision per caller — see apps.communications.services, which
    sends email per-recipient only when the announcement opts in).
    """
    recipients = list(recipients)
    if not recipients:
        return []
    school = recipients[0].school
    notifications = [
        Notification(
            school=school,
            recipient=user,
            category=category,
            priority=priority,
            title=title,
            message=message,
            link=link,
        )
        for user in recipients
    ]
    return Notification.objects.bulk_create(notifications)


def mark_read(notification: Notification) -> Notification:
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=["is_read", "read_at", "updated_at"])
    return notification
