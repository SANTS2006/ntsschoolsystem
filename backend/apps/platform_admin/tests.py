import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.users.models import User
from tests.factories import DEFAULT_TEST_PASSWORD, PlatformAdminFactory, SchoolFactory, UserFactory

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": DEFAULT_TEST_PASSWORD},
        format="json",
    )


class TestPlatformAdminAccess:
    def test_school_user_cannot_access_platform_admin_list(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        principal = UserFactory(school=school)
        assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
        _login(api_client, principal)

        response = api_client.get("/api/v1/platform/admins/")
        assert response.status_code == 403

    def test_school_user_cannot_access_platform_stats(self, api_client):
        school = SchoolFactory()
        user = UserFactory(school=school)
        _login(api_client, user)

        response = api_client.get("/api/v1/platform/stats/")
        assert response.status_code == 403

    def test_platform_admin_can_invite_another_platform_admin(self, api_client):
        admin = PlatformAdminFactory()
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/platform/admins/invite/",
            {"email": "newadmin@platform.test", "first_name": "New", "last_name": "Admin"},
            format="json",
        )
        assert response.status_code == 200
        invited = User.objects.get(email="newadmin@platform.test")
        assert invited.user_type == User.UserType.PLATFORM_ADMIN
        assert invited.school_id is None

    def test_platform_stats_reflects_created_schools(self, api_client):
        admin = PlatformAdminFactory()
        SchoolFactory()
        SchoolFactory()
        _login(api_client, admin)

        response = api_client.get("/api/v1/platform/stats/")
        assert response.status_code == 200
        assert response.data["stats"]["schools_total"] >= 2

    def test_platform_admin_cannot_disable_self(self, api_client):
        admin = PlatformAdminFactory()
        _login(api_client, admin)

        response = api_client.post(f"/api/v1/platform/admins/{admin.id}/disable/")
        assert response.status_code == 400


class TestSignInPageScope:
    """A school's people sign in only through their own school's page; the platform page is for platform
    administrators only."""

    @staticmethod
    def _post(api_client, user, slug=None, password=DEFAULT_TEST_PASSWORD):
        body = {"email": user.email, "password": password}
        if slug is not None:
            body["school_slug"] = slug
        return api_client.post("/api/v1/auth/login/", body, format="json")

    @pytest.fixture(autouse=True)
    def _enforce(self, settings):
        settings.LOGIN_SCOPE_ENFORCEMENT = True

    def test_a_user_signs_in_through_their_own_schools_page(self, api_client):
        school = SchoolFactory(slug="greenwood")
        user = UserFactory(school=school)
        assert self._post(api_client, user, "greenwood").status_code == 200

    def test_another_schools_page_turns_them_away_before_the_password_is_checked(self, api_client):
        mine = SchoolFactory(slug="mine")
        other = SchoolFactory(slug="other", name="Other Academy")
        user = UserFactory(school=mine)
        response = self._post(api_client, user, "other", password="definitely-wrong")
        assert response.status_code == 403
        assert response.data["code"] == "WRONG_LOGIN_PAGE"
        assert "Other Academy" in response.data["message"] and "your own school" in response.data["message"]
        assert other.slug == "other"

    def test_the_platform_page_is_for_platform_admins_only(self, api_client):
        school_user = UserFactory(school=SchoolFactory())
        response = self._post(api_client, school_user)
        assert response.status_code == 403 and response.data["code"] == "WRONG_LOGIN_PAGE"
        assert self._post(api_client, PlatformAdminFactory()).status_code == 200

    def test_platform_admins_cannot_use_a_school_page(self, api_client):
        SchoolFactory(slug="greenwood")
        response = self._post(api_client, PlatformAdminFactory(), "greenwood")
        assert response.status_code == 403

    def test_an_unknown_school_page_is_reported(self, api_client):
        user = UserFactory(school=SchoolFactory())
        assert self._post(api_client, user, "no-such-school").data["code"] == "SCHOOL_NOT_FOUND"

    def test_an_unregistered_email_gets_the_ordinary_failure(self, api_client):
        SchoolFactory(slug="greenwood")
        response = api_client.post(
            "/api/v1/auth/login/", {"email": "nobody@nowhere.test", "password": "x", "school_slug": "greenwood"}, format="json"
        )
        assert response.status_code == 401 and response.data["code"] == "INVALID_CREDENTIALS"

    def test_the_right_page_with_the_wrong_password_is_an_ordinary_failure(self, api_client):
        school = SchoolFactory(slug="greenwood")
        user = UserFactory(school=school)
        assert self._post(api_client, user, "greenwood", password="wrong-password").status_code == 401


class TestMaintenanceMode:
    URL = "/api/v1/platform/maintenance/"

    def test_anyone_can_read_it_even_signed_out(self, api_client):
        response = api_client.get(self.URL)
        assert response.status_code == 200
        assert response.data["maintenance"]["enabled"] is False

    def test_only_platform_admins_can_change_it(self, api_client):
        school = SchoolFactory()
        user = UserFactory(school=school)
        _login(api_client, user)
        assert api_client.put(self.URL, {"enabled": True}, format="json").status_code == 403

    def test_turning_it_on_emails_everyone_once(self, api_client, settings, monkeypatch):
        settings.BACKGROUND_TASKS_ASYNC = False
        sent = []
        monkeypatch.setattr("apps.platform_admin.maintenance.send_email", lambda **kw: sent.append(kw["to_email"]) or True)
        school = SchoolFactory()
        UserFactory(school=school, email="a@school.test")
        UserFactory(school=school, email="b@school.test")
        admin = PlatformAdminFactory()
        _login(api_client, admin)

        response = api_client.put(
            self.URL, {"enabled": True, "message": "Back at 5pm.", "all_pages": True, "notify": True}, format="json"
        )
        assert response.status_code == 200, response.data
        assert {"a@school.test", "b@school.test", admin.email} <= set(sent)
        assert api_client.get(self.URL).data["maintenance"]["message"] == "Back at 5pm."

        # Saving again while it is already on doesn't email people a second time.
        sent.clear()
        api_client.put(self.URL, {"enabled": True, "message": "Back at 6pm.", "all_pages": True, "notify": True}, format="json")
        assert sent == []

    def test_it_can_be_limited_to_chosen_pages(self, api_client):
        _login(api_client, PlatformAdminFactory())
        response = api_client.put(
            self.URL, {"enabled": True, "all_pages": False, "pages": ["/finance", "/login"]}, format="json"
        )
        assert response.status_code == 200
        data = api_client.get(self.URL).data["maintenance"]
        assert data["all_pages"] is False and data["pages"] == ["/finance", "/login"]

    def test_chosen_pages_must_be_given_and_valid(self, api_client):
        _login(api_client, PlatformAdminFactory())
        assert api_client.put(self.URL, {"enabled": True, "all_pages": False, "pages": []}, format="json").status_code == 400
        assert api_client.put(self.URL, {"enabled": True, "all_pages": False, "pages": ["finance"]}, format="json").status_code == 400

    def test_turning_it_off(self, api_client):
        _login(api_client, PlatformAdminFactory())
        api_client.put(self.URL, {"enabled": True}, format="json")
        api_client.put(self.URL, {"enabled": False}, format="json")
        assert api_client.get(self.URL).data["maintenance"]["enabled"] is False


class TestDeletingPlatformAdmins:
    def test_a_disabled_admin_can_be_deleted_for_good(self, api_client):
        me = PlatformAdminFactory()
        other = PlatformAdminFactory()
        _login(api_client, me)
        api_client.post(f"/api/v1/platform/admins/{other.pk}/disable/")

        response = api_client.delete(f"/api/v1/platform/admins/{other.pk}/")
        assert response.status_code == 200
        assert not User.objects.filter(pk=other.pk).exists()

    def test_an_active_admin_must_be_disabled_first(self, api_client):
        me = PlatformAdminFactory()
        other = PlatformAdminFactory()
        _login(api_client, me)
        response = api_client.delete(f"/api/v1/platform/admins/{other.pk}/")
        assert response.status_code == 400 and response.data["code"] == "ADMIN_STILL_ACTIVE"
        assert User.objects.filter(pk=other.pk).exists()

    def test_nobody_can_delete_themselves(self, api_client):
        me = PlatformAdminFactory()
        _login(api_client, me)
        assert api_client.delete(f"/api/v1/platform/admins/{me.pk}/").status_code == 400
        assert User.objects.filter(pk=me.pk).exists()

    def test_school_users_cannot_delete_platform_admins(self, api_client):
        admin = PlatformAdminFactory(is_active=False)
        user = UserFactory(school=SchoolFactory())
        _login(api_client, user)
        assert api_client.delete(f"/api/v1/platform/admins/{admin.pk}/").status_code in (403, 404)
        assert User.objects.filter(pk=admin.pk).exists()
