"""Authenticator-app (TOTP, RFC 6238) two-factor authentication.

Design notes worth knowing before changing anything here:

* Required accounts (platform admins + roles in settings.TWO_FACTOR_REQUIRED_ROLES) never receive a
  session without a second factor: login returns a short-lived *challenge token* instead of cookies,
  and cookies are only issued once a valid code (or, for first enrolment, a confirmed enrolment) is
  presented. There is no "logged in but 2FA pending" state to get wrong.
* Guessing a 6-digit code is a brute-force target exactly like a password, so wrong codes feed the
  same per-account lockout (apps.authentication.lockout) and a code can never be replayed.
* TOTP secrets are encrypted at rest; recovery codes are stored only as keyed hashes.
"""

import base64
import hashlib
import hmac
import secrets
import time

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.audit.services import log_action

from .models import RecoveryCode, TwoFactorDevice

STEP_SECONDS = 30
RECOVERY_CODE_COUNT = 10
# Unambiguous alphabet (no 0/O, 1/I/L) so a code read off paper can't be mistyped.
_RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

CHALLENGE_MAX_AGE_SECONDS = 5 * 60
SETUP_MAX_AGE_SECONDS = 15 * 60
_CHALLENGE_SALT = "nts.two-factor.challenge"


# ---- key material ---------------------------------------------------------------------------


def _derive_key(info: bytes) -> bytes:
    material = (getattr(settings, "TWO_FACTOR_ENCRYPTION_KEY", None) or settings.SECRET_KEY).encode()
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=info).derive(material)


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_derive_key(b"nts-2fa-secret-encryption")))


def _recovery_hash(code: str) -> str:
    normalized = code.replace("-", "").replace(" ", "").upper()
    return hmac.new(_derive_key(b"nts-2fa-recovery-hash"), normalized.encode(), hashlib.sha256).hexdigest()


def _decrypt_secret(device: TwoFactorDevice) -> str:
    try:
        return _fernet().decrypt(device.secret_encrypted.encode()).decode()
    except InvalidToken as exc:  # key changed or row tampered with: fail closed, never guess
        raise ValueError("Two-factor secret cannot be decrypted.") from exc


# ---- policy ---------------------------------------------------------------------------------


def policy_requires(user) -> bool:
    """Whether the account's role is one that is expected to use two-factor, whatever the person chose."""
    # Constant True in every real environment (deliberately not an environment variable); only the
    # test-suite flips it, so the ~2000 existing tests that sign in as a Principal keep working.
    if not settings.TWO_FACTOR_ENFORCEMENT:
        return False
    if user.is_platform_admin:
        return True
    required = set(getattr(settings, "TWO_FACTOR_REQUIRED_ROLES", []))
    if not required:
        return False
    from apps.authorization.models import UserRole

    return UserRole.unscoped_objects.filter(user=user, role__slug__in=required).exists()


def is_required_for(user) -> bool:
    """Whether sign-in must go through a second factor (enrolling one first if need be): the role expects it
    and the person hasn't chosen to switch it off in their settings."""
    return policy_requires(user) and not getattr(user, "two_factor_opt_out", False)


def is_enabled(user) -> bool:
    return TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=False).exists()


def recovery_codes_remaining(user) -> int:
    return RecoveryCode.objects.filter(user=user, used_at__isnull=True).count()


# ---- challenge tokens (login is split into two requests) -------------------------------------


def make_challenge_token(user, purpose: str) -> str:
    """Signed, short-lived proof that this user just passed the password check. Includes a slice of
    the current password hash, so changing the password invalidates every outstanding token."""
    return signing.dumps({"u": str(user.pk), "p": purpose, "h": user.password[-12:]}, salt=_CHALLENGE_SALT)


def read_challenge_token(token: str, purpose: str):
    """Returns the user, or None for anything wrong: bad signature, expired, wrong purpose,
    unknown/inactive user, or password changed since it was issued."""
    from django.contrib.auth import get_user_model

    max_age = SETUP_MAX_AGE_SECONDS if purpose == "setup" else CHALLENGE_MAX_AGE_SECONDS
    try:
        data = signing.loads(token, salt=_CHALLENGE_SALT, max_age=max_age)
    except signing.BadSignature:
        return None
    if data.get("p") != purpose:
        return None
    user = get_user_model().objects.filter(pk=data.get("u"), is_active=True).select_related("school").first()
    if user is None or not hmac.compare_digest(user.password[-12:], data.get("h", "")):
        return None
    return user


# ---- enrolment ------------------------------------------------------------------------------


def begin_enrollment(user) -> dict:
    """Creates (or replaces an unconfirmed) device and returns what the authenticator app needs."""
    if is_enabled(user):
        raise ValueError("Two-factor authentication is already enabled.")
    secret = pyotp.random_base32()
    TwoFactorDevice.objects.update_or_create(
        user=user,
        defaults={"secret_encrypted": _fernet().encrypt(secret.encode()).decode(), "confirmed_at": None, "last_used_step": 0},
    )
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=settings.TWO_FACTOR_ISSUER)
    return {"secret": secret, "otpauth_uri": uri}


def confirm_enrollment(user, code: str) -> list[str] | None:
    """Verifies the first code from the user's app. On success the device is switched on and a fresh
    set of recovery codes is returned (shown once). Returns None if the code is wrong."""
    device = TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=True).first()
    if device is None:
        return None
    step = _matching_step(_decrypt_secret(device), code, after=0)
    if step is None:
        return None
    with transaction.atomic():
        device.confirmed_at = timezone.now()
        device.last_used_step = step
        device.save(update_fields=["confirmed_at", "last_used_step"])
        codes = _issue_recovery_codes(user)
        if user.two_factor_opt_out:
            user.two_factor_opt_out = False
            user.save(update_fields=["two_factor_opt_out"])
    log_action(
        action="auth.2fa_enabled", actor=user, school=user.school, entity_type="User",
        entity_id=str(user.pk), severity="warning",
    )
    return codes


def _issue_recovery_codes(user) -> list[str]:
    RecoveryCode.objects.filter(user=user).delete()
    plain = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
        RecoveryCode.objects.create(user=user, code_hash=_recovery_hash(raw))
        plain.append(f"{raw[:5]}-{raw[5:]}")
    return plain


def regenerate_recovery_codes(user) -> list[str]:
    with transaction.atomic():
        codes = _issue_recovery_codes(user)
    log_action(
        action="auth.2fa_recovery_codes_regenerated", actor=user, school=user.school,
        entity_type="User", entity_id=str(user.pk), severity="warning",
    )
    return codes


def disable(user, *, by=None) -> None:
    """Removes the second factor. `by` is the operator when it isn't the user themselves."""
    TwoFactorDevice.objects.filter(user=user).delete()
    RecoveryCode.objects.filter(user=user).delete()
    # Turning it off yourself is a choice that sticks; an operator's reset sends the person back to enrolling.
    opt_out = by is None and policy_requires(user)
    if user.two_factor_opt_out != opt_out:
        user.two_factor_opt_out = opt_out
        user.save(update_fields=["two_factor_opt_out"])
    log_action(
        action="auth.2fa_disabled" if by is None else "auth.2fa_reset",
        actor=by or user, school=user.school, entity_type="User", entity_id=str(user.pk),
        severity="warning", metadata={} if by is None else {"reset_by": str(by.pk)},
    )


# ---- verification ---------------------------------------------------------------------------


def _matching_step(secret: str, code: str, *, after: int) -> int | None:
    """The time-step whose code equals `code`, allowing one step of clock drift either way, and only
    steps newer than `after` (replay protection). Constant-time comparison."""
    if not (code.isdigit() and len(code) == 6):
        return None
    totp = pyotp.TOTP(secret, interval=STEP_SECONDS)
    now_step = int(time.time()) // STEP_SECONDS
    match = None
    for step in (now_step - 1, now_step, now_step + 1):
        if hmac.compare_digest(totp.at(step * STEP_SECONDS), code) and step > after:
            match = step
    return match


def verify_code(user, raw_code: str) -> bool:
    """True if `raw_code` is a currently valid authenticator code or an unused recovery code.
    A recovery code is consumed on use."""
    code = (raw_code or "").replace(" ", "").replace("-", "").strip()
    if not code:
        return False

    device = TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=False).first()
    if device is None:
        return False

    if code.isdigit():
        step = _matching_step(_decrypt_secret(device), code, after=device.last_used_step)
        if step is None:
            return False
        # Compare-and-set: two simultaneous requests replaying one code can't both win.
        won = TwoFactorDevice.objects.filter(pk=device.pk, last_used_step__lt=step).update(last_used_step=step)
        return bool(won)

    used = RecoveryCode.objects.filter(
        Q(user=user) & Q(code_hash=_recovery_hash(code)) & Q(used_at__isnull=True)
    ).update(used_at=timezone.now())
    if used:
        log_action(
            action="auth.2fa_recovery_code_used", actor=user, school=user.school,
            entity_type="User", entity_id=str(user.pk), severity="warning",
            metadata={"remaining": recovery_codes_remaining(user)},
        )
        return True
    return False
