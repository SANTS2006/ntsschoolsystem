import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

from .models import Complaint

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _user(school, slug):
    user = UserFactory(school=school)
    assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug=slug))
    return user


def _world():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    return school, _user(school, "teacher"), _user(school, "teacher"), _user(school, "school-administrator")


def _submit(api_client, **extra):
    payload = {"category": "facility", "subject": "Broken desks", "description": "Desks are damaged.", **extra}
    return api_client.post("/api/v1/complaints/", payload, format="json")


class TestStaffActionsVisibility:
    def test_submitter_never_gets_staff_actions_even_if_addressed_to_themselves(self, api_client):
        _, author, _, _ = _world()
        _login(api_client, author)
        created = _submit(api_client, addressed_to=str(author.id))
        assert created.status_code == 201, created.data

        detail = api_client.get(f"/api/v1/complaints/{created.data['id']}/")
        assert detail.data["can_act"] is False
        assert api_client.post(f"/api/v1/complaints/{created.data['id']}/resolve/", {}, format="json").status_code == 403

    def test_only_the_addressee_can_act_when_one_is_named(self, api_client):
        _, author, addressee, admin = _world()
        _login(api_client, author)
        complaint_id = _submit(api_client, addressed_to=str(addressee.id)).data["id"]
        api_client.logout()

        _login(api_client, admin)  # a handler, but not the one it was addressed to
        assert api_client.get(f"/api/v1/complaints/{complaint_id}/").data["can_act"] is False
        assert api_client.post(f"/api/v1/complaints/{complaint_id}/resolve/", {}, format="json").status_code == 403
        api_client.logout()

        _login(api_client, addressee)
        assert api_client.get(f"/api/v1/complaints/{complaint_id}/").data["can_act"] is True
        response = api_client.post(f"/api/v1/complaints/{complaint_id}/resolve/", {"resolution_notes": "Fixed"}, format="json")
        assert response.status_code == 200, response.data
        assert Complaint.unscoped_objects.get(pk=complaint_id).status == "resolved"

    def test_unaddressed_complaint_is_open_to_any_other_handler(self, api_client):
        _, author, other_teacher, admin = _world()
        _login(api_client, author)
        complaint_id = _submit(api_client).data["id"]
        assert api_client.get(f"/api/v1/complaints/{complaint_id}/").data["can_act"] is False
        api_client.logout()

        _login(api_client, admin)
        assert api_client.get(f"/api/v1/complaints/{complaint_id}/").data["can_act"] is True

    def test_anonymous_submitter_still_gets_no_staff_actions(self, api_client):
        _, author, _, _ = _world()
        _login(api_client, author)
        complaint_id = _submit(api_client, is_anonymous=True).data["id"]
        assert api_client.get(f"/api/v1/complaints/{complaint_id}/").data["can_act"] is False
