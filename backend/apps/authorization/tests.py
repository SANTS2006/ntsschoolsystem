import pytest

from apps.tenants.context import (
    reset_current_school_id,
    reset_platform_admin_context,
    set_current_school_id,
    set_platform_admin_context,
)
from tests.factories import DEFAULT_TEST_PASSWORD, PlatformAdminFactory, SchoolFactory, UserFactory

from .models import Permission, Role
from .services import (
    ALL_PERMISSIONS_SENTINEL,
    assign_role,
    get_user_permission_codes,
    seed_default_roles_for_school,
    seed_permission_catalog,
)

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _school_admin():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    admin = UserFactory(school=school)
    assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    return school, admin


def _teacher(school):
    teacher = UserFactory(school=school)
    assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return teacher


class TestRoleManagement:
    def test_admin_can_create_and_list_custom_role(self, api_client):
        school, admin = _school_admin()
        _login(api_client, admin)

        response = api_client.post("/api/v1/roles/", {"name": "Librarian Assistant"}, format="json")
        assert response.status_code == 201, response.data
        assert response.data["is_system"] is False

        listing = api_client.get("/api/v1/roles/")
        names = {row["name"] for row in listing.data["results"]}
        assert "Librarian Assistant" in names

    def test_teacher_cannot_create_role(self, api_client):
        school, _ = _school_admin()
        teacher = _teacher(school)
        _login(api_client, teacher)

        response = api_client.post("/api/v1/roles/", {"name": "Sneaky Role"}, format="json")
        assert response.status_code == 403

    def test_a_system_role_can_be_deleted_by_an_administrator(self, api_client):
        """System roles are editable, deactivatable and deletable (a school can shape its own role set); only the role
        management permission allows it."""
        school, admin = _school_admin()
        _login(api_client, admin)
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")

        response = api_client.delete(f"/api/v1/roles/{teacher_role.id}/")
        assert response.status_code == 204
        assert not Role.unscoped_objects.filter(pk=teacher_role.pk).exists()

    def test_can_delete_a_custom_role(self, api_client):
        school, admin = _school_admin()
        _login(api_client, admin)
        custom_role = Role.objects.create(school=school, name="Temp Role", slug="temp-role")

        response = api_client.delete(f"/api/v1/roles/{custom_role.id}/")
        assert response.status_code == 204
        assert not Role.unscoped_objects.filter(pk=custom_role.pk).exists()

    def test_permissions_action_lists_the_whole_catalog_flagged_by_membership(self, api_client):
        school, admin = _school_admin()
        _login(api_client, admin)
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")

        response = api_client.get(f"/api/v1/roles/{teacher_role.id}/permissions/")
        assert response.status_code == 200
        rows = {row["code"]: row["granted"] for row in response.data["permissions"]}
        assert rows["academics.view"] is True
        assert rows["staff.delete"] is False

    def test_set_permissions_replaces_the_role_and_marks_it_customized(self, api_client):
        school, admin = _school_admin()
        _login(api_client, admin)
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")
        assert teacher_role.is_system is True
        library_view = Permission.objects.get(code="library.view")

        response = api_client.post(
            f"/api/v1/roles/{teacher_role.id}/set-permissions/",
            {"permission_ids": [str(library_view.id)]},
            format="json",
        )
        assert response.status_code == 200, response.data

        teacher_role.refresh_from_db()
        assert teacher_role.is_system is True  # still a protected default role...
        assert teacher_role.customized is True  # ...but its permissions are now the school's own
        assert set(teacher_role.permissions.values_list("code", flat=True)) == {"library.view"}

    def test_resync_keeps_a_schools_edits_but_adds_newly_introduced_defaults(self, api_client, monkeypatch):
        school, admin = _school_admin()
        _login(api_client, admin)
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")
        library_view = Permission.objects.get(code="library.view")
        # the school keeps ONLY library.view on the teacher role...
        api_client.post(
            f"/api/v1/roles/{teacher_role.id}/set-permissions/", {"permission_ids": [str(library_view.id)]}, format="json"
        )
        # ...then a release introduces a new permission that teachers get by default
        Permission.objects.create(code="newmodule.view", name="View the new module", module="newmodule")
        from . import services as auth_services

        spec = dict(auth_services.DEFAULT_ROLE_PERMISSION_PREFIXES)
        spec["teacher"] = {"include": [*spec["teacher"]["include"], "newmodule."], "exclude": []}
        monkeypatch.setattr(auth_services, "DEFAULT_ROLE_PERMISSION_PREFIXES", spec)

        seed_default_roles_for_school(school)  # what a deploy runs

        teacher_role.refresh_from_db()
        granted = set(teacher_role.permissions.values_list("code", flat=True))
        assert "library.view" in granted  # the school's choice survives
        assert "students.view" not in granted  # a default the school removed is NOT quietly granted back
        assert "newmodule.view" in granted  # but a newly introduced default is added
        assert teacher_role.is_system is True and teacher_role.customized is True

        seed_default_roles_for_school(school)  # idempotent
        assert set(teacher_role.permissions.values_list("code", flat=True)) == granted

    def test_resync_still_fully_syncs_an_untouched_default_role(self):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")
        extra = Permission.objects.get(code="salary.view")
        teacher_role.role_permissions.create(school=school, permission=extra)  # drift on an untouched role

        seed_default_roles_for_school(school)

        assert "salary.view" not in set(teacher_role.permissions.values_list("code", flat=True))

    def test_cannot_manage_another_schools_role(self, api_client):
        school_a, admin_a = _school_admin()
        school_b, _ = _school_admin()
        _login(api_client, admin_a)
        role_b = Role.unscoped_objects.get(school=school_b, slug="teacher")

        response = api_client.get(f"/api/v1/roles/{role_b.id}/permissions/")
        assert response.status_code == 404


class TestPermissionManagement:
    def test_admin_can_create_a_custom_permission(self, api_client):
        _, admin = _school_admin()
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/roles/permissions/",
            {"code": "library.custom_action", "name": "Custom action", "module": "library"},
            format="json",
        )
        assert response.status_code == 201, response.data

    def test_duplicate_permission_code_rejected(self, api_client):
        _, admin = _school_admin()
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/roles/permissions/",
            {"code": "library.view", "name": "Duplicate", "module": "library"},
            format="json",
        )
        assert response.status_code == 400

    def test_teacher_cannot_manage_permissions(self, api_client):
        school, _ = _school_admin()
        teacher = _teacher(school)
        _login(api_client, teacher)

        response = api_client.get("/api/v1/roles/permissions/")
        assert response.status_code == 403


class TestPermissionScoping:
    def test_user_only_gets_permissions_from_their_own_school(self):
        seed_permission_catalog()
        school_a = SchoolFactory()
        school_b = SchoolFactory()
        seed_default_roles_for_school(school_a)
        seed_default_roles_for_school(school_b)

        teacher_a = UserFactory(school=school_a)
        accountant_b = UserFactory(school=school_b)

        assign_role(user=teacher_a, role=Role.unscoped_objects.get(school=school_a, slug="teacher"))
        assign_role(user=accountant_b, role=Role.unscoped_objects.get(school=school_b, slug="accountant"))

        teacher_a_codes = get_user_permission_codes(teacher_a)
        accountant_b_codes = get_user_permission_codes(accountant_b)

        assert "education.create" in teacher_a_codes
        assert "fees.view" not in teacher_a_codes  # accountant-only permission, different school
        assert "fees.view" in accountant_b_codes
        assert "education.create" not in accountant_b_codes

    def test_platform_admin_gets_all_permissions_sentinel(self):
        admin = PlatformAdminFactory()
        assert get_user_permission_codes(admin) == {ALL_PERMISSIONS_SENTINEL}

    def test_assign_role_is_idempotent_outside_request_context(self):
        """
        Regression test: assign_role() must use UserRole.unscoped_objects,
        not the tenant-scoped `objects` manager. Outside a request (no
        tenant context set — exactly the situation in a management command
        or this test), `objects.get_or_create()` silently misses the
        existing row (scoped queries return `.none()` with no context) and
        tries to re-insert it, raising a duplicate-key IntegrityError on
        the second call.
        """
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        user = UserFactory(school=school)
        role = Role.unscoped_objects.get(school=school, slug="teacher")

        assign_role(user=user, role=role)
        assign_role(user=user, role=role)  # must not raise IntegrityError

        from .models import UserRole

        assert UserRole.unscoped_objects.filter(user=user, role=role).count() == 1

    def test_assign_role_rejects_cross_school_role(self):
        school_a = SchoolFactory()
        school_b = SchoolFactory()
        seed_default_roles_for_school(school_b)

        user_in_a = UserFactory(school=school_a)
        role_in_b = Role.unscoped_objects.get(school=school_b, slug="teacher")

        with pytest.raises(ValueError):
            assign_role(user=user_in_a, role=role_in_b)


class TestTenantManagerScoping:
    def test_returns_empty_without_tenant_context(self):
        school = SchoolFactory()
        seed_default_roles_for_school(school)

        assert list(Role.objects.all()) == []

    def test_scopes_to_current_school_only(self):
        school_a = SchoolFactory()
        school_b = SchoolFactory()
        seed_default_roles_for_school(school_a)
        seed_default_roles_for_school(school_b)

        token = set_current_school_id(school_a.id)
        try:
            visible_schools = {role.school_id for role in Role.objects.all()}
        finally:
            reset_current_school_id(token)

        assert visible_schools == {school_a.id}

    def test_platform_admin_context_sees_all_schools(self):
        school_a = SchoolFactory()
        school_b = SchoolFactory()
        seed_default_roles_for_school(school_a)
        seed_default_roles_for_school(school_b)

        admin_token = set_platform_admin_context(True)
        try:
            visible_schools = {role.school_id for role in Role.objects.all()}
        finally:
            reset_platform_admin_context(admin_token)

        assert school_a.id in visible_schools
        assert school_b.id in visible_schools


class TestWorkingAsOneRole:
    """A person who holds several roles chooses which to work as; from then on they have exactly that role's modules
    and permissions, and nothing from the others."""

    def _staff_with_two_roles(self):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        person = UserFactory(school=school)
        assign_role(user=person, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        assign_role(user=person, role=Role.unscoped_objects.get(school=school, slug="accountant"))
        return school, person

    def _me(self, api_client, role=None):
        extra = {"HTTP_X_ACTIVE_ROLE": role} if role else {}
        return api_client.get("/api/v1/auth/me/", **extra).data["user"]

    def test_without_choosing_the_user_is_asked_to_choose(self, api_client):
        _, person = self._staff_with_two_roles()
        _login(api_client, person)
        me = self._me(api_client)
        assert me["needs_role_choice"] is True and me["active_role_slug"] is None
        assert {r["slug"] for r in me["available_roles"]} == {"teacher", "accountant"}

    def test_working_as_a_role_gives_exactly_that_roles_permissions_and_hides_the_other(self, api_client):
        _, person = self._staff_with_two_roles()
        _login(api_client, person)
        teacher = self._me(api_client, "teacher")
        accountant = self._me(api_client, "accountant")

        assert teacher["needs_role_choice"] is False and teacher["active_role_slug"] == "teacher"
        assert [r["slug"] for r in teacher["roles"]] == ["teacher"]
        assert [r["slug"] for r in accountant["roles"]] == ["accountant"]
        assert set(teacher["permissions"]) == set(teacher["roles"][0]["permissions"])
        assert set(accountant["permissions"]) == set(accountant["roles"][0]["permissions"])
        # nothing of the other role leaks into either view
        assert not set(teacher["permissions"]) & (set(accountant["permissions"]) - set(teacher["permissions"]))
        assert set(teacher["permissions"]) != set(accountant["permissions"])

    def test_the_server_enforces_it_not_just_the_menu(self, api_client):
        school, person = self._staff_with_two_roles()
        _login(api_client, person)
        # payments.view belongs to the accountant, not the teacher
        assert api_client.get("/api/v1/finance/payments/", HTTP_X_ACTIVE_ROLE="accountant").status_code == 200
        assert api_client.get("/api/v1/finance/payments/", HTTP_X_ACTIVE_ROLE="teacher").status_code == 403
        # with no choice made the old behaviour (every role's permissions) still applies for API callers
        assert api_client.get("/api/v1/finance/payments/").status_code == 200

    def test_a_role_you_do_not_hold_cannot_be_claimed(self, api_client):
        school, person = self._staff_with_two_roles()
        _login(api_client, person)
        me = self._me(api_client, "school-administrator")
        assert me["active_role_slug"] is None
        assert "settings.update" not in me["permissions"]

    def test_a_single_role_user_is_never_asked(self, api_client):
        school, admin = _school_admin()
        _login(api_client, admin)
        me = self._me(api_client)
        assert me["needs_role_choice"] is False and len(me["available_roles"]) == 1

    def test_someone_working_as_the_accountant_is_not_scoped_as_a_teacher(self, api_client):
        from apps.authorization.services import user_has_active_role

        _, person = self._staff_with_two_roles()
        person.active_role_slug = "accountant"
        assert user_has_active_role(person, "teacher") is False
        assert user_has_active_role(person, "accountant") is True
        person.active_role_slug = None
        assert user_has_active_role(person, "teacher") is True
