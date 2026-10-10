import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, PlatformAdminFactory, SchoolFactory, UserFactory

from .services import log_action

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": DEFAULT_TEST_PASSWORD},
        format="json",
    )


class TestAuditLogScoping:
    def test_school_user_sees_only_their_own_schools_entries(self, api_client):
        seed_permission_catalog()
        school_a = SchoolFactory()
        school_b = SchoolFactory()
        seed_default_roles_for_school(school_a)
        seed_default_roles_for_school(school_b)
        principal_a = UserFactory(school=school_a)
        assign_role(user=principal_a, role=Role.unscoped_objects.get(school=school_a, slug="principal"))

        log_action(action="test.event", school=school_a, entity_type="X", entity_id="1")
        log_action(action="test.event", school=school_b, entity_type="X", entity_id="2")

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/audit/")

        assert response.status_code == 200
        # response.data holds native Python values (UUID objects) before
        # the renderer serializes to JSON text — compare against those, not str().
        schools_seen = {row["school"] for row in response.data["results"]}
        assert school_a.id in schools_seen
        assert school_b.id not in schools_seen

    def test_platform_admin_sees_all_schools_entries(self, api_client):
        seed_permission_catalog()
        school_a = SchoolFactory()
        school_b = SchoolFactory()
        log_action(action="test.event", school=school_a, entity_type="X", entity_id="1")
        log_action(action="test.event", school=school_b, entity_type="X", entity_id="2")

        admin = PlatformAdminFactory()
        _login(api_client, admin)
        response = api_client.get("/api/v1/audit/")

        assert response.status_code == 200
        schools_seen = {row["school"] for row in response.data["results"]}
        assert school_a.id in schools_seen
        assert school_b.id in schools_seen

    def test_user_without_audit_view_permission_is_rejected(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))

        _login(api_client, teacher)
        response = api_client.get("/api/v1/audit/")
        assert response.status_code == 403
