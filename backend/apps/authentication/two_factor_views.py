from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import log_action
from apps.common.views import TenantScopedAPIView

from . import lockout, two_factor
from .emails import send_security_notice_email
from .serializers import (
    PasswordAndCodeSerializer,
    PasswordConfirmSerializer,
    TwoFactorAdminResetSerializer,
    TwoFactorChallengeCodeSerializer,
    TwoFactorCodeSerializer,
    TwoFactorTokenSerializer,
)
from .views import _client_ip, _complete_login, _ok


def _error(message, code, http_status=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "code": code, "errors": []}, status=http_status)


def _bad_challenge():
    return _error(
        "This sign-in step has expired. Please sign in again.", "TWO_FACTOR_TOKEN_INVALID", status.HTTP_401_UNAUTHORIZED
    )


def _bad_code():
    # Identical for a wrong code, an expired code and a locked account (no oracle for an attacker).
    return _error(
        "That code isn't valid. Check your authenticator app and try again.",
        "INVALID_TWO_FACTOR_CODE",
        status.HTTP_401_UNAUTHORIZED,
    )


def _fail(user, request):
    lockout.register_failure(user, ip=_client_ip(request))
    log_action(
        action="auth.2fa_failed",
        actor=user,
        school=user.school,
        entity_type="User",
        entity_id=str(user.pk),
        severity="warning",
        metadata={"ip": _client_ip(request)},
    )
    return _bad_code()


# ---- login step 2 (no session yet; authorised by the challenge token) ------------------------


class TwoFactorVerifyView(APIView):
    """Finish a login for an account that already has a second factor."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_two_factor"

    def post(self, request):
        serializer = TwoFactorChallengeCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = two_factor.read_challenge_token(serializer.validated_data["two_factor_token"], "verify")
        if user is None:
            return _bad_challenge()
        if lockout.is_locked(user):
            return _bad_code()
        if not two_factor.verify_code(user, serializer.validated_data["code"]):
            return _fail(user, request)

        lockout.register_success(user)
        return _complete_login(request, user)


class TwoFactorSetupBeginView(APIView):
    """First-time enrolment for an account that MUST have 2FA and doesn't yet: returns the secret."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_two_factor"

    def post(self, request):
        serializer = TwoFactorTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = two_factor.read_challenge_token(serializer.validated_data["two_factor_token"], "setup")
        if user is None or two_factor.is_enabled(user):
            return _bad_challenge()
        return _ok(**two_factor.begin_enrollment(user))


class TwoFactorSetupConfirmView(APIView):
    """Confirms the first code; only now is the session issued, together with the recovery codes."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_two_factor"

    def post(self, request):
        serializer = TwoFactorChallengeCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = two_factor.read_challenge_token(serializer.validated_data["two_factor_token"], "setup")
        if user is None or two_factor.is_enabled(user):
            return _bad_challenge()
        if lockout.is_locked(user):
            return _bad_code()
        codes = two_factor.confirm_enrollment(user, serializer.validated_data["code"])
        if codes is None:
            return _fail(user, request)

        lockout.register_success(user)
        response = _complete_login(request, user)
        response.data["recovery_codes"] = codes
        return response


# ---- managing 2FA while signed in -------------------------------------------------------------


class _AuthenticatedTwoFactorView(TenantScopedAPIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth_two_factor"

    def _password_ok(self, request, password) -> bool:
        """Re-authentication: changing security settings needs the password again, so a hijacked
        session (or an unlocked laptop) can't quietly turn 2FA off."""
        if lockout.is_locked(request.user):
            return False
        if request.user.check_password(password):
            return True
        lockout.register_failure(request.user, ip=_client_ip(request))
        return False


class TwoFactorStatusView(_AuthenticatedTwoFactorView):
    def get(self, request):
        return _ok(
            enabled=two_factor.is_enabled(request.user),
            required=two_factor.is_required_for(request.user),
            recommended=two_factor.policy_requires(request.user),
            recovery_codes_remaining=two_factor.recovery_codes_remaining(request.user),
        )


class TwoFactorEnrollView(_AuthenticatedTwoFactorView):
    def post(self, request):
        serializer = PasswordConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not self._password_ok(request, serializer.validated_data["password"]):
            return _error("Your password is incorrect.", "INVALID_PASSWORD")
        if two_factor.is_enabled(request.user):
            return _error("Two-factor authentication is already enabled.", "ALREADY_ENABLED")
        return _ok(**two_factor.begin_enrollment(request.user))


class TwoFactorEnableView(_AuthenticatedTwoFactorView):
    def post(self, request):
        serializer = TwoFactorCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        codes = two_factor.confirm_enrollment(request.user, serializer.validated_data["code"])
        if codes is None:
            lockout.register_failure(request.user, ip=_client_ip(request))
            return _error("That code isn't valid. Check your authenticator app and try again.", "INVALID_TWO_FACTOR_CODE")
        send_security_notice_email(
            user=request.user,
            subject="Two-factor authentication was turned on",
            message="Two-factor authentication was turned on for your account.",
        )
        return _ok(recovery_codes=codes)


class TwoFactorDisableView(_AuthenticatedTwoFactorView):
    def post(self, request):
        serializer = PasswordAndCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not self._password_ok(request, serializer.validated_data["password"]):
            return _error("Your password is incorrect.", "INVALID_PASSWORD")
        if not two_factor.verify_code(request.user, serializer.validated_data["code"]):
            lockout.register_failure(request.user, ip=_client_ip(request))
            return _error("That code isn't valid.", "INVALID_TWO_FACTOR_CODE")
        two_factor.disable(request.user)
        send_security_notice_email(
            user=request.user,
            subject="Two-factor authentication was turned off",
            message="Two-factor authentication was turned off for your account.",
        )
        return _ok("Two-factor authentication turned off.")


class TwoFactorRecoveryCodesView(_AuthenticatedTwoFactorView):
    def post(self, request):
        serializer = PasswordAndCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not self._password_ok(request, serializer.validated_data["password"]):
            return _error("Your password is incorrect.", "INVALID_PASSWORD")
        if not two_factor.is_enabled(request.user) or not two_factor.verify_code(
            request.user, serializer.validated_data["code"]
        ):
            lockout.register_failure(request.user, ip=_client_ip(request))
            return _error("That code isn't valid.", "INVALID_TWO_FACTOR_CODE")
        return _ok(recovery_codes=two_factor.regenerate_recovery_codes(request.user))


class TwoFactorAdminResetView(TenantScopedAPIView):
    """A platform admin clears someone's second factor (lost phone AND lost recovery codes). The
    person must enrol a new one at their next sign-in if their role requires it. Platform admins
    can't reset their own (that would defeat the point) — use the `reset_two_factor` command."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "auth_sensitive"

    def post(self, request):
        from django.contrib.auth import get_user_model

        if not request.user.is_platform_admin:
            return _error("Only platform administrators can do this.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        serializer = TwoFactorAdminResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = (
            get_user_model().objects.filter(pk=serializer.validated_data["user_id"]).select_related("school").first()
        )
        if target is None:
            return _error("User not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        if target.pk == request.user.pk:
            return _error(
                "You can't reset your own two-factor authentication.", "FORBIDDEN", status.HTTP_403_FORBIDDEN
            )
        two_factor.disable(target, by=request.user)
        send_security_notice_email(
            user=target,
            subject="Two-factor authentication was reset",
            message="An administrator reset two-factor authentication on your account. "
            "You will be asked to set it up again the next time you sign in.",
        )
        return _ok("Two-factor authentication reset.", reset_at=timezone.now().isoformat())
