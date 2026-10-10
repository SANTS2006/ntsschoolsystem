import pytest

from apps.authorization.services import seed_default_roles_for_school, seed_permission_catalog
from apps.tenants.models import School
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

pytestmark = pytest.mark.django_db


def _login(api_client, email, password=DEFAULT_TEST_PASSWORD):
    return api_client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")


class TestLogin:
    def test_valid_credentials_returns_cookies_and_user(self, api_client):
        user = UserFactory()
        response = _login(api_client, user.email)

        assert response.status_code == 200
        assert response.data["success"] is True
        assert response.data["user"]["email"] == user.email
        assert "access_token" in response.cookies
        assert "refresh_token" in response.cookies
        assert response.cookies["access_token"]["httponly"]
        assert response.cookies["refresh_token"]["httponly"]

    def test_wrong_password_rejected(self, api_client):
        user = UserFactory()
        response = _login(api_client, user.email, password="wrong-password")

        assert response.status_code == 401
        assert response.data["success"] is False
        assert response.data["code"] == "INVALID_CREDENTIALS"

    def test_inactive_user_rejected(self, api_client):
        user = UserFactory(is_active=False)
        response = _login(api_client, user.email)

        assert response.status_code == 401

    def test_pending_school_blocks_login(self, api_client):
        school = SchoolFactory(status=School.Status.PENDING)
        user = UserFactory(school=school)

        response = _login(api_client, user.email)
        assert response.status_code == 403
        assert response.data["code"] == "SCHOOL_NOT_ACTIVE"

    def test_suspended_school_blocks_login(self, api_client):
        school = SchoolFactory(status=School.Status.SUSPENDED)
        user = UserFactory(school=school)

        response = _login(api_client, user.email)
        assert response.status_code == 403
        assert response.data["code"] == "SCHOOL_NOT_ACTIVE"


class TestMe:
    def test_requires_authentication(self, api_client):
        response = api_client.get("/api/v1/auth/me/")
        assert response.status_code == 401

    def test_returns_current_user_and_permissions(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        user = UserFactory(school=school)

        from apps.authorization.models import Role
        from apps.authorization.services import assign_role

        role = Role.unscoped_objects.get(school=school, slug="teacher")
        assign_role(user=user, role=role)

        _login(api_client, user.email)
        response = api_client.get("/api/v1/auth/me/")

        assert response.status_code == 200
        assert response.data["user"]["email"] == user.email
        assert "education.create" in response.data["user"]["permissions"]  # Teacher's own module
        assert "fees.view" not in response.data["user"]["permissions"]  # accountant-only

    def test_multi_role_user_lists_every_role_with_its_own_permissions(self, api_client):
        """A role's own `permissions` (per role, in the `roles` list) is what the frontend's
        role switcher uses to filter the sidebar down to one role's view — distinct from the
        flat cross-role union at `user.permissions`, which stays the same regardless of which
        role is "active" (switching is purely cosmetic; see CurrentUserSerializer.get_roles)."""
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        user = UserFactory(school=school)

        from apps.authorization.models import Role
        from apps.authorization.services import assign_role

        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")
        accountant_role = Role.unscoped_objects.get(school=school, slug="accountant")
        assign_role(user=user, role=teacher_role)
        assign_role(user=user, role=accountant_role)

        _login(api_client, user.email)
        response = api_client.get("/api/v1/auth/me/")

        assert response.status_code == 200
        roles_by_slug = {r["slug"]: r for r in response.data["user"]["roles"]}
        assert set(roles_by_slug) == {"teacher", "accountant"}
        assert "education.create" in roles_by_slug["teacher"]["permissions"]
        assert "fees.view" not in roles_by_slug["teacher"]["permissions"]
        assert "fees.view" in roles_by_slug["accountant"]["permissions"]
        assert "education.create" not in roles_by_slug["accountant"]["permissions"]
        # The flat union at user-level still has both, unaffected by any "active" role.
        assert "education.create" in response.data["user"]["permissions"]
        assert "fees.view" in response.data["user"]["permissions"]


class TestCsrf:
    def test_unsafe_request_without_csrf_header_is_rejected(self, csrf_api_client):
        user = UserFactory()
        _login(csrf_api_client, user.email)

        response = csrf_api_client.post("/api/v1/auth/logout/")
        assert response.status_code == 403

    def test_unsafe_request_with_csrf_header_succeeds(self, csrf_api_client):
        user = UserFactory()
        _login(csrf_api_client, user.email)
        csrf_token = csrf_api_client.cookies["csrftoken"].value

        response = csrf_api_client.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=csrf_token)
        assert response.status_code == 200


class TestPasswordReset:
    def test_response_identical_whether_or_not_account_exists(self, api_client):
        user = UserFactory()
        real = api_client.post("/api/v1/auth/password-reset/", {"email": user.email}, format="json")
        fake = api_client.post(
            "/api/v1/auth/password-reset/", {"email": "nobody@nowhere.test"}, format="json"
        )

        assert real.status_code == fake.status_code == 200
        assert real.data["message"] == fake.data["message"]


class TestLogout:
    def test_blacklists_refresh_token(self, csrf_api_client):
        user = UserFactory()
        _login(csrf_api_client, user.email)
        csrf_token = csrf_api_client.cookies["csrftoken"].value

        logout_response = csrf_api_client.post("/api/v1/auth/logout/", HTTP_X_CSRFTOKEN=csrf_token)
        assert logout_response.status_code == 200

        me_response = csrf_api_client.get("/api/v1/auth/me/")
        assert me_response.status_code == 401


class TestAccountLockout:
    def _fail(self, api_client, email, times):
        for _ in range(times):
            _login(api_client, email, password="wrong-password-123")

    def test_account_locks_after_repeated_failures_even_with_correct_password(self, api_client):
        user = UserFactory()
        self._fail(api_client, user.email, 5)

        user.refresh_from_db()
        assert user.locked_until is not None
        assert user.failed_login_count >= 5

        # The right password no longer works while locked — otherwise the lock would be pointless.
        response = _login(api_client, user.email)
        assert response.status_code == 401
        assert "access_token" not in response.cookies

    def test_locked_response_is_indistinguishable_from_a_normal_failure(self, api_client):
        user = UserFactory()
        normal = _login(api_client, user.email, password="wrong-password-123")
        self._fail(api_client, user.email, 5)
        locked = _login(api_client, user.email)
        unknown = _login(api_client, "nobody@example.test", password="wrong-password-123")

        for response in (locked, unknown):
            assert response.status_code == normal.status_code == 401
            assert response.data["code"] == normal.data["code"]
            assert response.data["message"] == normal.data["message"]

    def test_lock_expires(self, api_client):
        from datetime import timedelta

        from django.utils import timezone

        user = UserFactory()
        self._fail(api_client, user.email, 5)
        type(user).objects.filter(pk=user.pk).update(locked_until=timezone.now() - timedelta(minutes=1))

        assert _login(api_client, user.email).status_code == 200

    def test_successful_login_resets_the_counter(self, api_client):
        user = UserFactory()
        self._fail(api_client, user.email, 3)
        assert _login(api_client, user.email).status_code == 200

        user.refresh_from_db()
        assert user.failed_login_count == 0
        assert user.locked_until is None

    def test_lock_duration_doubles_with_repeated_failures(self):
        from datetime import timedelta

        from apps.authentication.lockout import lock_duration

        assert lock_duration(5) == timedelta(minutes=15)
        assert lock_duration(6) == timedelta(minutes=30)
        assert lock_duration(7) == timedelta(minutes=60)
        assert lock_duration(40) == timedelta(hours=24)


class TestRefreshHardening:
    def test_deactivated_user_cannot_refresh(self, api_client):
        user = UserFactory()
        _login(api_client, user.email)
        type(user).objects.filter(pk=user.pk).update(is_active=False)

        response = api_client.post("/api/v1/auth/refresh/")
        assert response.status_code == 401

    def test_user_of_suspended_school_cannot_refresh(self, api_client):
        school = SchoolFactory()
        user = UserFactory(school=school)
        _login(api_client, user.email)
        School.objects.filter(pk=school.pk).update(status=School.Status.SUSPENDED)

        response = api_client.post("/api/v1/auth/refresh/")
        assert response.status_code == 401
