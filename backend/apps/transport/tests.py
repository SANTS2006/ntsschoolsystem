import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    RouteFactory,
    SchoolFactory,
    StopFactory,
    StudentFactory,
    UserFactory,
    VehicleFactory,
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


class TestTransportPermissions:
    def test_teacher_cannot_manage_transport(self, api_client):
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/transport/vehicles/", {"registration_number": "ABC-123"}, format="json"
        )
        assert response.status_code == 403


class TestStudentAssignment:
    def test_assign_student_to_route_and_stop(self, api_client):
        school, principal = _principal()
        route = RouteFactory(school=school)
        stop = StopFactory(school=school, route=route)
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/transport/assignments/",
            {"student": str(student.id), "route": str(route.id), "stop": str(stop.id)},
            format="json",
        )
        assert response.status_code == 201

    def test_stop_must_belong_to_assigned_route(self, api_client):
        school, principal = _principal()
        route_a = RouteFactory(school=school)
        route_b = RouteFactory(school=school)
        stop_on_b = StopFactory(school=school, route=route_b)
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/transport/assignments/",
            {"student": str(student.id), "route": str(route_a.id), "stop": str(stop_on_b.id)},
            format="json",
        )
        assert response.status_code == 400


class TestTransportTenantIsolation:
    def test_cannot_list_another_schools_vehicles(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        VehicleFactory(school=school_b)
        vehicle_a = VehicleFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/transport/vehicles/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(vehicle_a.id) in ids_seen
        assert len(ids_seen) == 1
