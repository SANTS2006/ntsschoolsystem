from django.core.validators import RegexValidator
from django.db import models

from apps.common.models import TimeStampedModel, UUIDModel
from apps.common.validators import validate_image_file

from .managers import TenantManager, UnscopedManager


HEX_COLOR = RegexValidator(r"^#[0-9a-fA-F]{6}$", "Enter a colour as #RRGGBB, e.g. #1565c0.")

# The logo's own blue and cyan — what a school looks like until the platform admin picks its colours.
DEFAULT_PRIMARY_COLOR = "#1565c0"
DEFAULT_SECONDARY_COLOR = "#22d3ee"


class School(UUIDModel, TimeStampedModel):
    """A tenant. Every school-owned record ultimately points back here."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"

    class SchoolType(models.TextChoices):
        PRIMARY = "primary", "Primary"
        SECONDARY = "secondary", "Secondary"
        COMBINED = "combined", "Combined"
        TERTIARY = "tertiary", "Tertiary"
        OTHER = "other", "Other"

    class OwnershipType(models.TextChoices):
        PUBLIC = "public", "Public/Government"
        PRIVATE = "private", "Private"
        RELIGIOUS = "religious", "Religious/Mission"
        NGO = "ngo", "NGO/Non-profit"
        OTHER = "other", "Other"

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, db_index=True)
    motto = models.CharField(max_length=255, blank=True)
    logo_url = models.URLField(blank=True)
    logo = models.FileField(upload_to="school_logos/", null=True, blank=True, validators=[validate_image_file])
    # Chosen by the platform admin when adding/editing the school; they colour the school's login page
    # and the whole app for its users, and the emails it sends.
    primary_color = models.CharField(max_length=7, default=DEFAULT_PRIMARY_COLOR, validators=[HEX_COLOR])
    secondary_color = models.CharField(max_length=7, default=DEFAULT_SECONDARY_COLOR, validators=[HEX_COLOR])

    email = models.EmailField(blank=True)
    phone_number = models.CharField(max_length=32, blank=True)
    website = models.URLField(blank=True)

    country = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=500, blank=True)

    school_type = models.CharField(max_length=20, choices=SchoolType.choices, default=SchoolType.OTHER)
    ownership_type = models.CharField(max_length=20, choices=OwnershipType.choices, default=OwnershipType.OTHER)

    currency = models.CharField(max_length=3, default="USD")
    timezone = models.CharField(max_length=64, default="UTC")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    suspended_reason = models.CharField(max_length=500, blank=True)

    settings = models.JSONField(default=dict, blank=True)

    # The overall-percentage cut-off the promotion engine (Phase 7) compares a student's
    # three-term average against. Deliberately a real, validated column rather than a key in
    # `settings` — it's read on every promotion decision, not just displayed, and every other
    # frequently-read/validated piece of school config in this codebase (Subject's CA/exam
    # split, fee amounts, ...) is a typed column for the same reason.
    promotion_threshold_percent = models.PositiveIntegerField(default=50)

    # Tertiary institutions report a grade-point average. This is the top of that scale — the points the best
    # letter grade is worth: 5.00 or 4.00. The school's own letter -> points table (GradeBoundary.gpa_value)
    # must stay within it.
    grade_point_scale = models.DecimalField(max_digits=3, decimal_places=2, default=5)

    class Meta:
        db_table = "schools"
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(promotion_threshold_percent__gte=0) & models.Q(promotion_threshold_percent__lte=100),
                name="promotion_threshold_percent_range",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE


class TenantScopedModel(UUIDModel):
    """
    Abstract base for every school-owned model (students, staff, fees, ...).

    Use `objects` for all normal request-time queries — it is scoped
    automatically to the current request's school. Use `unscoped_objects`
    only in platform-admin services or management commands, and never in a
    school-facing view.
    """

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="+")

    objects = TenantManager()
    unscoped_objects = UnscopedManager()

    class Meta:
        abstract = True
