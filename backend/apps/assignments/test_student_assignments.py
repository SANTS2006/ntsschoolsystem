from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.assignments.models import Assignment
from apps.authorization.models import Role, RolePermission
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    SchoolClassFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    SubjectFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def world():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    klass, other_class = SchoolClassFactory(school=school), SchoolClassFactory(school=school)
    subject = SubjectFactory(school=school)
    teacher, other_teacher = StaffFactory(school=school), StaffFactory(school=school)
    for t in (teacher, other_teacher):
        assign_role(user=t.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    mine = Assignment.objects.create(school=school, title="Mine", school_class=klass, subject=subject, teacher=teacher, due_date=timezone.now() + timedelta(days=2))
    theirs = Assignment.objects.create(school=school, title="Theirs", school_class=klass, subject=subject, teacher=other_teacher, due_date=timezone.now() + timedelta(days=2))
    elsewhere = Assignment.objects.create(school=school, title="Other class", school_class=other_class, subject=subject, teacher=teacher, due_date=timezone.now() + timedelta(days=2))
    student = StudentFactory(school=school, current_class=klass, status="active")
    student.user = UserFactory(school=school)
    student.save(update_fields=["user"])
    assign_role(user=student.user, role=Role.unscoped_objects.get(school=school, slug="student"))
    return dict(school=school, teacher=teacher, student=student, mine=mine, theirs=theirs, elsewhere=elsewhere)


def _file():
    return SimpleUploadedFile("work.pdf", b"%PDF-1.4 x", content_type="application/pdf")


def test_student_sees_their_classs_assignments_and_submits_one(api_client, world):
    _login(api_client, world["student"].user)
    rows = api_client.get("/api/v1/my-assignments/").data["assignments"]
    assert {r["title"] for r in rows} == {"Mine", "Theirs"} and all(r["my_submission"] is None for r in rows)
    r = api_client.post(f"/api/v1/assignments/{world['mine'].id}/submit/", {"attachment": _file()}, format="multipart")
    assert r.status_code == 200, r.data
    mine = next(x for x in api_client.get("/api/v1/my-assignments/").data["assignments"] if x["title"] == "Mine")
    assert mine["my_submission"]["status"] == "submitted"


def test_student_cannot_submit_to_another_classs_assignment(api_client, world):
    _login(api_client, world["student"].user)
    r = api_client.post(f"/api/v1/assignments/{world['elsewhere'].id}/submit/", {"attachment": _file()}, format="multipart")
    assert r.status_code == 404


def test_marked_work_cannot_be_resubmitted(api_client, world):
    _login(api_client, world["student"].user)
    api_client.post(f"/api/v1/assignments/{world['mine'].id}/submit/", {"attachment": _file()}, format="multipart")
    from apps.assignments.models import AssignmentSubmission

    sub = AssignmentSubmission.unscoped_objects.get(assignment=world["mine"])
    sub.status = "graded"
    sub.save(update_fields=["status"])
    r = api_client.post(f"/api/v1/assignments/{world['mine'].id}/submit/", {"attachment": _file()}, format="multipart")
    assert r.status_code == 400 and r.data["code"] == "ALREADY_GRADED"


def test_the_student_role_can_lose_the_permission_and_with_it_the_page(api_client, world):
    role = Role.unscoped_objects.get(school=world["school"], slug="student")
    RolePermission.unscoped_objects.filter(role=role, permission__code="assignments.submit").delete()
    _login(api_client, world["student"].user)
    assert api_client.get("/api/v1/my-assignments/").status_code == 403


def test_a_teacher_sees_only_their_own_assignments(api_client, world):
    _login(api_client, world["teacher"].user)
    titles = {a["title"] for a in api_client.get("/api/v1/assignments/").data["results"]}
    assert titles == {"Mine", "Other class"}
