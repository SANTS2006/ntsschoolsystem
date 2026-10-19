from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

from .models import Event

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _world():
    """Two people who both hold the full events permissions (principal + school administrator)."""
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    creator = UserFactory(school=school)
    assign_role(user=creator, role=Role.unscoped_objects.get(school=school, slug="principal"))
    other = UserFactory(school=school)
    assign_role(user=other, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    return school, creator, other


def _event(school, creator, **extra):
    now = timezone.now()
    return Event.unscoped_objects.create(
        school=school, title="Sports day", start_datetime=now + timedelta(days=3),
        end_datetime=now + timedelta(days=3, hours=4), created_by=creator, **extra,
    )


def _image():
    return SimpleUploadedFile("cover.jpg", b"fake jpg bytes", content_type="image/jpeg")


class TestEventImage:
    def test_image_is_required_to_create_an_event(self, api_client):
        _, creator, _ = _world()
        _login(api_client, creator)
        now = timezone.now()
        payload = {
            "title": "Sports day", "category": "sports", "target_type": "school",
            "start_datetime": (now + timedelta(days=1)).isoformat(),
            "end_datetime": (now + timedelta(days=1, hours=2)).isoformat(),
        }

        assert api_client.post("/api/v1/events/", payload, format="multipart").status_code == 400
        response = api_client.post("/api/v1/events/", {**payload, "image": _image()}, format="multipart")
        assert response.status_code == 201, response.data
        assert response.data["image"]

    def test_editing_an_event_does_not_need_the_image_again(self, api_client):
        school, creator, _ = _world()
        event = _event(school, creator)
        _login(api_client, creator)
        response = api_client.patch(f"/api/v1/events/{event.id}/", {"title": "Renamed"}, format="json")
        assert response.status_code == 200, response.data


class TestOnlyTheCreatorManagesAnEvent:
    def test_creator_can_edit_publish_cancel_and_delete_their_event(self, api_client):
        school, creator, _ = _world()
        event = _event(school, creator)
        _login(api_client, creator)

        assert api_client.get(f"/api/v1/events/{event.id}/").data["is_mine"] is True
        assert api_client.patch(f"/api/v1/events/{event.id}/", {"title": "Renamed"}, format="json").status_code == 200
        assert api_client.post(f"/api/v1/events/{event.id}/publish/").status_code == 200
        assert api_client.post(f"/api/v1/events/{event.id}/cancel/").status_code == 200
        assert api_client.delete(f"/api/v1/events/{event.id}/").status_code == 204

    def test_someone_else_cannot_edit_publish_cancel_or_delete_it(self, api_client):
        school, creator, other = _world()
        event = _event(school, creator)
        _login(api_client, other)

        assert api_client.get(f"/api/v1/events/{event.id}/").data["is_mine"] is False
        assert api_client.patch(f"/api/v1/events/{event.id}/", {"title": "Hijacked"}, format="json").status_code == 403
        assert api_client.post(f"/api/v1/events/{event.id}/publish/").status_code == 403
        assert api_client.post(f"/api/v1/events/{event.id}/cancel/").status_code == 403
        assert api_client.delete(f"/api/v1/events/{event.id}/").status_code == 403
        event.refresh_from_db()
        assert event.title == "Sports day" and event.status == Event.Status.DRAFT

    def test_anyone_can_still_register_for_an_event_they_did_not_create(self, api_client):
        school, creator, other = _world()
        event = _event(school, creator, status=Event.Status.PUBLISHED)
        _login(api_client, other)

        response = api_client.post(f"/api/v1/events/{event.id}/register/")
        assert response.status_code in (200, 201), response.data

    def test_an_event_with_no_recorded_creator_stays_manageable(self, api_client):
        school, _, other = _world()
        event = _event(school, None)
        _login(api_client, other)
        assert api_client.patch(f"/api/v1/events/{event.id}/", {"title": "Fixed"}, format="json").status_code == 200


class TestRegistrationClosing:
    def _published(self, school, creator, **extra):
        return _event(school, creator, status=Event.Status.PUBLISHED, **extra)

    def test_no_registration_once_the_event_has_ended(self, api_client):
        school, creator, other = _world()
        now = timezone.now()
        event = Event.unscoped_objects.create(
            school=school, title="Past", start_datetime=now - timedelta(days=2), end_datetime=now - timedelta(hours=1),
            created_by=creator, status=Event.Status.PUBLISHED,
        )
        _login(api_client, other)
        response = api_client.post(f"/api/v1/events/{event.id}/register/")
        assert response.status_code == 400 and response.data["code"] == "EVENT_ENDED"
        assert api_client.get(f"/api/v1/events/{event.id}/").data["registration_open"] is False

    def test_creator_can_close_and_reopen_registration(self, api_client):
        school, creator, other = _world()
        event = self._published(school, creator)
        _login(api_client, creator)
        assert api_client.post(f"/api/v1/events/{event.id}/close-registration/").status_code == 200
        _login(api_client, other)
        response = api_client.post(f"/api/v1/events/{event.id}/register/")
        assert response.status_code == 400 and response.data["code"] == "REGISTRATION_CLOSED"
        _login(api_client, creator)
        assert api_client.post(f"/api/v1/events/{event.id}/reopen-registration/").status_code == 200
        _login(api_client, other)
        assert api_client.post(f"/api/v1/events/{event.id}/register/").status_code in (200, 201)

    def test_only_the_creator_can_close_registration(self, api_client):
        school, creator, other = _world()
        event = self._published(school, creator)
        _login(api_client, other)
        assert api_client.post(f"/api/v1/events/{event.id}/close-registration/").status_code == 403

    def test_registration_closes_by_itself_at_the_set_time(self, api_client):
        school, creator, other = _world()
        event = self._published(school, creator, registration_closes_at=timezone.now() - timedelta(minutes=1))
        _login(api_client, other)
        response = api_client.post(f"/api/v1/events/{event.id}/register/")
        assert response.status_code == 400 and response.data["code"] == "REGISTRATION_CLOSED"
        event.registration_closes_at = timezone.now() + timedelta(hours=1)
        event.save()
        assert api_client.post(f"/api/v1/events/{event.id}/register/").status_code in (200, 201)

    def test_close_time_cannot_be_after_the_event_ends(self, api_client):
        school, creator, _ = _world()
        event = self._published(school, creator)
        _login(api_client, creator)
        late = (event.end_datetime + timedelta(hours=1)).isoformat()
        response = api_client.patch(f"/api/v1/events/{event.id}/", {"registration_closes_at": late}, format="json")
        assert response.status_code == 400
