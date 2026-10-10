from datetime import timedelta

import pytest
from django.utils import timezone

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.live_sessions.models import LiveSession
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AcademicYearFactory,
    SchoolClassFactory,
    SchoolFactory,
    StaffFactory,
    SubjectFactory,
    SubjectOfferingFactory,
    TermFactory,
)

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def world():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    year = AcademicYearFactory(school=school)
    term = TermFactory(school=school, academic_year=year)
    maths, english = SubjectFactory(school=school, name="Maths"), SubjectFactory(school=school, name="English")
    grade1, grade2 = SchoolClassFactory(school=school, name="Grade 1"), SchoolClassFactory(school=school, name="Grade 2")
    teacher_a, teacher_b = StaffFactory(school=school), StaffFactory(school=school)
    for t in (teacher_a, teacher_b):
        assign_role(user=t.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    # A teaches Maths in Grade 1; B teaches English in Grade 2
    SubjectOfferingFactory(school=school, subject=maths, academic_year=year, term=term, school_class=grade1, main_teacher=teacher_a)
    SubjectOfferingFactory(school=school, subject=english, academic_year=year, term=term, school_class=grade2, main_teacher=teacher_b)
    mine = LiveSession.objects.create(
        school=school, title="Mine", subject=maths, school_class=grade1, teacher=teacher_a, scheduled_start=timezone.now() + timedelta(days=1)
    )
    theirs = LiveSession.objects.create(
        school=school, title="Theirs", subject=english, school_class=grade2, teacher=teacher_b, scheduled_start=timezone.now() + timedelta(days=1)
    )
    return dict(school=school, a=teacher_a, b=teacher_b, maths=maths, english=english, grade1=grade1, grade2=grade2, mine=mine, theirs=theirs)


def test_a_teacher_sees_only_their_own_live_sessions(api_client, world):
    _login(api_client, world["a"].user)
    titles = {s["title"] for s in api_client.get("/api/v1/live-sessions/").data["results"]}
    assert titles == {"Mine"}
    assert api_client.get(f"/api/v1/live-sessions/{world['theirs'].id}/").status_code == 404
    assert api_client.post(f"/api/v1/live-sessions/{world['theirs'].id}/remind/").status_code == 404


def test_a_teacher_can_only_schedule_for_subjects_and_classes_they_teach(api_client, world):
    _login(api_client, world["a"].user)
    body = {"title": "New", "subject": str(world["maths"].id), "school_class": str(world["grade1"].id), "scheduled_start": (timezone.now() + timedelta(days=2)).isoformat(), "target_type": "class_section"}
    assert api_client.post("/api/v1/live-sessions/", body, format="json").status_code == 201
    other_subject = {**body, "subject": str(world["english"].id)}
    assert api_client.post("/api/v1/live-sessions/", other_subject, format="json").status_code == 400
    other_class = {**body, "school_class": str(world["grade2"].id)}
    assert api_client.post("/api/v1/live-sessions/", other_class, format="json").status_code == 400


def test_form_options_list_only_the_teachers_own_subject_and_class_pairs(api_client, world):
    _login(api_client, world["a"].user)
    data = api_client.get("/api/v1/live-sessions/options/").data
    assert data["restricted"] is True
    assert data["pairs"] == [{"subject": str(world["maths"].id), "school_class": str(world["grade1"].id)}]
