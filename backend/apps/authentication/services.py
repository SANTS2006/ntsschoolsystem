from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.audit.services import log_action

from .emails import send_password_changed_email, send_password_reset_email, send_verification_email
from .tokens import decode_uid, email_verification_token, encode_uid, invitation_token, password_reset_token

User = get_user_model()


class InvalidTokenError(Exception):
    pass


def _get_user_from_uid(uidb64: str) -> User:
    """`ValidationError` covers a malformed UUID string reaching User.objects.get(pk=...)."""
    try:
        pk = decode_uid(uidb64)
        return User.objects.get(pk=pk)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError, ValidationError):
        raise InvalidTokenError("This link is invalid.")


def blacklist_all_outstanding_tokens(user) -> None:
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


def _refuse_default_password(user, new_password: str) -> None:
    from apps.tenants.services import is_default_password

    if is_default_password(user, new_password):
        raise DRFValidationError("Choose a password of your own - the school's default password isn't allowed.")


def request_password_reset(email: str, request=None) -> None:
    """
    Always returns normally regardless of whether the email matches an
    account, to avoid leaking which emails are registered (user
    enumeration). Callers must return the same generic response either way.
    """
    try:
        user = User.objects.get(email__iexact=email, is_active=True)
    except User.DoesNotExist:
        return

    uidb64 = encode_uid(user.pk)
    token = password_reset_token.make_token(user)
    send_password_reset_email(user=user, uidb64=uidb64, token=token, request=request)
    log_action(
        action="auth.password_reset_requested",
        actor=user,
        school=user.school,
        entity_type="User",
        entity_id=str(user.pk),
    )


def confirm_password_reset(*, uidb64: str, token: str, new_password: str) -> User:
    user = _get_user_from_uid(uidb64)
    if not password_reset_token.check_token(user, token):
        raise InvalidTokenError("This link is invalid or has expired.")

    _refuse_default_password(user, new_password)
    user.set_password(new_password)
    user.password_changed_at = timezone.now()
    user.must_change_password = False
    user.save(update_fields=["password", "password_changed_at", "must_change_password"])
    blacklist_all_outstanding_tokens(user)
    send_password_changed_email(user=user)
    log_action(
        action="auth.password_reset_completed",
        actor=user,
        school=user.school,
        entity_type="User",
        entity_id=str(user.pk),
        severity="warning",
    )
    return user


def change_password(*, user, new_password: str) -> None:
    _refuse_default_password(user, new_password)
    user.set_password(new_password)
    user.password_changed_at = timezone.now()
    user.must_change_password = False
    user.save(update_fields=["password", "password_changed_at", "must_change_password"])
    blacklist_all_outstanding_tokens(user)
    send_password_changed_email(user=user)
    log_action(
        action="auth.password_changed",
        actor=user,
        school=user.school,
        entity_type="User",
        entity_id=str(user.pk),
    )


def request_email_verification(user, request=None) -> None:
    uidb64 = encode_uid(user.pk)
    token = email_verification_token.make_token(user)
    send_verification_email(user=user, uidb64=uidb64, token=token, request=request)


def confirm_email_verification(*, uidb64: str, token: str) -> User:
    user = _get_user_from_uid(uidb64)
    if not email_verification_token.check_token(user, token):
        raise InvalidTokenError("This link is invalid or has expired.")

    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified_at"])
    log_action(
        action="auth.email_verified",
        actor=user,
        school=user.school,
        entity_type="User",
        entity_id=str(user.pk),
    )
    return user


def accept_invitation(*, uidb64: str, token: str, password: str) -> User:
    user = _get_user_from_uid(uidb64)
    if not invitation_token.check_token(user, token):
        raise InvalidTokenError("This invitation link is invalid or has expired.")

    user.set_password(password)
    user.is_active = True
    user.email_verified_at = timezone.now()
    user.password_changed_at = timezone.now()
    user.must_change_password = False
    user.save(
        update_fields=["password", "is_active", "email_verified_at", "password_changed_at", "must_change_password"]
    )
    log_action(
        action="auth.invitation_accepted",
        actor=user,
        school=user.school,
        entity_type="User",
        entity_id=str(user.pk),
    )
    return user
