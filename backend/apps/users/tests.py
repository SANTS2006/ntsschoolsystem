import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

from .models import User

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": DEFAULT_TEST_PASSWORD},
        format="json",
    )


def _setup_school_with_principal():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    return school, principal


class TestUserInvite:
    def test_principal_can_invite_user_into_own_school(self, api_client):
        school, principal = _setup_school_with_principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/users/invite/",
            {"email": "newteacher@school.test", "first_name": "New", "last_name": "Teacher"},
            format="json",
        )
        assert response.status_code == 200
        invited = User.objects.get(email="newteacher@school.test")
        assert invited.school_id == school.id
        # School users are active immediately with the school's default password (initials +
        # creation year) — there's no unusable-password/email-invite step for these accounts,
        # unlike platform admins (see apps.users.services.invite_user).
        assert invited.is_active is True
        from apps.tenants.services import generate_default_password

        assert invited.check_password(generate_default_password(school))

    def test_invite_with_role_assigns_it(self, api_client):
        school, principal = _setup_school_with_principal()
        _login(api_client, principal)
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")

        response = api_client.post(
            "/api/v1/users/invite/",
            {
                "email": "assigned@school.test",
                "first_name": "A",
                "last_name": "B",
                "role_id": str(teacher_role.id),
            },
            format="json",
        )
        assert response.status_code == 200
        assert any(r["slug"] == "teacher" for r in response.data["user"]["roles"])

    def test_teacher_without_users_create_permission_is_rejected(self, api_client):
        school, _ = _setup_school_with_principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/users/invite/",
            {"email": "x@school.test", "first_name": "X", "last_name": "Y"},
            format="json",
        )
        assert response.status_code == 403


class TestUserTenantIsolation:
    def test_cannot_list_another_schools_users(self, api_client):
        school_a, principal_a = _setup_school_with_principal()
        school_b, principal_b = _setup_school_with_principal()
        UserFactory(school=school_b, email="other-school-user@example.test")

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/users/")

        assert response.status_code == 200
        emails = {u["email"] for u in response.data["results"]}
        assert "other-school-user@example.test" not in emails
        assert principal_a.email in emails

    def test_cannot_retrieve_another_schools_user_by_id(self, api_client):
        school_a, principal_a = _setup_school_with_principal()
        school_b, principal_b = _setup_school_with_principal()

        _login(api_client, principal_a)
        response = api_client.get(f"/api/v1/users/{principal_b.id}/")

        assert response.status_code == 404  # not 403 — avoids confirming the id exists

    def test_cannot_disable_another_schools_user(self, api_client):
        school_a, principal_a = _setup_school_with_principal()
        school_b, principal_b = _setup_school_with_principal()

        _login(api_client, principal_a)
        response = api_client.post(f"/api/v1/users/{principal_b.id}/disable/")

        assert response.status_code == 404
        principal_b.refresh_from_db()
        assert principal_b.is_active is True


class TestUserDisable:
    def test_cannot_disable_self(self, api_client):
        school, principal = _setup_school_with_principal()
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/users/{principal.id}/disable/")
        assert response.status_code == 400
        principal.refresh_from_db()
        assert principal.is_active is True

    def test_disable_and_enable_another_user(self, api_client):
        school, principal = _setup_school_with_principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, principal)

        disable = api_client.post(f"/api/v1/users/{teacher.id}/disable/")
        assert disable.status_code == 200
        teacher.refresh_from_db()
        assert teacher.is_active is False

        enable = api_client.post(f"/api/v1/users/{teacher.id}/enable/")
        assert enable.status_code == 200
        teacher.refresh_from_db()
        assert teacher.is_active is True


class TestDirectUserCreationDisabled:
    def test_post_to_list_endpoint_is_rejected(self, api_client):
        school, principal = _setup_school_with_principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/users/",
            {"email": "direct@school.test", "first_name": "D", "last_name": "C"},
            format="json",
        )
        assert response.status_code == 405
