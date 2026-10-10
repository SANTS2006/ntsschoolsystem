import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.notifications.models import Notification
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AnnouncementFactory,
    SchoolClassFactory,
    SchoolFactory,
    StudentFactory,
    UserFactory,
)

from .models import Announcement
from .services import publish_announcement, resolve_recipients

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _image(name="banner.jpg"):
    return SimpleUploadedFile(name, b"fake jpg bytes", content_type="image/jpeg")


def _principal():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    return school, principal


class TestAnnouncementPermissions:
    def test_principal_can_create_announcement(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/communications/announcements/",
            {"title": "Sports Day", "body": "Sports day is next Friday.", "target_type": "school", "image": _image()},
            format="multipart",
        )
        assert response.status_code == 201
        assert response.data["image"]

    def test_image_is_required_to_create_an_announcement(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/communications/announcements/",
            {"title": "No picture", "body": "Body", "target_type": "school"},
            format="json",
        )
        assert response.status_code == 400
        assert "image" in str(response.data)

    def test_editing_an_announcement_does_not_need_the_image_again(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)
        created = api_client.post(
            "/api/v1/communications/announcements/",
            {"title": "Sports Day", "body": "Body", "target_type": "school", "image": _image()},
            format="multipart",
        )
        response = api_client.patch(
            f"/api/v1/communications/announcements/{created.data['id']}/", {"title": "Sports Day 2"}, format="json"
        )
        assert response.status_code == 200
        assert response.data["image"]

    def test_a_very_long_image_filename_is_accepted(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)
        response = api_client.post(
            "/api/v1/communications/announcements/",
            {"title": "Long name", "body": "Body", "target_type": "school", "image": _image("x" * 150 + ".jpg")},
            format="multipart",
        )
        assert response.status_code == 201, response.data

    def test_teacher_can_create_announcement(self, api_client):
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/communications/announcements/",
            {"title": "Homework reminder", "body": "Submit by Friday.", "target_type": "school", "image": _image()},
            format="multipart",
        )
        assert response.status_code == 201

    def test_a_user_without_the_communications_permission_cannot_create_announcement(self, api_client):
        school, _ = _principal()
        # the student role holds no communications.* permission (the accountant role does)
        student = UserFactory(school=school)
        assign_role(user=student, role=Role.unscoped_objects.get(school=school, slug="student"))
        _login(api_client, student)

        response = api_client.post(
            "/api/v1/communications/announcements/",
            {"title": "Fee reminder", "body": "Pay your fees.", "target_type": "school"},
            format="json",
        )
        assert response.status_code == 403


class TestAnnouncementCrossSchoolValidation:
    def test_cannot_target_another_schools_class(self, api_client):
        school, principal = _principal()
        other_school = SchoolFactory()
        foreign_class = SchoolClassFactory(school=other_school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/communications/announcements/",
            {
                "title": "Class notice",
                "body": "Body",
                "target_type": "class",
                "target_class": str(foreign_class.id),
            },
            format="json",
        )
        assert response.status_code == 400


class TestPublishAnnouncement:
    def test_publish_school_target_notifies_all_active_users(self, api_client):
        school, principal = _principal()
        other_user = UserFactory(school=school)
        announcement = AnnouncementFactory(school=school, target_type=Announcement.TargetType.SCHOOL)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/communications/announcements/{announcement.id}/publish/")

        assert response.status_code == 200
        recipient_ids = set(
            Notification.unscoped_objects.filter(category="announcement").values_list("recipient_id", flat=True)
        )
        assert principal.id in recipient_ids
        assert other_user.id in recipient_ids

    def test_publish_students_target_only_notifies_enrolled_students(self, api_client):
        school, principal = _principal()
        school_class = SchoolClassFactory(school=school)
        member = StudentFactory(school=school, current_class=school_class)
        member.user = UserFactory(school=school)
        member.save(update_fields=["user"])
        non_member = StudentFactory(school=school)
        non_member.user = UserFactory(school=school)
        non_member.save(update_fields=["user"])

        announcement = AnnouncementFactory(
            school=school, target_type=Announcement.TargetType.CLASS, target_class=school_class
        )
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/communications/announcements/{announcement.id}/publish/")

        assert response.status_code == 200
        recipient_ids = set(
            Notification.unscoped_objects.filter(category="announcement").values_list("recipient_id", flat=True)
        )
        assert member.user_id in recipient_ids
        assert non_member.user_id not in recipient_ids

    def test_publish_sets_published_at(self):
        school = SchoolFactory()
        announcement = AnnouncementFactory(school=school, target_type=Announcement.TargetType.SCHOOL)
        assert announcement.published_at is None

        publish_announcement(announcement)

        announcement.refresh_from_db()
        assert announcement.published_at is not None


class TestPublishWithEmail:
    def test_published_at_is_saved_before_the_emails_go_out(self, settings, monkeypatch, django_capture_on_commit_callbacks):
        """Regression: emailing a whole school inline outlasted the request time limit and left the
        announcement a draft with an error shown. It is now marked published first and emailed after."""
        settings.BACKGROUND_TASKS_ASYNC = False
        school = SchoolFactory()
        UserFactory(school=school)
        UserFactory(school=school)
        announcement = AnnouncementFactory(school=school, send_email=True)
        seen_published_at = []

        def fake_send_email(**kwargs):
            seen_published_at.append(Announcement.unscoped_objects.get(pk=announcement.pk).published_at)
            return True

        monkeypatch.setattr("apps.common.email.send_email", fake_send_email)

        with django_capture_on_commit_callbacks(execute=True):
            count = publish_announcement(announcement)

        assert count == 2
        assert len(seen_published_at) == 2
        assert all(value is not None for value in seen_published_at)

    def test_a_failing_email_provider_cannot_undo_the_publish(self, settings, monkeypatch, django_capture_on_commit_callbacks):
        settings.BACKGROUND_TASKS_ASYNC = True  # exercised through the thread path; failure is swallowed + logged
        school = SchoolFactory()
        UserFactory(school=school)
        announcement = AnnouncementFactory(school=school, send_email=True)

        def boom(**kwargs):
            raise RuntimeError("Brevo is down")

        monkeypatch.setattr("apps.common.email.send_email", boom)
        publish_announcement(announcement)  # on_commit never fires inside the test transaction

        announcement.refresh_from_db()
        assert announcement.published_at is not None
        assert Notification.unscoped_objects.filter(category="announcement").exists()

    def test_publishing_twice_is_rejected(self, api_client):
        school, principal = _principal()
        announcement = AnnouncementFactory(school=school)
        _login(api_client, principal)

        assert api_client.post(f"/api/v1/communications/announcements/{announcement.id}/publish/").status_code == 200
        second = api_client.post(f"/api/v1/communications/announcements/{announcement.id}/publish/")
        assert second.status_code == 400
        assert second.data["code"] == "ALREADY_PUBLISHED"


class TestOnlyTheCreatorManagesAnAnnouncement:
    def test_creator_can_edit_publish_and_delete(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)
        created = api_client.post(
            "/api/v1/communications/announcements/",
            {"title": "Mine", "body": "Body", "target_type": "school", "image": _image()},
            format="multipart",
        )
        assert created.status_code == 201, created.data
        assert created.data["is_mine"] is True
        announcement_id = created.data["id"]

        assert api_client.patch(
            f"/api/v1/communications/announcements/{announcement_id}/", {"title": "Mine 2"}, format="json"
        ).status_code == 200
        assert api_client.post(f"/api/v1/communications/announcements/{announcement_id}/publish/").status_code == 200
        assert api_client.delete(f"/api/v1/communications/announcements/{announcement_id}/").status_code == 204

    def test_someone_else_cannot_edit_publish_or_delete_it(self, api_client):
        school, principal = _principal()
        colleague = UserFactory(school=school)
        assign_role(user=colleague, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
        announcement = AnnouncementFactory(school=school, created_by=principal)
        _login(api_client, colleague)

        url = f"/api/v1/communications/announcements/{announcement.id}/"
        assert api_client.get(url).data["is_mine"] is False
        assert api_client.patch(url, {"title": "Hijacked"}, format="json").status_code == 403
        assert api_client.post(url + "publish/").status_code == 403
        assert api_client.delete(url).status_code == 403
        announcement.refresh_from_db()
        assert announcement.title != "Hijacked" and announcement.published_at is None


class TestResolveRecipients:
    def test_resolve_recipients_works_outside_request_context(self):
        """resolve_recipients must use unscoped_objects — it can be called from a
        management command or test with no tenant contextvar set at all."""
        school = SchoolFactory()
        UserFactory(school=school)
        announcement = AnnouncementFactory(school=school, target_type=Announcement.TargetType.SCHOOL)

        recipients = resolve_recipients(announcement)

        assert len(recipients) >= 1


class TestAnnouncementTenantIsolation:
    def test_cannot_list_another_schools_announcements(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        AnnouncementFactory(school=school_b)
        announcement_a = AnnouncementFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/communications/announcements/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(announcement_a.id) in ids_seen
        assert len(ids_seen) == 1
