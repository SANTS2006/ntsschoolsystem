from datetime import timedelta

import pytest
from django.utils import timezone

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.notifications.models import Notification
from apps.parents.models import StudentGuardian
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    GuardianFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    UserFactory,
)

from .models import Meeting, MeetingInvitee

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fakes(monkeypatch, settings):
    """Daily.co and Brevo are external services — replaced by recorders. Emails are sent inline
    (not in a thread) so the tests can assert on them."""
    settings.BACKGROUND_TASKS_ASYNC = False
    sent = []
    fail_for = set()

    def fake_send_email(*, to_email, to_name, subject, html_content, school=None, branded=True):
        if to_email in fail_for:
            return False
        sent.append({"to": to_email, "subject": subject, "html": html_content, "school": school})
        return True

    monkeypatch.setattr("apps.meetings.services.send_email", fake_send_email)
    monkeypatch.setattr(
        "apps.meetings.services.create_room",
        lambda name, expiry_minutes=180: ("https://example.daily.co/room-1", name),
    )
    return type("Fakes", (), {"sent": sent, "fail_for": fail_for})


@pytest.fixture
def fakes(_fakes):
    return _fakes


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _world():
    """A school with a principal, 2 staff, 2 active students (each with a parent), one of them
    with a portal account, and a withdrawn student whose parent must NOT be in "all parents"."""
    seed_permission_catalog()
    school = SchoolFactory(name="Greenfield Academy")
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school, first_name="Pat", last_name="Principal")
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    staff = [StaffFactory(school=school) for _ in range(2)]
    students, parents = [], []
    for i in range(2):
        student = StudentFactory(
            school=school, status="active", user=UserFactory(school=school) if i == 0 else None
        )
        parent = GuardianFactory(school=school, email=f"parent{i}@example.test")
        StudentGuardian.objects.create(school=school, student=student, guardian=parent)
        students.append(student)
        parents.append(parent)
    gone = StudentFactory(school=school, status="withdrawn")
    gone_parent = GuardianFactory(school=school, email="gone@example.test")
    StudentGuardian.objects.create(school=school, student=gone, guardian=gone_parent)
    return school, principal, staff, students, parents, gone_parent


def _create(api_client, **overrides):
    payload = {
        "title": "Term planning",
        "agenda": "Budget & timetable",
        "scheduled_start": (timezone.now() + timedelta(days=1)).isoformat(),
        "duration_minutes": 45,
        **overrides,
    }
    return api_client.post("/api/v1/meetings/", payload, format="json")


class TestCreateAndAudience:
    def test_staff_only(self, api_client, fakes):
        school, principal, staff, _, _, _ = _world()
        _login(api_client, principal)
        response = _create(api_client, include_all_staff=True)

        assert response.status_code == 201, response.data
        assert {i["kind"] for i in response.data["meeting"]["invitees"]} == {"staff"}
        assert {e["to"] for e in fakes.sent} == {s.user.email for s in staff}

    def test_parents_only_excludes_parents_of_withdrawn_students(self, api_client, fakes):
        _, principal, _, _, parents, gone_parent = _world()
        _login(api_client, principal)
        response = _create(api_client, include_all_parents=True)

        assert response.status_code == 201, response.data
        assert {e["to"] for e in fakes.sent} == {p.email for p in parents}
        assert gone_parent.email not in {e["to"] for e in fakes.sent}

    def test_students_only(self, api_client, fakes):
        _, principal, _, students, _, _ = _world()
        _login(api_client, principal)
        response = _create(api_client, include_all_students=True)

        assert response.status_code == 201, response.data
        assert response.data["meeting"]["invitee_counts"]["total"] == 2
        # one student has no portal account => no email address to send to
        assert response.data["meeting"]["invitee_counts"]["no_email"] == 1
        assert [e["to"] for e in fakes.sent] == [students[0].user.email]

    def test_everybody(self, api_client, fakes):
        _, principal, staff, students, parents, _ = _world()
        _login(api_client, principal)
        response = _create(
            api_client, include_all_staff=True, include_all_parents=True, include_all_students=True
        )

        assert response.status_code == 201, response.data
        assert response.data["meeting"]["audience"].startswith("Everybody")
        assert len(fakes.sent) == len(staff) + len(parents) + 1  # +1 student with an account

    def test_some_staff_and_parents(self, api_client, fakes):
        _, principal, staff, _, parents, _ = _world()
        _login(api_client, principal)
        response = _create(
            api_client, staff_ids=[str(staff[0].id)], guardian_ids=[str(parents[1].id)]
        )

        assert response.status_code == 201, response.data
        assert {e["to"] for e in fakes.sent} == {staff[0].user.email, parents[1].email}
        assert response.data["meeting"]["audience"] == "Selected staff, selected parents"

    def test_person_in_two_groups_is_invited_once(self, api_client, fakes):
        school, principal, staff, _, _, _ = _world()
        dual = GuardianFactory(school=school, email=staff[0].user.email)
        _login(api_client, principal)
        response = _create(api_client, staff_ids=[str(staff[0].id)], guardian_ids=[str(dual.id)])

        assert response.status_code == 201, response.data
        assert len(response.data["meeting"]["invitees"]) == 1
        assert len(fakes.sent) == 1

    def test_cannot_invite_another_schools_people(self, api_client, fakes):
        _, principal, staff, _, _, _ = _world()
        outsider = StaffFactory(school=SchoolFactory())
        _login(api_client, principal)
        response = _create(api_client, staff_ids=[str(outsider.id), str(staff[0].id)])

        assert response.status_code == 201, response.data
        assert {e["to"] for e in fakes.sent} == {staff[0].user.email}

    def test_needs_an_audience(self, api_client, fakes):
        _, principal, _, _, _, _ = _world()
        _login(api_client, principal)
        response = _create(api_client)
        assert response.status_code == 400
        assert Meeting.unscoped_objects.count() == 0

    def test_start_in_the_past_rejected(self, api_client, fakes):
        _, principal, _, _, _, _ = _world()
        _login(api_client, principal)
        response = _create(
            api_client, include_all_staff=True, scheduled_start=(timezone.now() - timedelta(hours=2)).isoformat()
        )
        assert response.status_code == 400

    def test_teacher_cannot_create(self, api_client, fakes):
        school, _, _, _, _, _ = _world()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)
        assert _create(api_client, include_all_staff=True).status_code == 403

    def test_no_meeting_when_video_not_configured(self, api_client, fakes, monkeypatch):
        _, principal, _, _, _, _ = _world()
        monkeypatch.setattr("apps.meetings.services.create_room", lambda name, expiry_minutes=180: None)
        _login(api_client, principal)
        response = _create(api_client, include_all_staff=True)

        assert response.status_code == 503
        assert response.data["code"] == "FEATURE_NOT_CONFIGURED"
        assert Meeting.unscoped_objects.count() == 0
        assert fakes.sent == []

    def test_preview_counts(self, api_client, fakes):
        _, principal, _, _, _, _ = _world()
        _login(api_client, principal)
        response = api_client.post(
            "/api/v1/meetings/preview/",
            {"include_all_staff": True, "include_all_students": True}, format="json",
        )
        assert response.status_code == 200
        assert response.data["by_kind"] == {"staff": 2, "parent": 0, "student": 2}
        assert response.data["without_email"] == 1
        assert fakes.sent == []


class TestInvitationEmail:
    def test_email_carries_school_and_meeting_info_and_join_link(self, api_client, fakes):
        _, principal, staff, _, _, _ = _world()
        _login(api_client, principal)
        _create(api_client, include_all_staff=True, title="Term planning", agenda="Budget & timetable")

        email = fakes.sent[0]
        assert email["subject"] == "Meeting invitation: Term planning"
        assert email["school"].name == "Greenfield Academy"
        html = email["html"]
        assert "Greenfield Academy" in html
        assert "Term planning" in html
        assert "Budget &amp; timetable" in html  # agenda, HTML-escaped
        assert "Pat Principal" in html  # who called it
        assert "45 minutes" in html
        assert "https://example.daily.co/room-1" in html  # direct join link

    def test_user_text_is_escaped(self, api_client, fakes):
        _, principal, _, _, _, _ = _world()
        _login(api_client, principal)
        _create(api_client, include_all_staff=True, title="<script>x</script>")
        assert "<script>x</script>" not in fakes.sent[0]["html"]

    def test_invitees_with_accounts_get_an_in_app_notice(self, api_client, fakes):
        _, principal, staff, _, _, _ = _world()
        _login(api_client, principal)
        _create(api_client, include_all_staff=True)
        assert Notification.unscoped_objects.filter(category="meeting", recipient=staff[0].user).count() == 1

    def test_resend_retries_only_failures(self, api_client, fakes):
        _, principal, staff, _, _, _ = _world()
        fakes.fail_for.add(staff[0].user.email)
        _login(api_client, principal)
        meeting_id = _create(api_client, include_all_staff=True).data["meeting"]["id"]
        assert len(fakes.sent) == 1
        failed = MeetingInvitee.unscoped_objects.get(meeting_id=meeting_id, email=staff[0].user.email)
        assert failed.email_status == "failed"

        fakes.fail_for.clear()
        assert api_client.post(f"/api/v1/meetings/{meeting_id}/resend/").status_code == 200

        assert [e["to"] for e in fakes.sent].count(staff[1].user.email) == 1  # not re-sent
        assert [e["to"] for e in fakes.sent].count(staff[0].user.email) == 1  # retried
        failed.refresh_from_db()
        assert failed.email_status == "sent"
        # the in-app notice from the first pass isn't duplicated by the retry
        assert Notification.unscoped_objects.filter(category="meeting", recipient=staff[0].user).count() == 1


class TestLifecycle:
    def test_start_end_and_invalid_transitions(self, api_client, fakes):
        _, principal, _, _, _, _ = _world()
        _login(api_client, principal)
        meeting_id = _create(api_client, include_all_staff=True).data["meeting"]["id"]

        assert api_client.post(f"/api/v1/meetings/{meeting_id}/end/").status_code == 400
        assert api_client.post(f"/api/v1/meetings/{meeting_id}/start/").data["meeting"]["status"] == "live"
        assert api_client.post(f"/api/v1/meetings/{meeting_id}/start/").status_code == 400
        assert api_client.post(f"/api/v1/meetings/{meeting_id}/end/").data["meeting"]["status"] == "ended"

    def test_cancel_notifies_only_those_already_emailed(self, api_client, fakes):
        _, principal, staff, _, _, _ = _world()
        fakes.fail_for.add(staff[0].user.email)
        _login(api_client, principal)
        meeting_id = _create(api_client, include_all_staff=True).data["meeting"]["id"]
        fakes.sent.clear()

        response = api_client.post(f"/api/v1/meetings/{meeting_id}/cancel/")

        assert response.status_code == 200
        assert response.data["meeting"]["status"] == "cancelled"
        assert [e["to"] for e in fakes.sent] == [staff[1].user.email]
        assert fakes.sent[0]["subject"].startswith("Meeting cancelled")
        assert api_client.post(f"/api/v1/meetings/{meeting_id}/resend/").status_code == 400


class TestInviteeAccess:
    def test_my_meetings_and_join_only_for_invitees(self, api_client, fakes):
        school, principal, staff, _, _, _ = _world()
        _login(api_client, principal)
        meeting_id = _create(api_client, staff_ids=[str(staff[0].id)]).data["meeting"]["id"]
        api_client.logout()

        _login(api_client, staff[0].user)
        mine = api_client.get("/api/v1/meetings/my/")
        assert [m["id"] for m in mine.data["meetings"]] == [meeting_id]
        joined = api_client.get(f"/api/v1/meetings/{meeting_id}/join/")
        assert joined.status_code == 200
        assert joined.data["room_url"] == "https://example.daily.co/room-1"
        api_client.logout()

        _login(api_client, staff[1].user)  # staff, but not invited
        assert api_client.get("/api/v1/meetings/my/").data["meetings"] == []
        assert api_client.get(f"/api/v1/meetings/{meeting_id}/join/").status_code == 403

    def test_list_is_tenant_scoped(self, api_client, fakes):
        _, principal, _, _, _, _ = _world()
        _login(api_client, principal)
        _create(api_client, include_all_staff=True)
        other_school = SchoolFactory()
        Meeting.unscoped_objects.create(
            school=other_school, title="Elsewhere", scheduled_start=timezone.now() + timedelta(days=1)
        )

        response = api_client.get("/api/v1/meetings/")
        assert [m["title"] for m in response.data["results"]] == ["Term planning"]
