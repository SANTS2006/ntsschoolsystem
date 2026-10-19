import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, StudentFactory, UserFactory

from .services import provision_student_account

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


def _world():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    admin = UserFactory(school=school)
    assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    teacher = UserFactory(school=school)
    assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    student = StudentFactory(school=school, email="stu.dent@example.com")
    account = provision_student_account(student)
    account.set_password(DEFAULT_TEST_PASSWORD)
    account.must_change_password = False
    account.save(update_fields=["password", "must_change_password"])
    return school, admin, teacher, student, account


class TestStudentAccessRevocation:
    def test_revoked_student_cannot_sign_in_and_restoring_lets_them_back(self, api_client):
        _, admin, _, student, account = _world()
        assert _login(api_client, account).status_code == 200
        api_client.post("/api/v1/auth/logout/")

        _login(api_client, admin)
        response = api_client.post(f"/api/v1/students/{student.id}/revoke-access/", {"reason": "Unpaid fees for two terms"}, format="json")
        assert response.status_code == 200, response.data
        api_client.post("/api/v1/auth/logout/")

        blocked = _login(api_client, account)
        assert blocked.status_code == 403 and blocked.data["code"] == "ACCESS_REVOKED"

        _login(api_client, admin)
        assert api_client.post(f"/api/v1/students/{student.id}/restore-access/").status_code == 200
        api_client.post("/api/v1/auth/logout/")
        assert _login(api_client, account).status_code == 200

    def test_an_already_signed_in_student_is_cut_off(self, api_client):
        from rest_framework.test import APIClient

        _, admin, _, student, account = _world()
        student_client = APIClient()
        assert _login(student_client, account).status_code == 200
        assert student_client.get("/api/v1/auth/me/").status_code == 200

        _login(api_client, admin)
        api_client.post(f"/api/v1/students/{student.id}/revoke-access/", {"reason": "Disciplinary suspension"}, format="json")
        assert student_client.get("/api/v1/auth/me/").status_code in (401, 403)

    def test_a_reason_is_required(self, api_client):
        _, admin, _, student, _ = _world()
        _login(api_client, admin)
        assert api_client.post(f"/api/v1/students/{student.id}/revoke-access/", {}, format="json").status_code == 400

    def test_teachers_cannot_revoke(self, api_client):
        _, _, teacher, student, _ = _world()
        _login(api_client, teacher)
        assert api_client.post(f"/api/v1/students/{student.id}/revoke-access/", {"reason": "Because I want to"}, format="json").status_code == 403
