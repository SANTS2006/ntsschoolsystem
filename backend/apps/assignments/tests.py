from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.notifications.models import Notification
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AssignmentFactory,
    AssignmentSubmissionFactory,
    SchoolClassFactory,
    SchoolFactory,
    SectionFactory,
    StaffFactory,
    StudentFactory,
    SubjectFactory,
    UserFactory,
)

from .models import AssignmentSubmission

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _principal():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    return school, principal


def _teacher(school):
    teacher = StaffFactory(school=school)
    assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return teacher


def _enrolled_student(school, school_class):
    student = StudentFactory(school=school, current_class=school_class)
    student.user = UserFactory(school=school)
    student.save(update_fields=["user"])
    return student


class TestAssignmentPermissions:
    def test_teacher_can_create_assignment(self, api_client):
        school, _ = _principal()
        teacher = _teacher(school)
        school_class = SchoolClassFactory(school=school)
        subject = SubjectFactory(school=school)
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/assignments/",
            {
                "title": "Algebra homework",
                "school_class": str(school_class.id),
                "subject": str(subject.id),
                "due_date": "2026-03-01T23:59:00Z",
                "max_score": "50.00",
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["teacher"] == teacher.id

    def test_accountant_cannot_create_assignment(self, api_client):
        school, _ = _principal()
        accountant = UserFactory(school=school)
        assign_role(user=accountant, role=Role.unscoped_objects.get(school=school, slug="accountant"))
        school_class = SchoolClassFactory(school=school)
        subject = SubjectFactory(school=school)
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/assignments/",
            {
                "title": "x",
                "school_class": str(school_class.id),
                "subject": str(subject.id),
                "due_date": "2026-03-01T23:59:00Z",
            },
            format="json",
        )
        assert response.status_code == 403


class TestAssignmentValidation:
    def test_cannot_reference_another_schools_class(self, api_client):
        school, _ = _principal()
        teacher = _teacher(school)
        other_school = SchoolFactory()
        foreign_class = SchoolClassFactory(school=other_school)
        subject = SubjectFactory(school=school)
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/assignments/",
            {
                "title": "x",
                "school_class": str(foreign_class.id),
                "subject": str(subject.id),
                "due_date": "2026-03-01T23:59:00Z",
            },
            format="json",
        )
        assert response.status_code == 400

    def test_section_must_belong_to_selected_class(self, api_client):
        school, _ = _principal()
        teacher = _teacher(school)
        school_class = SchoolClassFactory(school=school)
        other_class = SchoolClassFactory(school=school)
        section = SectionFactory(school=school, school_class=other_class)
        subject = SubjectFactory(school=school)
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/assignments/",
            {
                "title": "x",
                "school_class": str(school_class.id),
                "section": str(section.id),
                "subject": str(subject.id),
                "due_date": "2026-03-01T23:59:00Z",
            },
            format="json",
        )
        assert response.status_code == 400


class TestMyAssignments:
    def test_student_sees_only_own_class_assignments(self, api_client):
        school, _ = _principal()
        school_class = SchoolClassFactory(school=school)
        student = _enrolled_student(school, school_class)
        AssignmentFactory(school=school, school_class=school_class)
        AssignmentFactory(school=school)  # a different class

        _login(api_client, student.user)
        response = api_client.get("/api/v1/my-assignments/")

        assert response.status_code == 200
        assert len(response.data["assignments"]) == 1


class TestSubmitAssignment:
    def test_student_can_submit_before_due_date(self, api_client):
        school, _ = _principal()
        school_class = SchoolClassFactory(school=school)
        student = _enrolled_student(school, school_class)
        assignment = AssignmentFactory(
            school=school, school_class=school_class, due_date=timezone.now() + timedelta(days=1)
        )
        _login(api_client, student.user)

        file = SimpleUploadedFile("homework.pdf", b"content", content_type="application/pdf")
        response = api_client.post(
            f"/api/v1/assignments/{assignment.id}/submit/", {"attachment": file}, format="multipart"
        )

        assert response.status_code == 200
        submission = AssignmentSubmission.unscoped_objects.get(assignment=assignment, student=student)
        assert submission.status == AssignmentSubmission.Status.SUBMITTED

    def test_submission_after_due_date_is_marked_late(self, api_client):
        school, _ = _principal()
        school_class = SchoolClassFactory(school=school)
        student = _enrolled_student(school, school_class)
        assignment = AssignmentFactory(
            school=school, school_class=school_class, due_date=timezone.now() - timedelta(days=1)
        )
        _login(api_client, student.user)

        file = SimpleUploadedFile("homework.pdf", b"content", content_type="application/pdf")
        response = api_client.post(
            f"/api/v1/assignments/{assignment.id}/submit/", {"attachment": file}, format="multipart"
        )

        assert response.status_code == 200
        submission = AssignmentSubmission.unscoped_objects.get(assignment=assignment, student=student)
        assert submission.status == AssignmentSubmission.Status.LATE

    def test_non_member_student_cannot_submit(self, api_client):
        school, _ = _principal()
        school_class = SchoolClassFactory(school=school)
        other_class = SchoolClassFactory(school=school)
        student = _enrolled_student(school, other_class)
        assignment = AssignmentFactory(school=school, school_class=school_class)
        _login(api_client, student.user)

        file = SimpleUploadedFile("homework.pdf", b"content", content_type="application/pdf")
        response = api_client.post(
            f"/api/v1/assignments/{assignment.id}/submit/", {"attachment": file}, format="multipart"
        )

        assert response.status_code == 400

    def test_rejects_disallowed_file_extension(self, api_client):
        school, _ = _principal()
        school_class = SchoolClassFactory(school=school)
        student = _enrolled_student(school, school_class)
        assignment = AssignmentFactory(school=school, school_class=school_class)
        _login(api_client, student.user)

        file = SimpleUploadedFile("virus.exe", b"content", content_type="application/octet-stream")
        response = api_client.post(
            f"/api/v1/assignments/{assignment.id}/submit/", {"attachment": file}, format="multipart"
        )

        assert response.status_code == 400
        # Regression: django.core.exceptions.ValidationError stringifies to a
        # repr'd list ("['File type ... not allowed.']") if passed straight to
        # str() — the view must join exc.messages instead of calling str(exc).
        assert response.data["message"] == "File type '.exe' is not allowed."

    def test_resubmission_replaces_previous_attachment(self, api_client):
        school, _ = _principal()
        school_class = SchoolClassFactory(school=school)
        student = _enrolled_student(school, school_class)
        assignment = AssignmentFactory(school=school, school_class=school_class)
        _login(api_client, student.user)

        first = SimpleUploadedFile("first.pdf", b"one", content_type="application/pdf")
        api_client.post(f"/api/v1/assignments/{assignment.id}/submit/", {"attachment": first}, format="multipart")
        second = SimpleUploadedFile("second.pdf", b"two", content_type="application/pdf")
        response = api_client.post(
            f"/api/v1/assignments/{assignment.id}/submit/", {"attachment": second}, format="multipart"
        )

        assert response.status_code == 200
        assert AssignmentSubmission.unscoped_objects.filter(assignment=assignment, student=student).count() == 1
        submission = AssignmentSubmission.unscoped_objects.get(assignment=assignment, student=student)
        assert "second" in submission.attachment.name


class TestGradeSubmission:
    def test_teacher_can_grade_and_student_is_notified(self, api_client):
        school, _ = _principal()
        teacher = _teacher(school)
        submission = AssignmentSubmissionFactory(
            school=school, assignment__school=school, assignment__teacher=teacher
        )
        submission.student.user = UserFactory(school=school)
        submission.student.save(update_fields=["user"])
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/assignment-submissions/{submission.id}/grade/",
            {"score": "45.00", "feedback": "Good work"},
            format="json",
        )

        assert response.status_code == 200
        submission.refresh_from_db()
        assert submission.status == AssignmentSubmission.Status.GRADED
        assert submission.score == Decimal("45.00")
        assert Notification.unscoped_objects.filter(
            recipient=submission.student.user, category="assignment_graded"
        ).exists()

    def test_grade_cannot_exceed_max_score(self, api_client):
        school, _ = _principal()
        teacher = _teacher(school)
        submission = AssignmentSubmissionFactory(
            school=school,
            assignment__school=school,
            assignment__teacher=teacher,
            assignment__max_score=Decimal("50.00"),
        )
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/assignment-submissions/{submission.id}/grade/", {"score": "100.00"}, format="json"
        )

        assert response.status_code == 400


class TestAssignmentTenantIsolation:
    def test_cannot_list_another_schools_assignments(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        AssignmentFactory(school=school_b)
        assignment_a = AssignmentFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/assignments/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(assignment_a.id) in ids_seen
        assert len(ids_seen) == 1
