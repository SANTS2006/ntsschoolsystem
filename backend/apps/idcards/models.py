from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class IdCard(TenantScopedModel, TimeStampedModel):
    """One issued ID card for a student OR a staff member. `payload` and `qr_svg` are snapshots
    taken at issue time — the card is a point-in-time document (name, class and photo as they
    were when it was printed), and re-issuing is how it gets refreshed, which replaces this row
    rather than mutating it. The QR itself never contains personal data, only a verification URL
    carrying `verify_token`: a scanner sees the live, public-safe identity check (see
    services.verification_summary) and whether the card is still valid, and a lost card can be
    revoked without anyone holding a copy of the data."""

    class HolderType(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        REVOKED = "revoked", "Revoked"
        REPLACED = "replaced", "Replaced"

    holder_type = models.CharField(max_length=10, choices=HolderType.choices)
    student = models.ForeignKey("students.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="id_cards")
    staff = models.ForeignKey("staff.Staff", null=True, blank=True, on_delete=models.CASCADE, related_name="id_cards")

    card_number = models.CharField(max_length=32)
    verify_token = models.CharField(max_length=64, unique=True)
    payload = models.JSONField(default=dict)
    qr_svg = models.TextField(blank=True)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    issued_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateField(null=True, blank=True)
    issued_by = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "id_cards"
        ordering = ["-issued_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(holder_type="student", student__isnull=False, staff__isnull=True)
                    | models.Q(holder_type="staff", staff__isnull=False, student__isnull=True)
                ),
                name="idcard_exactly_one_holder",
            ),
            models.UniqueConstraint(fields=["school", "card_number"], name="unique_idcard_number_per_school"),
            models.UniqueConstraint(
                fields=["student"], condition=models.Q(status="active"), name="one_active_idcard_per_student"
            ),
            models.UniqueConstraint(
                fields=["staff"], condition=models.Q(status="active"), name="one_active_idcard_per_staff"
            ),
        ]

    def __str__(self):
        return self.card_number

    @property
    def holder(self):
        return self.student if self.holder_type == self.HolderType.STUDENT else self.staff

    @property
    def is_valid(self) -> bool:
        if self.status != self.Status.ACTIVE:
            return False
        return self.expires_at is None or self.expires_at >= timezone.localdate()

    def save(self, *args, **kwargs):
        holder = self.holder
        if holder is not None and holder.school_id != self.school_id:
            raise ValueError("IdCard.school must match its holder's school")
        super().save(*args, **kwargs)
