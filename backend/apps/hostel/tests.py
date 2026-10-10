import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    BedFactory,
    HostelAllocationFactory,
    SchoolFactory,
    StudentFactory,
    UserFactory,
)

from .models import HostelAllocation
from .services import HostelError, allocate_bed, check_out

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


class TestHostelPermissions:
    def test_teacher_cannot_manage_hostel(self, api_client):
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post("/api/v1/hostel/hostels/", {"name": "Block A"}, format="json")
        assert response.status_code == 403


class TestBedAllocation:
    def test_allocate_bed_to_student(self, api_client):
        school, principal = _principal()
        bed = BedFactory(school=school)
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/hostel/allocations/", {"bed": str(bed.id), "student": str(student.id)}, format="json"
        )
        assert response.status_code == 201
        assert response.data["allocation"]["status"] == "active"

    def test_cannot_over_allocate_same_bed(self, api_client):
        school, principal = _principal()
        bed = BedFactory(school=school)
        HostelAllocationFactory(school=school, bed=bed)  # already actively occupied
        new_student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/hostel/allocations/",
            {"bed": str(bed.id), "student": str(new_student.id)},
            format="json",
        )
        assert response.status_code == 400
        assert HostelAllocation.unscoped_objects.filter(bed=bed, status="active").count() == 1

    def test_student_cannot_have_two_active_allocations(self, api_client):
        school, principal = _principal()
        student = StudentFactory(school=school)
        HostelAllocationFactory(school=school, student=student)  # already has one
        other_bed = BedFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/hostel/allocations/",
            {"bed": str(other_bed.id), "student": str(student.id)},
            format="json",
        )
        assert response.status_code == 400

    def test_checkout_frees_bed_for_reallocation(self, api_client):
        school, principal = _principal()
        bed = BedFactory(school=school)
        allocation = HostelAllocationFactory(school=school, bed=bed)
        new_student = StudentFactory(school=school)
        _login(api_client, principal)

        checkout_response = api_client.post(f"/api/v1/hostel/allocations/{allocation.id}/check-out/")
        assert checkout_response.status_code == 200

        reallocate_response = api_client.post(
            "/api/v1/hostel/allocations/",
            {"bed": str(bed.id), "student": str(new_student.id)},
            format="json",
        )
        assert reallocate_response.status_code == 201

    def test_cannot_check_out_already_checked_out_allocation(self, api_client):
        school, principal = _principal()
        allocation = HostelAllocationFactory(school=school, status=HostelAllocation.Status.CHECKED_OUT)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/hostel/allocations/{allocation.id}/check-out/")
        assert response.status_code == 400


class TestServiceLayerDirectly:
    """Regression coverage for the outside-request-context bug class (Phase 9)."""

    def test_allocate_bed_works_outside_request_context(self):
        school, _ = _principal()
        bed = BedFactory(school=school)
        student = StudentFactory(school=school)

        allocation = allocate_bed(bed=bed, student=student)
        assert allocation.status == HostelAllocation.Status.ACTIVE

    def test_allocate_bed_rejects_double_booking_outside_request_context(self):
        school, _ = _principal()
        bed = BedFactory(school=school)
        student_a = StudentFactory(school=school)
        student_b = StudentFactory(school=school)

        allocate_bed(bed=bed, student=student_a)
        with pytest.raises(HostelError):
            allocate_bed(bed=bed, student=student_b)

    def test_check_out_works_outside_request_context(self):
        school, _ = _principal()
        allocation = HostelAllocationFactory(school=school)
        checked_out = check_out(allocation=allocation)
        assert checked_out.status == HostelAllocation.Status.CHECKED_OUT


class TestHostelTenantIsolation:
    def test_cannot_list_another_schools_hostels(self, api_client):
        from tests.factories import HostelFactory

        school_a, principal_a = _principal()
        school_b, _ = _principal()
        HostelFactory(school=school_b)
        hostel_a = HostelFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/hostel/hostels/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(hostel_a.id) in ids_seen
        assert len(ids_seen) == 1

    def test_cannot_allocate_another_schools_bed(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        bed_b = BedFactory(school=school_b)
        student_a = StudentFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.post(
            "/api/v1/hostel/allocations/", {"bed": str(bed_b.id), "student": str(student_a.id)}, format="json"
        )
        assert response.status_code == 400
