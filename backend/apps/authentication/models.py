from django.conf import settings
from django.db import models


class TwoFactorDevice(models.Model):
    """A user's authenticator-app (TOTP) enrolment. One per user.

    `secret_encrypted` is the TOTP shared secret, encrypted at rest (see two_factor.py): a leaked
    database dump alone must not hand an attacker working second factors. The device only counts
    once `confirmed_at` is set — i.e. after the user proved their app produces valid codes.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="two_factor")
    secret_encrypted = models.TextField()
    confirmed_at = models.DateTimeField(null=True, blank=True)
    # The 30-second time-step of the last accepted code. A code is valid only for a step strictly
    # greater than this, so a code that was shoulder-surfed or phished can't be replayed.
    last_used_step = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "two_factor_devices"

    @property
    def is_confirmed(self) -> bool:
        return self.confirmed_at is not None


class RecoveryCode(models.Model):
    """Single-use backup code for when the phone is lost. Only a keyed hash is stored, so the
    plaintext exists only in the one response that shows it to the user."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recovery_codes")
    code_hash = models.CharField(max_length=64, db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "two_factor_recovery_codes"
