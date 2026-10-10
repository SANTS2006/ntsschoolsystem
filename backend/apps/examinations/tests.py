import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, ExamFactory, SchoolFactory, UserFactory

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


def _teacher(school):
    teacher = UserFactory(school=school)
    assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return teacher


class TestExamConfig:
    def test_principal_can_create_exam_and_schedule(self, api_client):
        school, principal = _principal()
        term_id = ExamFactory(school=school).term_id
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/examinations/exams/",
            {"name": "Midterm", "term": str(term_id), "start_date": "2026-02-01", "end_date": "2026-02-05"},
            format="json",
        )
        assert response.status_code == 201

    def test_teacher_cannot_create_exam(self, api_client):
        school, _ = _principal()
        teacher = _teacher(school)
        term_id = ExamFactory(school=school).term_id
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/examinations/exams/",
            {"name": "Midterm", "term": str(term_id), "start_date": "2026-02-01", "end_date": "2026-02-05"},
            format="json",
        )
        assert response.status_code == 403

    def test_duplicate_exam_name_in_term_rejected(self, api_client):
        school, principal = _principal()
        exam = ExamFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/examinations/exams/",
            {
                "name": exam.name,
                "term": str(exam.term_id),
                "start_date": "2026-02-01",
                "end_date": "2026-02-05",
            },
            format="json",
        )
        assert response.status_code == 400


class TestExaminationsTenantIsolation:
    def test_cannot_list_another_schools_exams(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        ExamFactory(school=school_b)
        exam_a = ExamFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/examinations/exams/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(exam_a.id) in ids_seen
        assert len(ids_seen) == 1
