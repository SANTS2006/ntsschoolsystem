import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, PlatformAdminFactory, SchoolFactory, UserFactory

from .models import School

pytestmark = pytest.mark.django_db


def _login(api_client, email, password=DEFAULT_TEST_PASSWORD):
    return api_client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")


def _login_as(api_client, user):
    _login(api_client, user.email)


class TestSchoolCreation:
    def test_platform_admin_can_create_school(self, api_client):
        admin = PlatformAdminFactory()
        _login_as(api_client, admin)

        response = api_client.post(
            "/api/v1/schools/",
            {
                "name": "Greenwood High",
                "slug": "greenwood-high",
                "admin_email": "admin@greenwood.test",
                "admin_first_name": "Grace",
                "admin_last_name": "Greenwood",
            },
            format="json",
        )

        assert response.status_code == 201
        assert response.data["school"]["status"] == "pending"

        school = School.objects.get(slug="greenwood-high")
        assert school.name == "Greenwood High"
        # Default roles were seeded and the admin invited + assigned.
        assert Role.unscoped_objects.filter(school=school, slug="school-administrator").exists()

    def test_school_user_cannot_create_school(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        user = UserFactory(school=school)
        assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login_as(api_client, user)

        response = api_client.post(
            "/api/v1/schools/",
            {
                "name": "X",
                "slug": "x-school",
                "admin_email": "a@x.test",
                "admin_first_name": "A",
                "admin_last_name": "B",
            },
            format="json",
        )
        assert response.status_code == 403

    def test_anonymous_cannot_list_schools(self, api_client):
        response = api_client.get("/api/v1/schools/")
        assert response.status_code == 401


class TestSchoolActivation:
    def test_activate_and_suspend(self, api_client):
        admin = PlatformAdminFactory()
        _login_as(api_client, admin)
        school = SchoolFactory(status=School.Status.PENDING)

        activate = api_client.post(f"/api/v1/schools/{school.id}/activate/")
        assert activate.status_code == 200
        school.refresh_from_db()
        assert school.status == School.Status.ACTIVE

        suspend = api_client.post(
            f"/api/v1/schools/{school.id}/suspend/", {"reason": "Non-payment"}, format="json"
        )
        assert suspend.status_code == 200
        school.refresh_from_db()
        assert school.status == School.Status.SUSPENDED
        assert school.suspended_reason == "Non-payment"


class TestSchoolDeletion:
    def _setup(self, api_client, status):
        admin = PlatformAdminFactory()
        _login_as(api_client, admin)
        school = SchoolFactory(status=status)
        seed_permission_catalog()
        seed_default_roles_for_school(school)
        user = UserFactory(school=school)
        assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        return school, user

    def test_a_suspended_school_is_deleted_with_its_people_and_roles(self, api_client):
        from apps.audit.models import AuditLog
        from apps.users.models import User

        school, user = self._setup(api_client, School.Status.SUSPENDED)
        other = SchoolFactory()
        response = api_client.delete(f"/api/v1/schools/{school.id}/", {"confirm": school.slug}, format="json")
        assert response.status_code == 200
        assert not School.objects.filter(pk=school.pk).exists()
        assert not User._base_manager.filter(pk=user.pk).exists()
        assert not Role.unscoped_objects.filter(school_id=school.pk).exists()
        assert School.objects.filter(pk=other.pk).exists()
        entry = AuditLog.objects.get(action="platform.school_deleted")
        assert entry.metadata["slug"] == school.slug

    def test_an_active_school_cannot_be_deleted(self, api_client):
        school, _ = self._setup(api_client, School.Status.ACTIVE)
        response = api_client.delete(f"/api/v1/schools/{school.id}/", {"confirm": school.slug}, format="json")
        assert response.status_code == 409
        assert School.objects.filter(pk=school.pk).exists()

    def test_the_address_must_be_typed_back(self, api_client):
        school, _ = self._setup(api_client, School.Status.SUSPENDED)
        for body in ({}, {"confirm": "wrong"}):
            response = api_client.delete(f"/api/v1/schools/{school.id}/", body, format="json")
            assert response.status_code == 400
        assert School.objects.filter(pk=school.pk).exists()

    def test_school_users_cannot_delete_schools(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory(status=School.Status.ACTIVE)
        seed_default_roles_for_school(school)
        user = UserFactory(school=school)
        assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login_as(api_client, user)
        assert api_client.delete(f"/api/v1/schools/{school.id}/", {"confirm": school.slug}, format="json").status_code in {403, 404}
        assert School.objects.filter(pk=school.pk).exists()


class TestSchoolSelfService:
    def test_school_user_can_view_own_school_only(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        user = UserFactory(school=school)
        assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login_as(api_client, user)

        response = api_client.get("/api/v1/schools/me/")
        assert response.status_code == 200
        assert response.data["school"]["id"] == str(school.id)

    def test_update_requires_settings_update_permission(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login_as(api_client, teacher)

        response = api_client.patch("/api/v1/schools/me/", {"motto": "New motto"}, format="json")
        assert response.status_code == 403

    def test_principal_can_update_own_school(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        principal = UserFactory(school=school)
        assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
        _login_as(api_client, principal)

        response = api_client.patch("/api/v1/schools/me/", {"motto": "Excellence"}, format="json")
        assert response.status_code == 200
        school.refresh_from_db()
        assert school.motto == "Excellence"

    def test_cannot_update_status_via_self_service(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        principal = UserFactory(school=school)
        assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
        _login_as(api_client, principal)

        response = api_client.patch("/api/v1/schools/me/", {"status": "suspended"}, format="json")
        assert response.status_code == 200
        school.refresh_from_db()
        assert school.status == School.Status.ACTIVE  # unchanged — status is read-only here


class TestPromotionThreshold:
    """Phase 2 — School.promotion_threshold_percent, the cut-off the promotion engine (Phase 7)
    compares a student's three-term overall percentage against."""

    def _principal(self):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        principal = UserFactory(school=school)
        assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
        return school, principal

    def test_default_promotion_threshold_is_50(self):
        school = SchoolFactory()
        assert school.promotion_threshold_percent == 50

    def test_principal_can_update_promotion_threshold(self, api_client):
        school, principal = self._principal()
        _login_as(api_client, principal)

        response = api_client.patch("/api/v1/schools/me/", {"promotion_threshold_percent": 65}, format="json")
        assert response.status_code == 200
        school.refresh_from_db()
        assert school.promotion_threshold_percent == 65

    def test_threshold_above_100_rejected(self, api_client):
        school, principal = self._principal()
        _login_as(api_client, principal)

        response = api_client.patch("/api/v1/schools/me/", {"promotion_threshold_percent": 150}, format="json")
        assert response.status_code == 400
        school.refresh_from_db()
        assert school.promotion_threshold_percent == 50

    def test_teacher_without_settings_permission_cannot_update_threshold(self, api_client):
        school, _principal_user = self._principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login_as(api_client, teacher)

        response = api_client.patch("/api/v1/schools/me/", {"promotion_threshold_percent": 70}, format="json")
        assert response.status_code == 403


class TestSchoolBrandColours:
    def _create(self, api_client, **extra):
        admin = PlatformAdminFactory()
        _login_as(api_client, admin)
        return api_client.post(
            "/api/v1/schools/",
            {
                "name": "Riverside",
                "slug": extra.pop("slug", "riverside"),
                "admin_email": "admin@riverside.test",
                "admin_first_name": "Rita",
                "admin_last_name": "River",
                **extra,
            },
            format="json",
        )

    def test_platform_admin_chooses_the_colours_when_adding_a_school(self, api_client):
        response = self._create(api_client, primary_color="#7c3aed", secondary_color="#f59e0b")
        assert response.status_code == 201, response.data
        school = School.objects.get(slug="riverside")
        assert (school.primary_color, school.secondary_color) == ("#7c3aed", "#f59e0b")

    def test_colours_default_to_the_logos_blue_and_cyan(self, api_client):
        assert self._create(api_client).status_code == 201
        school = School.objects.get(slug="riverside")
        assert (school.primary_color, school.secondary_color) == ("#1565c0", "#22d3ee")

    def test_a_colour_must_be_a_hex_code(self, api_client):
        assert self._create(api_client, primary_color="blue").status_code == 400

    def test_the_login_page_branding_includes_the_colours(self, api_client):
        school = SchoolFactory(status="active", primary_color="#7c3aed", secondary_color="#f59e0b")
        data = api_client.get(f"/api/v1/schools/branding/{school.slug}/").data["school"]
        assert (data["primary_color"], data["secondary_color"]) == ("#7c3aed", "#f59e0b")

    def test_a_school_cannot_take_an_address_the_app_uses_itself(self, api_client):
        for slug in ("dashboard", "login", "platform", "students"):
            assert self._create(api_client, slug=slug).status_code == 400, slug


class TestSchoolLinksInEmails:
    def test_links_point_at_the_schools_own_pages(self, settings):
        from apps.common.email import brand_color, school_link

        settings.FRONTEND_URL = "https://app.example.test"
        school = SchoolFactory(slug="greenwood", primary_color="#7c3aed")
        assert school_link(school, "/login") == "https://app.example.test/greenwood/login"
        assert school_link(school, "accept-invitation?uid=1") == "https://app.example.test/greenwood/accept-invitation?uid=1"
        assert school_link(None, "/login") == "https://app.example.test/login"
        assert brand_color(school) == "#7c3aed"
        assert brand_color(None) == "#1565c0"
