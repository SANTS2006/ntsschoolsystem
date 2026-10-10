import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, DisciplineIncidentFactory, SchoolFactory, StudentFactory, UserFactory

from .models import DisciplineIncident

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


class TestDisciplineStricterPermissions:
    def test_principal_can_report_incident(self, api_client):
        school, principal = _principal()
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/discipline/incidents/",
            {
                "student": str(student.id),
                "category": "tardiness",
                "incident_date": "2026-01-15T09:00:00Z",
                "description": "Arrived 30 minutes late",
            },
            format="json",
        )
        assert response.status_code == 201
        # response.data holds native Python objects (UUID instances) before
        # the renderer serializes to JSON — compare against the bare UUID,
        # not str(), or `UUID == str` silently returns False.
        assert response.data["reported_by"] == principal.id

    def test_teacher_cannot_view_discipline_records(self, api_client):
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/discipline/incidents/")
        assert response.status_code == 403


class TestDisciplineTenantIsolation:
    def test_cannot_list_another_schools_incidents(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        DisciplineIncidentFactory(school=school_b)
        incident_a = DisciplineIncidentFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/discipline/incidents/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(incident_a.id) in ids_seen
        assert len(ids_seen) == 1
