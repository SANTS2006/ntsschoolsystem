from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.academics import submissions
from apps.academics.models import AssessmentFile, AssessmentUploadReminder
from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.notifications.models import Notification
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AcademicYearFactory,
    AssessmentFactory,
    SchoolClassFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    StudentSubjectEnrollmentFactory,
    SubjectFactory,
    SubjectOfferingFactory,
    TermFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/academics"


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def world(settings):
    settings.BACKGROUND_TASKS_ASYNC = False
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    year = AcademicYearFactory(school=school)
    term = TermFactory(school=school, academic_year=year)
    teacher = StaffFactory(school=school)
    assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    offering = SubjectOfferingFactory(
        school=school, subject=SubjectFactory(school=school), academic_year=year, term=term,
        school_class=SchoolClassFactory(school=school), main_teacher=teacher,
    )
    assessment = AssessmentFactory(
        school=school, subject_offering=offering, weight=20, allow_file_uploads=True,
        upload_deadline=timezone.now() + timedelta(days=3),
    )
    student = StudentFactory(school=school, current_class=offering.school_class)
    student.user = UserFactory(school=school)
    student.save(update_fields=["user"])
    StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
    return {"school": school, "teacher": teacher, "offering": offering, "assessment": assessment, "student": student}


def _upload(api_client, assessment, name="report.pdf"):
    return api_client.post(
        f"{BASE}/my-assessment-files/",
        {"assessment": str(assessment.id), "file": SimpleUploadedFile(name, b"%PDF-1.4 test", content_type="application/pdf")},
        format="multipart",
    )


def test_student_can_upload_while_open_and_see_it(api_client, world):
    _login(api_client, world["student"].user)
    response = _upload(api_client, world["assessment"])
    assert response.status_code == 201, response.data
    ca = api_client.get(f"{BASE}/my-subjects/{world['offering'].id}/ca/").data
    row = ca["assessments"][0]
    assert row["upload_state"] == "open"
    assert len(row["my_files"]) == 1
    assert row["upload_deadline_text"]


def test_upload_refused_after_deadline_and_delete_too(api_client, world):
    _login(api_client, world["student"].user)
    created = _upload(api_client, world["assessment"]).data["file"]
    world["assessment"].upload_deadline = timezone.now() - timedelta(minutes=1)
    world["assessment"].save(update_fields=["upload_deadline"])
    late = _upload(api_client, world["assessment"])
    assert late.status_code == 403 and late.data["code"] == "UPLOADS_CLOSED"
    assert api_client.delete(f"{BASE}/my-assessment-files/{created['id']}/").status_code == 403
    assert AssessmentFile.unscoped_objects.count() == 1


def test_teacher_extending_deadline_reopens_uploads_and_notifies(api_client, world):
    assessment = world["assessment"]
    assessment.upload_deadline = timezone.now() - timedelta(hours=1)
    assessment.save(update_fields=["upload_deadline"])
    _login(api_client, world["student"].user)
    assert _upload(api_client, assessment).status_code == 403

    _login(api_client, world["teacher"].user)
    new_deadline = (timezone.now() + timedelta(days=2)).isoformat()
    response = api_client.patch(f"{BASE}/assessments/{assessment.id}/", {"upload_deadline": new_deadline}, format="json")
    assert response.status_code == 200, response.data
    assert response.data["upload_state"] == "open"
    assert Notification.unscoped_objects.filter(recipient=world["student"].user, title__startswith="New upload deadline").exists()

    _login(api_client, world["student"].user)
    assert _upload(api_client, assessment).status_code == 201


def test_uploads_off_and_file_limit(api_client, world):
    _login(api_client, world["student"].user)
    for _ in range(submissions.MAX_FILES_PER_STUDENT):
        assert _upload(api_client, world["assessment"]).status_code == 201
    assert _upload(api_client, world["assessment"]).data["code"] == "TOO_MANY_FILES"
    world["assessment"].allow_file_uploads = False
    world["assessment"].save(update_fields=["allow_file_uploads"])
    assert _upload(api_client, world["assessment"]).data["code"] == "UPLOADS_OFF"


def test_unenrolled_student_cannot_upload(api_client, world):
    other = StudentFactory(school=world["school"], current_class=world["offering"].school_class)
    other.user = UserFactory(school=world["school"])
    other.save(update_fields=["user"])
    _login(api_client, other.user)
    assert _upload(api_client, world["assessment"]).status_code == 404


def test_teacher_sees_submissions_and_other_teacher_cannot(api_client, world):
    _login(api_client, world["student"].user)
    _upload(api_client, world["assessment"])
    _login(api_client, world["teacher"].user)
    data = api_client.get(f"{BASE}/assessments/{world['assessment'].id}/submissions/").data["submissions"]
    assert data["submitted_count"] == 1 and data["rows"][0]["files"][0]["name"] == "report.pdf"

    stranger = StaffFactory(school=world["school"])
    assign_role(user=stranger.user, role=Role.unscoped_objects.get(school=world["school"], slug="teacher"))
    _login(api_client, stranger.user)
    assert api_client.get(f"{BASE}/assessments/{world['assessment'].id}/submissions/").status_code in (403, 404)


def test_reminders_go_once_per_window_only_to_students_without_files(world):
    assessment = world["assessment"]
    assessment.upload_deadline = timezone.now() + timedelta(hours=5)
    assessment.save(update_fields=["upload_deadline"])
    assert submissions.send_due_reminders() == 1
    assert submissions.send_due_reminders() == 0  # same windows, already sent
    assert AssessmentUploadReminder.unscoped_objects.filter(assessment=assessment).count() == 3  # 48h, 24h, 6h all due at once

    # A student who has handed something in is left alone when the next window arrives.
    AssessmentFile.unscoped_objects.create(
        school=world["school"], assessment=assessment, student=world["student"],
        file=SimpleUploadedFile("a.pdf", b"x"), original_name="a.pdf", size_bytes=1,
    )
    assessment.upload_deadline = timezone.now() + timedelta(minutes=30)
    assessment.save(update_fields=["upload_deadline"])
    assert submissions.send_due_reminders() == 0


def test_no_reminders_once_closed(world):
    assessment = world["assessment"]
    assessment.upload_deadline = timezone.now() - timedelta(minutes=1)
    assessment.save(update_fields=["upload_deadline"])
    assert submissions.send_due_reminders() == 0
