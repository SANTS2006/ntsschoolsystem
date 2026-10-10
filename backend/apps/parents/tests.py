import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, GuardianFactory, SchoolFactory, UserFactory

from .models import Guardian

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _school_admin():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    school_admin = UserFactory(school=school)
    assign_role(user=school_admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    return school, school_admin


class TestGuardianCreate:
    def test_school_admin_can_create_guardian(self, api_client):
        school, school_admin = _school_admin()
        _login(api_client, school_admin)

        response = api_client.post(
            "/api/v1/parents/",
            {"first_name": "Grace", "last_name": "Guardian", "phone_number": "+15550000"},
            format="json",
        )
        assert response.status_code == 201
        assert Guardian.unscoped_objects.filter(school=school, first_name="Grace").exists()

    def test_teacher_cannot_create_guardian(self, api_client):
        school, _ = _school_admin()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/parents/", {"first_name": "X", "last_name": "Y"}, format="json"
        )
        assert response.status_code == 403


class TestGuardianTenantIsolation:
    def test_cannot_list_another_schools_guardians(self, api_client):
        school_a, school_admin_a = _school_admin()
        school_b, _ = _school_admin()
        GuardianFactory(school=school_b)
        guardian_a = GuardianFactory(school=school_a)

        _login(api_client, school_admin_a)
        response = api_client.get("/api/v1/parents/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(guardian_a.id) in ids_seen
        assert len(ids_seen) == 1

    def test_cannot_retrieve_another_schools_guardian_by_id(self, api_client):
        school_a, school_admin_a = _school_admin()
        school_b, _ = _school_admin()
        guardian_b = GuardianFactory(school=school_b)

        _login(api_client, school_admin_a)
        response = api_client.get(f"/api/v1/parents/{guardian_b.id}/")
        assert response.status_code == 404
