import time

import pyotp
import pytest

from apps.authentication.models import TwoFactorDevice
from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, PlatformAdminFactory, SchoolFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _enforce(settings):
    settings.TWO_FACTOR_ENFORCEMENT = True
    settings.TWO_FACTOR_REQUIRED_ROLES = ["principal"]


def _school_user(slug):
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    user = UserFactory(school=school)
    assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug=slug))
    return user


def _login(client, email, password=DEFAULT_TEST_PASSWORD):
    return client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")


def _code(secret, *, step_offset=0):
    """A valid code for the current 30s step (or a neighbouring one, to get a *fresh* step)."""
    return pyotp.TOTP(secret).at(int(time.time()) + 30 * step_offset)


def _enrol_principal(client):
    """Drive the full first-login enrolment. Returns (user, secret, recovery_codes)."""
    user = _school_user("principal")
    challenge = _login(client, user.email).data
    begin = client.post("/api/v1/auth/2fa/setup/begin/", {"two_factor_token": challenge["two_factor_token"]}, format="json")
    secret = begin.data["secret"]
    confirm = client.post(
        "/api/v1/auth/2fa/setup/confirm/",
        {"two_factor_token": challenge["two_factor_token"], "code": _code(secret)},
        format="json",
    )
    assert confirm.status_code == 200, confirm.data
    client.cookies.clear()
    return user, secret, confirm.data["recovery_codes"]


class TestRequiredEnrolment:
    def test_required_account_gets_no_session_until_it_enrols(self, api_client):
        user = _school_user("principal")
        response = _login(api_client, user.email)

        assert response.status_code == 200
        assert response.data["code"] == "TWO_FACTOR_SETUP_REQUIRED"
        assert response.data["two_factor_token"]
        assert "access_token" not in response.cookies and "refresh_token" not in response.cookies
        assert api_client.get("/api/v1/auth/me/").status_code == 401

    def test_platform_admin_is_always_required(self, api_client):
        admin = PlatformAdminFactory()
        response = _login(api_client, admin.email)

        assert response.data["code"] == "TWO_FACTOR_SETUP_REQUIRED"
        assert "access_token" not in response.cookies

    def test_wrong_first_code_does_not_enrol_or_sign_in(self, api_client):
        user = _school_user("principal")
        token = _login(api_client, user.email).data["two_factor_token"]
        api_client.post("/api/v1/auth/2fa/setup/begin/", {"two_factor_token": token}, format="json")

        response = api_client.post(
            "/api/v1/auth/2fa/setup/confirm/", {"two_factor_token": token, "code": "000000"}, format="json"
        )
        assert response.status_code == 401
        assert "access_token" not in response.cookies
        assert not TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=False).exists()

    def test_enrolment_signs_in_and_returns_ten_recovery_codes(self, api_client):
        user = _school_user("principal")
        token = _login(api_client, user.email).data["two_factor_token"]
        secret = api_client.post(
            "/api/v1/auth/2fa/setup/begin/", {"two_factor_token": token}, format="json"
        ).data["secret"]

        response = api_client.post(
            "/api/v1/auth/2fa/setup/confirm/", {"two_factor_token": token, "code": _code(secret)}, format="json"
        )
        assert response.status_code == 200
        assert "access_token" in response.cookies
        assert len(response.data["recovery_codes"]) == 10
        assert response.data["user"]["two_factor_enabled"] is True
        assert api_client.get("/api/v1/auth/me/").status_code == 200

    def test_secret_is_encrypted_at_rest(self, api_client):
        user, secret, _ = _enrol_principal(api_client)
        stored = TwoFactorDevice.objects.get(user=user).secret_encrypted

        assert secret not in stored


class TestSecondFactorLogin:
    def test_enrolled_account_needs_a_code_and_gets_no_session_from_the_password_alone(self, api_client):
        user, _secret, _ = _enrol_principal(api_client)
        response = _login(api_client, user.email)

        assert response.data["code"] == "TWO_FACTOR_REQUIRED"
        assert "access_token" not in response.cookies
        assert api_client.get("/api/v1/auth/me/").status_code == 401

    def test_valid_code_completes_login(self, api_client):
        user, secret, _ = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]

        # The enrolment already consumed the current time-step, so use the next one.
        response = api_client.post(
            "/api/v1/auth/2fa/verify/",
            {"two_factor_token": token, "code": _code(secret, step_offset=1)},
            format="json",
        )
        assert response.status_code == 200, response.data
        assert "access_token" in response.cookies

    def test_a_code_cannot_be_replayed(self, api_client):
        user, secret, _ = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        code = _code(secret, step_offset=1)
        first = api_client.post("/api/v1/auth/2fa/verify/", {"two_factor_token": token, "code": code}, format="json")
        assert first.status_code == 200
        api_client.cookies.clear()

        token2 = _login(api_client, user.email).data["two_factor_token"]
        replay = api_client.post("/api/v1/auth/2fa/verify/", {"two_factor_token": token2, "code": code}, format="json")
        assert replay.status_code == 401
        assert "access_token" not in replay.cookies

    def test_wrong_code_is_rejected(self, api_client):
        user, _secret, _ = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        response = api_client.post(
            "/api/v1/auth/2fa/verify/", {"two_factor_token": token, "code": "123456"}, format="json"
        )

        assert response.status_code == 401
        assert response.data["code"] == "INVALID_TWO_FACTOR_CODE"

    def test_repeated_wrong_codes_lock_the_account_even_for_the_right_code(self, api_client):
        user, secret, _ = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        for _ in range(5):
            api_client.post("/api/v1/auth/2fa/verify/", {"two_factor_token": token, "code": "000000"}, format="json")

        good = api_client.post(
            "/api/v1/auth/2fa/verify/",
            {"two_factor_token": token, "code": _code(secret, step_offset=1)},
            format="json",
        )
        assert good.status_code == 401
        assert "access_token" not in good.cookies

    def test_recovery_code_works_exactly_once(self, api_client):
        user, _secret, recovery = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        first = api_client.post(
            "/api/v1/auth/2fa/verify/", {"two_factor_token": token, "code": recovery[0]}, format="json"
        )
        assert first.status_code == 200
        api_client.cookies.clear()

        token2 = _login(api_client, user.email).data["two_factor_token"]
        second = api_client.post(
            "/api/v1/auth/2fa/verify/", {"two_factor_token": token2, "code": recovery[0]}, format="json"
        )
        assert second.status_code == 401


class TestChallengeToken:
    def test_tampered_token_is_rejected(self, api_client):
        user, _secret, _ = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        response = api_client.post(
            "/api/v1/auth/2fa/verify/", {"two_factor_token": token[:-4] + "AAAA", "code": "123456"}, format="json"
        )
        assert response.status_code == 401
        assert response.data["code"] == "TWO_FACTOR_TOKEN_INVALID"

    def test_a_verify_token_cannot_be_used_on_the_setup_endpoints(self, api_client):
        user, _secret, _ = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        response = api_client.post("/api/v1/auth/2fa/setup/begin/", {"two_factor_token": token}, format="json")

        assert response.status_code == 401

    def test_changing_the_password_invalidates_outstanding_tokens(self, api_client):
        user, secret, _ = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        user.set_password("A-brand-new-password-987")
        user.save(update_fields=["password"])

        response = api_client.post(
            "/api/v1/auth/2fa/verify/",
            {"two_factor_token": token, "code": _code(secret, step_offset=1)},
            format="json",
        )
        assert response.status_code == 401


class TestOptionalEnrolment:
    def _teacher_session(self, api_client):
        user = _school_user("teacher")
        assert _login(api_client, user.email).status_code == 200
        return user

    def test_teacher_signs_in_normally_and_can_opt_in(self, api_client):
        user = self._teacher_session(api_client)
        status = api_client.get("/api/v1/auth/2fa/status/")
        assert status.data["enabled"] is False and status.data["required"] is False

        begin = api_client.post("/api/v1/auth/2fa/enroll/", {"password": DEFAULT_TEST_PASSWORD}, format="json")
        assert begin.status_code == 200
        enable = api_client.post("/api/v1/auth/2fa/enable/", {"code": _code(begin.data["secret"])}, format="json")
        assert enable.status_code == 200 and len(enable.data["recovery_codes"]) == 10

        api_client.cookies.clear()
        assert _login(api_client, user.email).data["code"] == "TWO_FACTOR_REQUIRED"

    def test_enrolling_needs_the_password_again(self, api_client):
        self._teacher_session(api_client)
        response = api_client.post("/api/v1/auth/2fa/enroll/", {"password": "not-my-password-123"}, format="json")

        assert response.status_code == 400
        assert response.data["code"] == "INVALID_PASSWORD"

    def test_optional_user_can_turn_it_off_with_password_and_code(self, api_client):
        user = self._teacher_session(api_client)
        secret = api_client.post(
            "/api/v1/auth/2fa/enroll/", {"password": DEFAULT_TEST_PASSWORD}, format="json"
        ).data["secret"]
        api_client.post("/api/v1/auth/2fa/enable/", {"code": _code(secret)}, format="json")

        response = api_client.post(
            "/api/v1/auth/2fa/disable/",
            {"password": DEFAULT_TEST_PASSWORD, "code": _code(secret, step_offset=1)},
            format="json",
        )
        assert response.status_code == 200
        assert not TwoFactorDevice.objects.filter(user=user).exists()

    def test_required_account_can_turn_it_off_and_back_on(self, api_client):
        user, secret, recovery = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        api_client.post(
            "/api/v1/auth/2fa/verify/",
            {"two_factor_token": token, "code": _code(secret, step_offset=1)},
            format="json",
        )
        response = api_client.post(
            "/api/v1/auth/2fa/disable/",
            {"password": DEFAULT_TEST_PASSWORD, "code": recovery[0]},
            format="json",
        )
        assert response.status_code == 200
        assert not TwoFactorDevice.objects.filter(user=user).exists()
        user.refresh_from_db()
        assert user.two_factor_opt_out is True

        # Signing in no longer insists on a second factor...
        api_client.cookies.clear()
        assert _login(api_client, user.email).data.get("code") not in ("TWO_FACTOR_SETUP_REQUIRED", "TWO_FACTOR_REQUIRED")
        status_now = api_client.get("/api/v1/auth/2fa/status/").data
        assert status_now["enabled"] is False and status_now["required"] is False and status_now["recommended"] is True

        # ...and turning it back on clears the opt-out, so the account is protected again.
        new_secret = api_client.post(
            "/api/v1/auth/2fa/enroll/", {"password": DEFAULT_TEST_PASSWORD}, format="json"
        ).data["secret"]
        assert api_client.post("/api/v1/auth/2fa/enable/", {"code": _code(new_secret)}, format="json").status_code == 200
        user.refresh_from_db()
        assert user.two_factor_opt_out is False
        assert TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=False).exists()

    def test_turning_it_off_still_needs_the_password_and_a_current_code(self, api_client):
        user, secret, recovery = _enrol_principal(api_client)
        token = _login(api_client, user.email).data["two_factor_token"]
        api_client.post(
            "/api/v1/auth/2fa/verify/",
            {"two_factor_token": token, "code": _code(secret, step_offset=1)},
            format="json",
        )
        wrong_code = api_client.post(
            "/api/v1/auth/2fa/disable/", {"password": DEFAULT_TEST_PASSWORD, "code": "000000"}, format="json"
        )
        wrong_password = api_client.post(
            "/api/v1/auth/2fa/disable/", {"password": "nope-nope", "code": recovery[0]}, format="json"
        )
        assert wrong_code.status_code == 400 and wrong_password.status_code == 400
        assert TwoFactorDevice.objects.filter(user=user, confirmed_at__isnull=False).exists()


class TestAdminReset:
    def test_platform_admin_can_reset_a_principals_second_factor(self, api_client):
        principal, _secret, _ = _enrol_principal(api_client)
        admin = PlatformAdminFactory()
        admin_token = _login(api_client, admin.email).data["two_factor_token"]
        admin_secret = api_client.post(
            "/api/v1/auth/2fa/setup/begin/", {"two_factor_token": admin_token}, format="json"
        ).data["secret"]
        api_client.post(
            "/api/v1/auth/2fa/setup/confirm/",
            {"two_factor_token": admin_token, "code": _code(admin_secret)},
            format="json",
        )

        response = api_client.post("/api/v1/auth/2fa/admin-reset/", {"user_id": str(principal.pk)}, format="json")
        assert response.status_code == 200
        assert not TwoFactorDevice.objects.filter(user=principal).exists()

        # ...and the principal is back to having to enrol at next sign-in.
        api_client.cookies.clear()
        assert _login(api_client, principal.email).data["code"] == "TWO_FACTOR_SETUP_REQUIRED"

    def test_non_platform_admins_cannot_reset_anyone(self, api_client):
        principal, secret, _ = _enrol_principal(api_client)
        other = _school_user("principal")
        other_token = _login(api_client, other.email).data["two_factor_token"]
        other_secret = api_client.post(
            "/api/v1/auth/2fa/setup/begin/", {"two_factor_token": other_token}, format="json"
        ).data["secret"]
        api_client.post(
            "/api/v1/auth/2fa/setup/confirm/",
            {"two_factor_token": other_token, "code": _code(other_secret)},
            format="json",
        )

        response = api_client.post("/api/v1/auth/2fa/admin-reset/", {"user_id": str(principal.pk)}, format="json")
        assert response.status_code == 403
        assert TwoFactorDevice.objects.filter(user=principal, confirmed_at__isnull=False).exists()
