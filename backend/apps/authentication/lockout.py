"""Per-account brute-force protection.

The IP-based throttle on `/auth/login/` stops one machine hammering the endpoint, but not a
distributed credential-stuffing run (many IPs, few attempts each, one victim account). This adds
the missing per-account limit: after MAX_FAILED_ATTEMPTS consecutive failures the account is locked
for a duration that doubles with every further failure (15m, 30m, 1h ... capped at 24h). A
successful login, or 24 hours without a failure, resets the count.

Deliberately enumeration-safe: `LoginView` returns the identical generic error whether the email
doesn't exist, the password was wrong, or the account is currently locked, so nobody can use this
to discover which emails are registered.
"""

from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.db.models import F
from django.utils import timezone

from apps.audit.services import log_action

MAX_FAILED_ATTEMPTS = 5
BASE_LOCK = timedelta(minutes=15)
MAX_LOCK = timedelta(hours=24)
FAILURE_DECAY = timedelta(hours=24)

def burn_password_hash_time(password: str) -> None:
    """Hashing the submitted password for a locked account (where we skip the real check) keeps
    response time close to a genuine failed login, so timing can't reveal that the account exists
    or is locked."""
    make_password(password)


def is_locked(user) -> bool:
    return user.locked_until is not None and user.locked_until > timezone.now()


def lock_duration(failed_count: int) -> timedelta:
    over = max(failed_count - MAX_FAILED_ATTEMPTS, 0)
    return min(BASE_LOCK * (2**over), MAX_LOCK)


def register_failure(user, *, ip: str = "") -> None:
    from django.contrib.auth import get_user_model

    User = get_user_model()
    now = timezone.now()

    # A stale count (no failure for a day) starts over, so one typo a month never adds up.
    if user.last_failed_login_at and now - user.last_failed_login_at > FAILURE_DECAY:
        User.objects.filter(pk=user.pk).update(failed_login_count=0)

    # F() expression: two simultaneous wrong guesses both count, instead of racing on a stale read.
    User.objects.filter(pk=user.pk).update(
        failed_login_count=F("failed_login_count") + 1, last_failed_login_at=now
    )
    user.refresh_from_db(fields=["failed_login_count", "last_failed_login_at", "locked_until"])

    if user.failed_login_count >= MAX_FAILED_ATTEMPTS:
        locked_until = now + lock_duration(user.failed_login_count)
        User.objects.filter(pk=user.pk).update(locked_until=locked_until)
        user.locked_until = locked_until
        log_action(
            action="auth.account_locked",
            actor=user,
            school=user.school,
            entity_type="User",
            entity_id=str(user.pk),
            severity="warning",
            metadata={"failed_attempts": user.failed_login_count, "ip": ip},
        )
        if user.failed_login_count == MAX_FAILED_ATTEMPTS:
            from .emails import send_account_locked_email

            send_account_locked_email(user=user, minutes=int(lock_duration(user.failed_login_count).total_seconds() // 60))


def register_success(user) -> None:
    from django.contrib.auth import get_user_model

    if user.failed_login_count or user.locked_until:
        get_user_model().objects.filter(pk=user.pk).update(
            failed_login_count=0, locked_until=None, last_failed_login_at=None
        )
