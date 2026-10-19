import secrets

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.services import log_action
from apps.common.views import TenantScopedAPIView

from . import google, lockout, services, two_factor
from .access import student_access_revoked
from .cookies import clear_auth_cookies, issue_tokens_for_user, set_auth_cookies
from .serializers import (
    AcceptInvitationSerializer,
    ChangePasswordSerializer,
    CurrentUserSerializer,
    EmailVerificationConfirmSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    MeUpdateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
)

User = get_user_model()


def _client_ip(request) -> str:
    from apps.common.net import get_client_ip

    return get_client_ip(request)


def _invalid_credentials():
    return Response(
        {
            "success": False,
            "message": "Invalid email or password. After several failed attempts an account is "
            "temporarily locked.",
            "code": "INVALID_CREDENTIALS",
            "errors": [],
        },
        status=status.HTTP_401_UNAUTHORIZED,
    )


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _two_factor_challenge(user, code: str, *, purpose: str):
    """Password was right but no session is issued yet — the client must present a second factor
    (or, for a required-but-not-enrolled account, enrol one) using this short-lived token."""
    return Response(
        {
            "success": True,
            "message": "Second step required.",
            "code": code,
            "errors": [],
            "two_factor_token": two_factor.make_challenge_token(user, purpose),
        }
    )


def _complete_login(request, user):
    """Issue the session cookies and the user payload. The single place a session is ever created."""
    access_token, refresh_token = issue_tokens_for_user(user)
    response = _ok("Logged in.", user=CurrentUserSerializer(user).data)
    set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)
    get_token(request)  # forces Set-Cookie: csrftoken on this response
    log_action(
        action="auth.login_success",
        actor=user,
        school=user.school,
        entity_type="User",
        entity_id=str(user.pk),
        metadata={"ip": _client_ip(request)},
    )
    return response


def _wrong_sign_in_page(candidate, school_slug: str):
    """The error to show when this account is using a sign-in page it doesn't belong to, else None.

    A school's people sign in only through their own school's page; the platform page is for platform
    administrators only. This is checked before the password, so the person is told where to go
    instead of being left to guess credentials against the wrong door."""
    from apps.tenants.models import School

    slug = (school_slug or "").strip().lower()
    if not slug:
        if candidate.is_platform_admin:
            return None
        return (
            "This sign-in page is for platform administrators. Please sign in from your own school's login page.",
            "WRONG_LOGIN_PAGE",
        )
    school = School.objects.filter(slug=slug).first()
    if school is None:
        return ("We couldn't find that school. Check the address, or use “Find your school”.", "SCHOOL_NOT_FOUND")
    if candidate.school_id == school.pk:
        return None
    return (
        f"This account isn't registered with {school.name}. Please sign in from your own school's login page.",
        "WRONG_LOGIN_PAGE",
    )


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        ip = _client_ip(request)
        candidate = User.objects.filter(email__iexact=email).select_related("school").first()

        if candidate is not None and settings.LOGIN_SCOPE_ENFORCEMENT:
            wrong = _wrong_sign_in_page(candidate, serializer.validated_data.get("school_slug", ""))
            if wrong is not None:
                log_action(
                    action="auth.login_wrong_page",
                    actor=candidate,
                    school=candidate.school,
                    entity_type="User",
                    entity_id=str(candidate.pk),
                    severity="warning",
                    metadata={"ip": ip, "school_slug": serializer.validated_data.get("school_slug", "")},
                )
                return Response(
                    {"success": False, "message": wrong[0], "code": wrong[1], "errors": []},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # A locked account is never even checked against the password (that would let an attacker
        # keep guessing during the lock), but still burns a hash's worth of time and returns the
        # exact same generic error as any other failure — see apps.authentication.lockout.
        if candidate is not None and lockout.is_locked(candidate):
            lockout.burn_password_hash_time(password)
            log_action(
                action="auth.login_blocked_locked",
                actor=candidate,
                school=candidate.school,
                entity_type="User",
                entity_id=str(candidate.pk),
                severity="warning",
                metadata={"ip": ip},
            )
            return _invalid_credentials()

        user = authenticate(request, username=email, password=password)
        if user is None or not user.is_active:
            if candidate is not None:
                lockout.register_failure(candidate, ip=ip)
            else:
                lockout.burn_password_hash_time(password)
            log_action(
                action="auth.login_failed",
                entity_type="User",
                entity_id="",
                metadata={"email": email, "ip": ip},
                severity="warning",
            )
            return _invalid_credentials()

        return self._finish_sign_in(request, user)

    def _finish_sign_in(self, request, user):
        """Everything after the account is identified (by password or by Google): suspended student, inactive school, second factor,
        then the session."""
        if student_access_revoked(user):
            log_action(action="auth.login_blocked_access_revoked", actor=user, school=user.school, entity_type="User", entity_id=str(user.pk), severity="warning")
            return Response(
                {"success": False, "message": "Your access has been suspended. Please contact the school office.", "code": "ACCESS_REVOKED", "errors": []},
                status=status.HTTP_403_FORBIDDEN,
            )

        if user.school_id is not None and not user.school.is_active:
            log_action(
                action="auth.login_blocked_school_inactive",
                actor=user,
                school=user.school,
                entity_type="User",
                entity_id=str(user.pk),
                severity="warning",
                metadata={"school_status": user.school.status},
            )
            return Response(
                {
                    "success": False,
                    "message": "Your school's account is not active. Contact your administrator.",
                    "code": "SCHOOL_NOT_ACTIVE",
                    "errors": [],
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Second factor. The password counter is NOT reset here: an attacker who knows the password
        # must not be able to reset the failure count and then get unlimited code guesses.
        if two_factor.is_enabled(user):
            return _two_factor_challenge(user, "TWO_FACTOR_REQUIRED", purpose="verify")
        if two_factor.is_required_for(user):
            return _two_factor_challenge(user, "TWO_FACTOR_SETUP_REQUIRED", purpose="setup")

        lockout.register_success(user)
        return _complete_login(request, user)


class GoogleConfigView(APIView):
    """Tells the sign-in pages whether to show the Google button (and which client to use)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"success": True, "message": "", "code": "OK", "errors": [], "enabled": google.is_enabled(), "client_id": settings.GOOGLE_CLIENT_ID})


class GoogleLoginView(LoginView):
    """Sign in with a Google account. Google only proves who owns an e-mail address, so this never creates an account: the
    address must already belong to a user of the system. Everything after that (wrong school page, suspended student, inactive
    school, two-factor) is exactly the password sign-in."""

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ip = _client_ip(request)
        claims = google.verify_credential(serializer.validated_data["credential"])
        if claims is None:
            log_action(action="auth.google_login_failed", entity_type="User", entity_id="", metadata={"ip": ip}, severity="warning")
            return Response(
                {"success": False, "message": "We couldn't verify your Google sign-in. Please try again.", "code": "GOOGLE_INVALID", "errors": []},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        email = claims["email"].lower()
        user = User.objects.filter(email__iexact=email, is_active=True).select_related("school").first()
        if user is None:
            log_action(action="auth.google_login_no_account", entity_type="User", entity_id="", metadata={"email": email, "ip": ip}, severity="warning")
            return Response(
                {
                    "success": False,
                    "message": f"No account uses {email}. Ask your school to add this email to your account, or sign in with your password.",
                    "code": "GOOGLE_NO_ACCOUNT",
                    "errors": [],
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if lockout.is_locked(user):
            return _invalid_credentials()
        if settings.LOGIN_SCOPE_ENFORCEMENT:
            wrong = _wrong_sign_in_page(user, serializer.validated_data.get("school_slug", ""))
            if wrong is not None:
                return Response({"success": False, "message": wrong[0], "code": wrong[1], "errors": []}, status=status.HTTP_403_FORBIDDEN)
        # Signing in with Google proves the person owns the address, so the shared default password is retired: it could
        # otherwise still be used (by anyone who knows the school's name) to sign in to this account.
        if user.must_change_password:
            user.set_password(secrets.token_urlsafe(32))
            user.must_change_password = False
            user.save(update_fields=["password", "must_change_password"])
        log_action(action="auth.google_login", actor=user, school=user.school, entity_type="User", entity_id=str(user.pk), metadata={"ip": ip})
        return self._finish_sign_in(request, user)


class LogoutView(TenantScopedAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass

        response = _ok("Logged out.")
        clear_auth_cookies(response)
        log_action(
            action="auth.logout",
            actor=request.user,
            school=request.user.school,
            entity_type="User",
            entity_id=str(request.user.pk),
        )
        return response


class TokenRefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_refresh"

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH_NAME)
        if not raw_refresh:
            return Response(
                {"success": False, "message": "No refresh token.", "code": "NO_REFRESH_TOKEN", "errors": []},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            refresh = RefreshToken(raw_refresh)
            user = User.objects.select_related("school").get(pk=refresh["user_id"])
            # A refresh token outlives the account state it was issued under: re-check on every
            # use so a deactivated user, or one whose school has since been suspended, can't keep
            # a session alive indefinitely just by refreshing.
            if not user.is_active or student_access_revoked(user) or (user.school_id is not None and not user.school.is_active):
                refresh.blacklist()
                raise TokenError("Account no longer active.")
            access_token = str(refresh.access_token)
            refresh.blacklist()
            new_refresh = str(RefreshToken.for_user(user))
        except (TokenError, User.DoesNotExist):
            response = Response(
                {"success": False, "message": "Session expired.", "code": "INVALID_REFRESH_TOKEN", "errors": []},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_auth_cookies(response)
            return response

        response = _ok("Token refreshed.")
        set_auth_cookies(response, access_token=access_token, refresh_token=new_refresh)
        return response


class MeView(TenantScopedAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return _ok(user=CurrentUserSerializer(request.user, context={"request": request}).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return _ok(
            "Profile updated.",
            user=CurrentUserSerializer(request.user, context={"request": request}).data,
        )


class HeartbeatView(APIView):
    """Pinged periodically by the frontend while a session is active — the only write this
    endpoint does is bump `last_seen_at`, which `User.is_online` then derives a short rolling
    window from (see `apps.users.models.ONLINE_WINDOW`). Deliberately not tenant-scoped or
    audit-logged — it's not a domain action, just a liveness signal."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        User.objects.filter(pk=request.user.pk).update(last_seen_at=timezone.now())
        from apps.backups.service import trigger_scheduled_backup_from_traffic

        trigger_scheduled_backup_from_traffic()
        from apps.academics.submissions import trigger_reminders_from_traffic

        trigger_reminders_from_traffic()
        return _ok()


class ChangePasswordView(TenantScopedAPIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth_sensitive"

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        services.change_password(user=request.user, new_password=serializer.validated_data["new_password"])
        return _ok("Password changed. Please log in again.")


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.request_password_reset(serializer.validated_data["email"], request=request)
        # Same response whether or not the email exists — avoids user enumeration.
        return _ok("If an account exists with that email, a reset link has been sent.")


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_sensitive"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.confirm_password_reset(
                uidb64=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
                new_password=serializer.validated_data["new_password"],
            )
        except services.InvalidTokenError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "INVALID_TOKEN", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _ok("Password reset. Please log in with your new password.")


class EmailVerificationRequestView(TenantScopedAPIView):
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth_sensitive"

    def post(self, request):
        if request.user.is_email_verified:
            return _ok("Email already verified.")
        services.request_email_verification(request.user, request=request)
        return _ok("Verification email sent.")


class EmailVerificationConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_sensitive"

    def post(self, request):
        serializer = EmailVerificationConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.confirm_email_verification(
                uidb64=serializer.validated_data["uid"], token=serializer.validated_data["token"]
            )
        except services.InvalidTokenError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "INVALID_TOKEN", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _ok("Email verified.")


class AcceptInvitationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "auth_sensitive"

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            services.accept_invitation(
                uidb64=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
                password=serializer.validated_data["password"],
            )
        except services.InvalidTokenError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "INVALID_TOKEN", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _ok("Account activated. You can now log in.")
