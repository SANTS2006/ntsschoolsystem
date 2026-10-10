import base64
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.events.models import Event
from apps.notifications.models import Notification
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    DepartmentFactory,
    SchoolClassFactory,
    SchoolFactory,
    SectionFactory,
    StaffFactory,
    StudentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _png():
    return SimpleUploadedFile("e.png", _PNG, content_type="image/png")


def _student(school, klass, section=None):
    st = StudentFactory(school=school, current_class=klass, current_section=section, status="active")
    st.user = UserFactory(school=school)
    st.save(update_fields=["user"])
    return st


@pytest.fixture
def world(settings):
    settings.BACKGROUND_TASKS_ASYNC = False
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    admin = UserFactory(school=school)
    assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="principal"))
    c1, c2 = SchoolClassFactory(school=school, name="C1"), SchoolClassFactory(school=school, name="C2")
    a1, a2 = SectionFactory(school=school, school_class=c1, name="A"), SectionFactory(school=school, school_class=c1, name="B")
    s_a, s_b, s_c2 = _student(school, c1, a1), _student(school, c1, a2), _student(school, c2)
    dept = DepartmentFactory(school=school)
    teacher = StaffFactory(school=school, department=dept)
    outsider = _student(school, SchoolClassFactory(school=school, name="C3"))
    return dict(school=school, admin=admin, c1=c1, c2=c2, a1=a1, a2=a2, s_a=s_a, s_b=s_b, s_c2=s_c2, dept=dept, teacher=teacher, outsider=outsider)


def _create(api_client, **fields):
    start = timezone.now() + timedelta(days=3)
    body = {
        "title": "Sports day", "description": "d", "category": "sports", "location": "Field",
        "start_datetime": start.isoformat(), "end_datetime": (start + timedelta(hours=3)).isoformat(),
        "image": _png(), **fields,
    }
    return api_client.post("/api/v1/events/", body, format="multipart")


def test_classes_with_a_section_reach_only_that_section_and_the_rest_of_the_other_class(api_client, world):
    w = world
    _login(api_client, w["admin"])
    r = _create(api_client, audience_type="groups", audience_classes=[str(w["c1"].id), str(w["c2"].id)], audience_sections=[str(w["a1"].id)])
    assert r.status_code == 201, r.data
    assert api_client.post(f"/api/v1/events/{r.data['id']}/publish/").status_code == 200
    notified = set(Notification.unscoped_objects.filter(title="Sports day").values_list("recipient_id", flat=True))
    assert notified == {w["s_a"].user_id, w["s_c2"].user_id}  # section A of C1, and all of C2 — not section B, not C3


def test_departments_reach_their_staff_and_everybody_means_everybody(api_client, world):
    w = world
    _login(api_client, w["admin"])
    r = _create(api_client, audience_type="groups", audience_departments=[str(w["dept"].id)])
    api_client.post(f"/api/v1/events/{r.data['id']}/publish/")
    assert set(Notification.unscoped_objects.filter(title="Sports day").values_list("recipient_id", flat=True)) == {w["teacher"].user_id}
    r2 = _create(api_client, title="Open day", audience_type="all")
    api_client.post(f"/api/v1/events/{r2.data['id']}/publish/")
    everyone = Notification.unscoped_objects.filter(title="Open day").count()
    assert everyone >= 5


def test_specific_people_by_email_and_unknown_addresses_are_refused(api_client, world):
    w = world
    _login(api_client, w["admin"])
    bad = _create(api_client, audience_type="specific", audience_emails=f"{w['s_a'].user.email}, nobody@nowhere.test")
    assert bad.status_code == 400 and "nobody@nowhere.test" in str(bad.data)
    ok = _create(api_client, audience_type="specific", audience_emails=f"{w['s_a'].user.email}\n{w['s_b'].user.email}")
    assert ok.status_code == 201, ok.data
    api_client.post(f"/api/v1/events/{ok.data['id']}/publish/")
    assert set(Notification.unscoped_objects.filter(title="Sports day").values_list("recipient_id", flat=True)) == {w["s_a"].user_id, w["s_b"].user_id}


def test_a_section_needs_its_class(api_client, world):
    _login(api_client, world["admin"])
    r = _create(api_client, audience_type="groups", audience_classes=[str(world["c2"].id)], audience_sections=[str(world["a1"].id)])
    assert r.status_code == 400


def test_restricted_events_are_visible_only_to_their_audience_and_creator(api_client, world):
    w = world
    _login(api_client, w["admin"])
    r = _create(api_client, audience_type="specific", audience_users=[str(w["s_a"].user_id)], restricted_to_audience=True)
    eid = r.data["id"]
    api_client.post(f"/api/v1/events/{eid}/publish/")
    open_event = _create(api_client, title="Open", audience_type="all").data["id"]
    api_client.post(f"/api/v1/events/{open_event}/publish/")

    other_staff = UserFactory(school=w["school"])
    assign_role(user=other_staff, role=Role.unscoped_objects.get(school=w["school"], slug="school-administrator"))
    _login(api_client, other_staff)  # holds events.view, but isn't in the audience
    ids = {e["id"] for e in api_client.get("/api/v1/events/").data["results"]}
    assert open_event in ids and eid not in ids
    assert api_client.get(f"/api/v1/events/{eid}/").status_code == 404

    _login(api_client, w["s_a"].user)  # no module access at all, but in the audience
    ids = {e["id"] for e in api_client.get("/api/v1/events/").data["results"]}
    assert ids == {eid, open_event}  # both reached them (everybody + chosen)
    _login(api_client, w["outsider"].user)
    assert eid not in {e["id"] for e in api_client.get("/api/v1/events/").data["results"]}

    _login(api_client, w["admin"])
    assert eid in {e["id"] for e in api_client.get("/api/v1/events/").data["results"]}  # the creator still sees it


def test_audience_options_are_open_to_whoever_can_create_events_and_nobody_else(api_client, world):
    w = world
    _login(api_client, w["admin"])
    data = api_client.get("/api/v1/audience/options/").data
    assert {c["name"] for c in data["classes"]} >= {"C1", "C2"} and data["departments"] and data["roles"]
    assert api_client.get("/api/v1/audience/people/?search=" + w["s_a"].user.first_name).status_code == 200
    _login(api_client, w["s_a"].user)
    assert api_client.get("/api/v1/audience/options/").status_code == 403
