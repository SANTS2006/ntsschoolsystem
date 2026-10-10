import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.tenants.services import generate_default_password
from apps.users.services import invite_user
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, StaffFactory, UserFactory

pytestmark = pytest.mark.django_db


def _login(client, email, password):
    return client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")


def _provisioned_user():
    """A school user created the way the app creates them: with the guessable school default."""
    seed_permission_catalog()
    school = SchoolFactory(name="Riverside Academy")
    seed_default_roles_for_school(school)
    user = invite_user(email="new.teacher@example.test", first_name="New", last_name="Teacher", school=school)
    assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return school, user, generate_default_password(school)


class TestForcedPasswordChange:
    def test_provisioned_accounts_are_flagged(self):
        _school, user, _default = _provisioned_user()
        assert user.must_change_password is True

    def test_flagged_account_can_sign_in_but_reach_nothing_except_changing_its_password(self, api_client):
        _school, user, default = _provisioned_user()
        assert _login(api_client, user.email, default).status_code == 200

        me = api_client.get("/api/v1/auth/me/")
        assert me.status_code == 200 and me.data["user"]["must_change_password"] is True

        for path in ("/api/v1/records/", "/api/v1/students/", "/api/v1/notifications/"):
            blocked = api_client.get(path)
            assert blocked.status_code == 403, path
            assert blocked.data["code"] == "PASSWORD_CHANGE_REQUIRED", path

    def test_choosing_a_new_password_lifts_the_restriction(self, api_client):
        _school, user, default = _provisioned_user()
        _login(api_client, user.email, default)

        response = api_client.post(
            "/api/v1/auth/change-password/",
            {"current_password": default, "new_password": "A-long-passphrase-of-my-own-42"},
            format="json",
        )
        assert response.status_code == 200
        user.refresh_from_db()
        assert user.must_change_password is False
        assert api_client.get("/api/v1/records/").status_code == 200

    def test_the_school_default_cannot_be_chosen_as_the_new_password(self, api_client):
        _school, user, default = _provisioned_user()
        _login(api_client, user.email, default)

        response = api_client.post(
            "/api/v1/auth/change-password/", {"current_password": default, "new_password": default}, format="json"
        )
        assert response.status_code == 400
        user.refresh_from_db()
        assert user.must_change_password is True

    def test_default_password_is_refused_case_insensitively(self, api_client):
        _school, user, default = _provisioned_user()
        _login(api_client, user.email, default)

        response = api_client.post(
            "/api/v1/auth/change-password/",
            {"current_password": default, "new_password": default.lower() + "  "},
            format="json",
        )
        assert response.status_code == 400

    def test_admin_reset_to_default_flags_the_account_again(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory(name="Riverside Academy")
        seed_default_roles_for_school(school)
        principal = UserFactory(school=school)
        assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
        staff = StaffFactory(school=school)
        assert staff.user.must_change_password is False

        _login(api_client, principal.email, DEFAULT_TEST_PASSWORD)
        response = api_client.post(f"/api/v1/staff/{staff.pk}/reset-password/")
        assert response.status_code == 200, response.data

        staff.user.refresh_from_db()
        assert staff.user.must_change_password is True

    def test_accounts_with_their_own_password_are_unaffected(self, api_client):
        user = UserFactory()
        _login(api_client, user.email, DEFAULT_TEST_PASSWORD)
        assert api_client.get("/api/v1/auth/me/").data["user"]["must_change_password"] is False
        assert api_client.get("/api/v1/notifications/").status_code == 200
