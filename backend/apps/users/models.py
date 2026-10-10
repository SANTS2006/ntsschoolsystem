import uuid
from datetime import timedelta

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_image_file

# A session is considered "online" if it sent a heartbeat within this window — comfortably
# longer than the frontend's own ~60s heartbeat interval so one missed/delayed ping doesn't
# flip the dot, but short enough that closing the tab reads as offline within a couple minutes.
ONLINE_WINDOW = timedelta(minutes=2)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("user_type", User.UserType.SCHOOL_USER)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("user_type", User.UserType.PLATFORM_ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        if extra_fields.get("school") is not None:
            raise ValueError("Platform superusers must not belong to a school.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    class UserType(models.TextChoices):
        PLATFORM_ADMIN = "platform_admin", "Platform Administrator"
        SCHOOL_USER = "school_user", "School User"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=32, blank=True)
    photo = models.FileField(upload_to="user_photos/", null=True, blank=True, validators=[validate_image_file])

    user_type = models.CharField(max_length=20, choices=UserType.choices, default=UserType.SCHOOL_USER)
    school = models.ForeignKey(
        "tenants.School", null=True, blank=True, on_delete=models.PROTECT, related_name="users"
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    email_verified_at = models.DateTimeField(null=True, blank=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    # Brute-force protection (see apps.authentication.lockout). Per-account, stored in the
    # database rather than a cache: gunicorn runs several worker processes and this project has
    # no shared cache backend, so an in-memory counter would let an attacker get N attempts per
    # worker instead of N attempts total.
    # True while the account still uses a password somebody else chose (the school default it was
    # provisioned with, or one an administrator just reset it to). The API refuses everything except
    # changing the password until it is cleared - see CookieJWTAuthentication.
    must_change_password = models.BooleanField(default=False)
    # Set when someone whose role *recommends* two-factor (platform admins, principals) turns it off on purpose
    # from their settings. It stops the sign-in from insisting on enrolment again; turning it back on clears it,
    # as does a platform admin resetting the account's second factor.
    two_factor_opt_out = models.BooleanField(default=False)

    failed_login_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_failed_login_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    objects = UserManager()

    class Meta:
        db_table = "users"
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(user_type="platform_admin", school__isnull=True)
                    | models.Q(user_type="school_user", school__isnull=False)
                ),
                name="platform_admin_has_no_school_school_user_has_school",
            )
        ]

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_platform_admin(self):
        return self.user_type == self.UserType.PLATFORM_ADMIN

    @property
    def is_email_verified(self):
        return self.email_verified_at is not None

    @property
    def is_online(self):
        return self.last_seen_at is not None and timezone.now() - self.last_seen_at < ONLINE_WINDOW
