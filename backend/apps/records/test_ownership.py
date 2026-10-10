import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def people():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal, admin = UserFactory(school=school), UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    return principal, admin


def test_only_the_creator_can_edit_or_delete_a_record(api_client, people):
    principal, admin = people
    _login(api_client, principal)
    created = api_client.post("/api/v1/records/", {"title": "Policy", "category": "General", "body": "text"}, format="json")
    assert created.status_code == 201, created.data
    rid = created.data["id"]
    assert created.data["is_mine"] is True

    _login(api_client, admin)  # holds the module's full permissions, but didn't create it
    seen = api_client.get(f"/api/v1/records/{rid}/").data
    assert seen["is_mine"] is False
    assert api_client.patch(f"/api/v1/records/{rid}/", {"title": "Changed"}, format="json").status_code == 403
    assert api_client.delete(f"/api/v1/records/{rid}/").status_code == 403

    _login(api_client, principal)
    assert api_client.patch(f"/api/v1/records/{rid}/", {"title": "Mine to change"}, format="json").status_code == 200
    assert api_client.delete(f"/api/v1/records/{rid}/").status_code == 204


def test_only_the_uploader_can_edit_or_delete_a_document(api_client, people):
    principal, admin = people
    _login(api_client, principal)
    created = api_client.post(
        "/api/v1/documents/",
        {"title": "Handbook", "owner_type": "school", "file": SimpleUploadedFile("h.pdf", b"%PDF-1.4 x", content_type="application/pdf")},
        format="multipart",
    )
    assert created.status_code == 201, created.data
    did = created.data["id"]
    _login(api_client, admin)
    assert api_client.patch(f"/api/v1/documents/{did}/", {"title": "x"}, format="json").status_code == 403
    assert api_client.delete(f"/api/v1/documents/{did}/").status_code == 403
    _login(api_client, principal)
    assert api_client.delete(f"/api/v1/documents/{did}/").status_code == 204
