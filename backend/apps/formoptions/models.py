from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class FormOption(TenantScopedModel, TimeStampedModel):
    """A choice a school added to one of its dropdowns by picking "Other" and typing it in (e.g. a new
    complaint category). `field_key` names the dropdown (see registry.py); the built-in choices stay
    in code, these are only the school's own additions, available to everyone at that school from
    then on."""

    field_key = models.CharField(max_length=60)
    value = models.CharField(max_length=60)
    label = models.CharField(max_length=100)
    created_by = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "form_options"
        ordering = ["label"]
        constraints = [
            models.UniqueConstraint(fields=["school", "field_key", "value"], name="unique_form_option_per_school"),
        ]

    def __str__(self):
        return f"{self.field_key}: {self.label}"
