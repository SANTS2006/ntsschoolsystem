import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

from .models import Record

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _user_with_role(school, slug):
    user = UserFactory(school=school)
    assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug=slug))
    return user


def _school():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    return school


class TestRecordWritePermissions:
    def test_principal_can_create_a_text_record(self, api_client):
        school = _school()
        principal = _user_with_role(school, "principal")
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/records/",
            {"title": "Fire safety policy", "category": "Policy", "body": "Assemble at the front gate."},
            format="json",
        )
        assert response.status_code == 201, response.data
        assert str(response.data["created_by"]) == str(principal.id)

    def test_school_administrator_can_create_and_edit_a_record(self, api_client):
        school = _school()
        admin = _user_with_role(school, "school-administrator")
        _login(api_client, admin)

        create = api_client.post(
            "/api/v1/records/", {"title": "Term calendar", "body": "Term 1 starts in January."}, format="json"
        )
        assert create.status_code == 201, create.data

        update = api_client.patch(
            f"/api/v1/records/{create.data['id']}/", {"body": "Term 1 starts in February."}, format="json"
        )
        assert update.status_code == 200
        assert update.data["body"] == "Term 1 starts in February."

    def test_teacher_cannot_create_a_record(self, api_client):
        school = _school()
        teacher = _user_with_role(school, "teacher")
        _login(api_client, teacher)

        response = api_client.post("/api/v1/records/", {"title": "Not allowed", "body": "x"}, format="json")
        assert response.status_code == 403

    def test_accountant_cannot_edit_a_record(self, api_client):
        school = _school()
        principal = _user_with_role(school, "principal")
        _login(api_client, principal)
        record_id = api_client.post(
            "/api/v1/records/", {"title": "Fee policy", "body": "Due on the 5th."}, format="json"
        ).data["id"]

        accountant = _user_with_role(school, "accountant")
        _login(api_client, accountant)
        response = api_client.patch(f"/api/v1/records/{record_id}/", {"body": "Due on the 10th."}, format="json")
        assert response.status_code == 403


class TestRecordReadAccess:
    def test_every_signed_in_role_can_list_records(self, api_client):
        school = _school()
        principal = _user_with_role(school, "principal")
        _login(api_client, principal)
        api_client.post("/api/v1/records/", {"title": "Handbook", "body": "Rules and expectations."}, format="json")

        for slug in ["teacher", "accountant", "exams-director", "school-administrator"]:
            staff_user = _user_with_role(school, slug)
            _login(api_client, staff_user)
            response = api_client.get("/api/v1/records/")
            assert response.status_code == 200, (slug, response.data)
            assert response.data["count"] == 1

    def test_student_can_view_records(self, api_client):
        from tests.factories import StudentFactory

        school = _school()
        principal = _user_with_role(school, "principal")
        _login(api_client, principal)
        api_client.post("/api/v1/records/", {"title": "Handbook", "body": "Rules."}, format="json")

        student = StudentFactory(school=school)
        student_user = UserFactory(school=school)
        student.user = student_user
        student.save(update_fields=["user"])
        _login(api_client, student_user)

        response = api_client.get("/api/v1/records/")
        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_student_cannot_create_a_record(self, api_client):
        from tests.factories import StudentFactory

        school = _school()
        student = StudentFactory(school=school)
        student_user = UserFactory(school=school)
        student.user = student_user
        student.save(update_fields=["user"])
        _login(api_client, student_user)

        response = api_client.post("/api/v1/records/", {"title": "Nope", "body": "x"}, format="json")
        assert response.status_code == 403


class TestRecordValidation:
    def test_record_requires_body_or_file(self, api_client):
        school = _school()
        principal = _user_with_role(school, "principal")
        _login(api_client, principal)

        response = api_client.post("/api/v1/records/", {"title": "Empty"}, format="json")
        assert response.status_code == 400

    def test_cannot_view_another_schools_records(self, api_client):
        school_a = _school()
        school_b = _school()
        principal_a = _user_with_role(school_a, "principal")
        principal_b = _user_with_role(school_b, "principal")
        _login(api_client, principal_a)
        api_client.post("/api/v1/records/", {"title": "School A only", "body": "Secret."}, format="json")

        _login(api_client, principal_b)
        response = api_client.get("/api/v1/records/")
        assert response.status_code == 200
        assert response.data["count"] == 0
        assert Record.unscoped_objects.filter(school=school_a).count() == 1
