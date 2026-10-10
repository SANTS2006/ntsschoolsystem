from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_upload_file
from apps.tenants.models import TenantScopedModel


class Record(TenantScopedModel, TimeStampedModel):
    """An important, school-wide piece of information — a policy, a circular, a scanned
    certificate, a notice — kept in one shared place. Deliberately separate from `apps.documents`
    (which is permission-gated far more broadly: teachers, accountants and exams directors all
    hold `documents.*`) — a Record is meant to be visible to literally everyone signed in at the
    school, staff and students alike, with only Principal/School-Administrator able to add or
    change one. See `RecordViewSet` for how that read-for-everyone / write-for-two-roles split is
    actually enforced.

    Either `body` (free text) or `file` (a document/image/other upload) must be present — a
    record with neither would have nothing to actually show. `save()` is the backstop for any
    creation path that bypasses the serializer (management commands, `unscoped_objects.create`);
    `RecordSerializer.validate()` gives the same rule a clean 400 in the normal API path.
    """

    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True)
    body = models.TextField(blank=True)
    file = models.FileField(upload_to="records/", blank=True, validators=[validate_upload_file])
    created_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "records"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.body and not self.file:
            raise ValueError("Record.body or Record.file (or both) must be set.")
        if self.created_by_id and self.created_by.school_id != self.school_id:
            raise ValueError("Record.created_by must belong to the same school")
        super().save(*args, **kwargs)
