from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode


def encode_uid(user_pk) -> str:
    return urlsafe_base64_encode(force_bytes(str(user_pk)))


def decode_uid(uidb64: str) -> str:
    return force_str(urlsafe_base64_decode(uidb64))


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """Invalidates itself once the email is verified (state is part of the hash)."""

    def _make_hash_value(self, user, timestamp):
        verified = "1" if user.email_verified_at else "0"
        return f"{user.pk}{user.password}{timestamp}{verified}"


class InvitationTokenGenerator(PasswordResetTokenGenerator):
    """
    Distinct from the password-reset generator (different hash/secret
    context) so an invitation link can never double as a reset link.
    Invalidates itself once the invitee sets their password (`is_active`
    flips and `password` changes together in accept_invitation()).
    """

    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{user.password}{timestamp}{user.is_active}"


password_reset_token = PasswordResetTokenGenerator()
email_verification_token = EmailVerificationTokenGenerator()
invitation_token = InvitationTokenGenerator()
