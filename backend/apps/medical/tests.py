import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    MedicalProfileFactory,
    SchoolFactory,
    StudentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _principal():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    return school, principal


class TestMedicalStricterPermissions:
    def test_principal_can_create_medical_profile(self, api_client):
        school, principal = _principal()
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/medical/profiles/", {"student": str(student.id), "blood_group": "O+"}, format="json"
        )
        assert response.status_code == 201

    def test_teacher_cannot_view_medical_records(self, api_client):
        """Medical is stricter than general student records — teacher has students.view but not medical.view."""
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/medical/profiles/")
        assert response.status_code == 403

    def test_accountant_cannot_view_medical_records(self, api_client):
        school, _ = _principal()
        accountant_user = UserFactory(school=school)
        assign_role(user=accountant_user, role=Role.unscoped_objects.get(school=school, slug="accountant"))
        _login(api_client, accountant_user)

        response = api_client.get("/api/v1/medical/profiles/")
        assert response.status_code == 403

    def test_cannot_create_duplicate_profile_for_same_student(self, api_client):
        school, principal = _principal()
        student = StudentFactory(school=school)
        MedicalProfileFactory(school=school, student=student)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/medical/profiles/", {"student": str(student.id)}, format="json"
        )
        assert response.status_code == 400


class TestMedicalTenantIsolation:
    def test_cannot_retrieve_another_schools_profile(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        profile_b = MedicalProfileFactory(school=school_b)

        _login(api_client, principal_a)
        response = api_client.get(f"/api/v1/medical/profiles/{profile_b.id}/")
        assert response.status_code == 404
