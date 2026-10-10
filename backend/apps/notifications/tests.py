import pytest

from apps.notifications.services import mark_read, notify, notify_bulk
from tests.factories import DEFAULT_TEST_PASSWORD, NotificationFactory, SchoolFactory, UserFactory

from .models import Notification

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


class TestNotificationInbox:
    def test_user_sees_only_own_notifications(self, api_client):
        school = SchoolFactory()
        me = UserFactory(school=school)
        someone_else = UserFactory(school=school)
        NotificationFactory(school=school, recipient=me)
        NotificationFactory(school=school, recipient=someone_else)
        _login(api_client, me)

        response = api_client.get("/api/v1/notifications/")

        assert response.status_code == 200
        assert len(response.data["results"]) == 1

    def test_mark_read_action(self, api_client):
        school = SchoolFactory()
        me = UserFactory(school=school)
        notification = NotificationFactory(school=school, recipient=me)
        _login(api_client, me)

        response = api_client.post(f"/api/v1/notifications/{notification.id}/mark-read/")

        assert response.status_code == 200
        notification.refresh_from_db()
        assert notification.is_read is True
        assert notification.read_at is not None

    def test_mark_all_read_action(self, api_client):
        school = SchoolFactory()
        me = UserFactory(school=school)
        NotificationFactory(school=school, recipient=me)
        NotificationFactory(school=school, recipient=me)
        _login(api_client, me)

        response = api_client.post("/api/v1/notifications/mark-all-read/")

        assert response.status_code == 200
        assert Notification.unscoped_objects.filter(recipient=me, is_read=False).count() == 0

    def test_cannot_mark_someone_elses_notification_read(self, api_client):
        school = SchoolFactory()
        me = UserFactory(school=school)
        someone_else = UserFactory(school=school)
        notification = NotificationFactory(school=school, recipient=someone_else)
        _login(api_client, me)

        response = api_client.post(f"/api/v1/notifications/{notification.id}/mark-read/")

        assert response.status_code == 404


class TestNotificationServices:
    def test_notify_creates_a_notification(self):
        school = SchoolFactory()
        recipient = UserFactory(school=school)

        notification = notify(recipient=recipient, category="general", title="Hi", message="Hello there")

        assert notification.recipient_id == recipient.id
        assert notification.school_id == school.id

    def test_notify_bulk_creates_one_per_recipient(self):
        school = SchoolFactory()
        recipients = [UserFactory(school=school) for _ in range(3)]

        created = notify_bulk(recipients=recipients, category="general", title="Hi", message="Hello all")

        assert len(created) == 3
        assert Notification.unscoped_objects.filter(category="general").count() == 3

    def test_notify_bulk_with_no_recipients_is_a_noop(self):
        assert notify_bulk(recipients=[], category="general", title="Hi", message="Hello") == []

    def test_mark_read_is_idempotent(self):
        school = SchoolFactory()
        recipient = UserFactory(school=school)
        notification = NotificationFactory(school=school, recipient=recipient)

        mark_read(notification)
        first_read_at = notification.read_at
        mark_read(notification)

        assert notification.read_at == first_read_at


class TestNotificationDetails:
    def test_details_return_the_full_message_not_a_teaser(self, api_client):
        school = SchoolFactory()
        me = UserFactory(school=school)
        long_message = "Line one.\n" + ("A long announcement body. " * 120)  # well past the old 1000-char cap
        notification = NotificationFactory(school=school, recipient=me, message=long_message)
        _login(api_client, me)

        response = api_client.get(f"/api/v1/notifications/{notification.id}/")

        assert response.status_code == 200
        assert response.data["message"] == long_message

    def test_cannot_open_someone_elses_notification(self, api_client):
        school = SchoolFactory()
        me = UserFactory(school=school)
        theirs = NotificationFactory(school=school, recipient=UserFactory(school=school))
        _login(api_client, me)

        assert api_client.get(f"/api/v1/notifications/{theirs.id}/").status_code == 404
