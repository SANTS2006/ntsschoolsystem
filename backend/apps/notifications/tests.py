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


class TestWebPush:
    def test_subscribe_replaces_and_unsubscribe_removes(self, api_client):
        from .models import PushSubscription

        school = SchoolFactory()
        me = UserFactory(school=school)
        other = UserFactory(school=school)
        body = {"endpoint": "https://push.example/abc", "p256dh": "key", "auth": "secret"}
        _login(api_client, me)
        assert api_client.post("/api/v1/notifications/push/subscription/", body, format="json").status_code == 200
        assert PushSubscription.objects.get().user_id == me.pk

        # The same browser signing in as someone else is re-pointed at them, not duplicated.
        api_client.post("/api/v1/auth/logout/")
        _login(api_client, other)
        api_client.post("/api/v1/notifications/push/subscription/", body, format="json")
        assert PushSubscription.objects.get().user_id == other.pk

        api_client.delete("/api/v1/notifications/push/subscription/", {"endpoint": body["endpoint"]}, format="json")
        assert PushSubscription.objects.count() == 0

    def test_a_person_cannot_remove_someone_elses_subscription(self, api_client):
        from .models import PushSubscription

        school = SchoolFactory()
        me = UserFactory(school=school)
        other = UserFactory(school=school)
        PushSubscription.objects.create(user=other, endpoint="https://push.example/zzz", p256dh="k", auth="a")
        _login(api_client, me)
        api_client.delete("/api/v1/notifications/push/subscription/", {"endpoint": "https://push.example/zzz"}, format="json")
        assert PushSubscription.objects.count() == 1

    def test_key_endpoint_reports_whether_push_is_on(self, api_client, settings):
        school = SchoolFactory()
        me = UserFactory(school=school)
        _login(api_client, me)
        settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "", ""
        assert api_client.get("/api/v1/notifications/push/key/").data["enabled"] is False
        settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "pub", "priv"
        body = api_client.get("/api/v1/notifications/push/key/").data
        assert body["enabled"] is True and body["public_key"] == "pub"

    def test_push_requires_login(self, api_client):
        assert api_client.get("/api/v1/notifications/push/key/").status_code in (401, 403)
        assert api_client.post("/api/v1/notifications/push/subscription/", {}, format="json").status_code in (401, 403)

    def test_creating_a_notification_pushes_to_the_recipients_devices(self, settings, monkeypatch):
        from .models import PushSubscription

        settings.BACKGROUND_TASKS_ASYNC = False
        settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "pub", "priv"
        school = SchoolFactory()
        me = UserFactory(school=school)
        someone = UserFactory(school=school)
        PushSubscription.objects.create(user=me, endpoint="https://push.example/1", p256dh="k", auth="a")
        PushSubscription.objects.create(user=someone, endpoint="https://push.example/2", p256dh="k", auth="a")
        sent = []
        monkeypatch.setattr("apps.notifications.push._send_one", lambda sub, payload: sent.append((sub.endpoint, payload)))
        notify(recipient=me, category="announcement", title="Results are out", message="Term 1 results published")
        assert [endpoint for endpoint, _ in sent] == ["https://push.example/1"]
        assert "Results are out" in sent[0][1]

    def test_bulk_notifications_push_to_each_recipient(self, settings, monkeypatch):
        from .models import PushSubscription

        settings.BACKGROUND_TASKS_ASYNC = False
        settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "pub", "priv"
        school = SchoolFactory()
        users = [UserFactory(school=school) for _ in range(3)]
        for i, user in enumerate(users):
            PushSubscription.objects.create(user=user, endpoint=f"https://push.example/{i}", p256dh="k", auth="a")
        sent = []
        monkeypatch.setattr("apps.notifications.push._send_one", lambda sub, payload: sent.append(sub.endpoint))
        notify_bulk(recipients=users, category="announcement", title="Assembly", message="Tomorrow 8am")
        assert sorted(sent) == [f"https://push.example/{i}" for i in range(3)]

    def test_nothing_is_sent_when_push_is_not_configured(self, settings, monkeypatch):
        from .models import PushSubscription

        settings.BACKGROUND_TASKS_ASYNC = False
        settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "", ""
        school = SchoolFactory()
        me = UserFactory(school=school)
        PushSubscription.objects.create(user=me, endpoint="https://push.example/1", p256dh="k", auth="a")
        sent = []
        monkeypatch.setattr("apps.notifications.push._send_one", lambda sub, payload: sent.append(1))
        notify(recipient=me, category="x", title="t", message="m")
        assert sent == []

    def test_a_failing_device_does_not_stop_the_rest_or_the_notification(self, settings, monkeypatch):
        from .models import PushSubscription

        settings.BACKGROUND_TASKS_ASYNC = False
        settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "pub", "priv"
        school = SchoolFactory()
        me = UserFactory(school=school)
        for i in range(2):
            PushSubscription.objects.create(user=me, endpoint=f"https://push.example/{i}", p256dh="k", auth="a")
        calls = []

        def flaky(sub, payload):
            calls.append(sub.endpoint)
            if len(calls) == 1:
                raise RuntimeError("push service down")

        monkeypatch.setattr("apps.notifications.push._send_one", flaky)
        notification = notify(recipient=me, category="x", title="t", message="m")
        assert len(calls) == 2 and Notification.unscoped_objects.filter(pk=notification.pk).exists()
