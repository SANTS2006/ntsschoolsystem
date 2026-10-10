import pytest

from apps.authorization.models import Role, SuppressedSystemRole
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(api_client):
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    admin = UserFactory(school=school)
    assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="principal"))
    api_client.post("/api/v1/auth/login/", {"email": admin.email, "password": DEFAULT_TEST_PASSWORD}, format="json")
    return school


def test_a_system_role_can_be_renamed_deactivated_and_stays_that_way_after_a_sync(api_client, setup):
    school = setup
    role = Role.unscoped_objects.get(school=school, slug="accountant")
    r = api_client.patch(f"/api/v1/roles/{role.id}/", {"name": "Bursar", "is_active": False}, format="json")
    assert r.status_code == 200, r.data
    seed_default_roles_for_school(school)  # what every deploy does
    role.refresh_from_db()
    assert (role.name, role.is_active, role.customized, role.is_system) == ("Bursar", False, True, True)
    # a deactivated role is still listed so it can be reactivated
    names = {x["name"] for x in api_client.get("/api/v1/roles/?page_size=50").data["results"]}
    assert "Bursar" in names


def test_a_system_role_can_be_deleted_and_is_not_recreated_by_the_sync(api_client, setup):
    school = setup
    role = Role.unscoped_objects.get(school=school, slug="exams-director")
    assert api_client.delete(f"/api/v1/roles/{role.id}/").status_code == 204
    assert SuppressedSystemRole.unscoped_objects.filter(school=school, slug="exams-director").exists()
    seed_default_roles_for_school(school)
    assert not Role.unscoped_objects.filter(school=school, slug="exams-director").exists()
    assert Role.unscoped_objects.filter(school=school, slug="teacher").exists()  # the others are untouched
