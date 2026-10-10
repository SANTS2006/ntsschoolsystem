from django.db import models

from apps.common.models import TimeStampedModel, UUIDModel


class Enquiry(UUIDModel, TimeStampedModel):
    """A demo request or contact message sent from the public website. Deliberately not tenant-scoped: it comes from
    people who are not (yet) a school on the platform. It is stored first; e-mailing it to the NTS team is a second step
    whose outcome is recorded, so a message is never lost because the mail provider was down."""

    class Kind(models.TextChoices):
        DEMO = "demo", "Demo request"
        CONTACT = "contact", "Contact message"

    class EmailStatus(models.TextChoices):
        PENDING = "pending", "Not sent yet"
        SENT = "sent", "Sent to the team"
        FAILED = "failed", "E-mail failed"
        NOT_CONFIGURED = "not_configured", "E-mail not configured"

    kind = models.CharField(max_length=10, choices=Kind.choices)
    name = models.CharField(max_length=150)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    organization = models.CharField(max_length=200, blank=True)
    school_type = models.CharField(max_length=60, blank=True)
    student_count = models.CharField(max_length=40, blank=True)
    interests = models.JSONField(default=list, blank=True)
    preferred_contact = models.CharField(max_length=20, blank=True)
    topic = models.CharField(max_length=60, blank=True)
    message = models.TextField(blank=True)
    consent = models.BooleanField(default=False)
    handled = models.BooleanField(default=False)
    email_status = models.CharField(max_length=20, choices=EmailStatus.choices, default=EmailStatus.PENDING)
    # Where it came from, for spotting abuse; not shown anywhere public.
    source_ip = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "website_enquiries"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} from {self.name}"
