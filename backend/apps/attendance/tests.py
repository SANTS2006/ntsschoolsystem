import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    SchoolFactory,
    SectionFactory,
    StaffAttendanceFactory,
    StaffFactory,
    StudentAttendanceFactory,
    StudentFactory,
    SubjectFactory,
    UserFactory,
)

from .models import AttendanceStatus, StudentAttendance

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _teacher():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    teacher = UserFactory(school=school)
    assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return school, teacher


def _principal():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    return school, principal


class TestStudentAttendanceCreate:
    def test_teacher_can_record_daily_attendance(self, api_client):
        school, teacher = _teacher()
        student = StudentFactory(school=school)
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/attendance/students/",
            {"student": str(student.id), "date": "2026-01-15", "status": "present"},
            format="json",
        )
        assert response.status_code == 201
        record = StudentAttendance.unscoped_objects.get(student=student, date="2026-01-15")
        assert record.recorded_by_id == teacher.id
        # Regression: `source="section.__str__"` on a SerializerMethodField-free
        # CharField used to leak `<method-wrapper '__str__' of NoneType ...>`
        # into the response whenever section was null (the common case for
        # daily attendance) — DRF only auto-calls pure-Python callables during
        # attribute traversal, not C-level method-wrappers like `None.__str__`.
        assert response.data["section_name"] is None

    def test_duplicate_daily_attendance_rejected_cleanly(self, api_client):
        school, teacher = _teacher()
        student = StudentFactory(school=school)
        StudentAttendanceFactory(school=school, student=student, date="2026-01-15", period=None)
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/attendance/students/",
            {"student": str(student.id), "date": "2026-01-15", "status": "absent"},
            format="json",
        )
        assert response.status_code == 400


class TestBulkMark:
    def test_bulk_mark_creates_and_updates(self, api_client):
        school, teacher = _teacher()
        section = SectionFactory(school=school)
        subject = SubjectFactory(school=school)
        s1 = StudentFactory(school=school, current_section=section)
        s2 = StudentFactory(school=school, current_section=section)
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/attendance/students/bulk-mark/",
            {
                "date": "2026-01-15",
                "section": str(section.id),
                "subject": str(subject.id),
                "entries": [
                    {"student_id": str(s1.id), "status": "present"},
                    {"student_id": str(s2.id), "status": "absent", "notes": "sick"},
                ],
            },
            format="json",
        )
        assert response.status_code == 200
        assert len(response.data["results"]) == 2
        assert StudentAttendance.unscoped_objects.filter(student=s1, date="2026-01-15").exists()

        # Re-submitting corrects rather than conflicting.
        response2 = api_client.post(
            "/api/v1/attendance/students/bulk-mark/",
            {
                "date": "2026-01-15",
                "section": str(section.id),
                "subject": str(subject.id),
                "entries": [{"student_id": str(s1.id), "status": "late"}],
            },
            format="json",
        )
        assert response2.status_code == 200
        record = StudentAttendance.unscoped_objects.get(student=s1, date="2026-01-15", period=None)
        assert record.status == AttendanceStatus.LATE
        assert StudentAttendance.unscoped_objects.filter(student=s1, date="2026-01-15").count() == 1

    def test_cannot_bulk_mark_for_a_section_in_an_archived_year(self, api_client):
        from tests.factories import AcademicYearFactory

        school, teacher = _teacher()
        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        section = SectionFactory(school=school, academic_year=year)
        subject = SubjectFactory(school=school)
        student = StudentFactory(school=school, current_section=section)
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/attendance/students/bulk-mark/",
            {
                "date": "2026-01-15",
                "section": str(section.id),
                "subject": str(subject.id),
                "entries": [{"student_id": str(student.id), "status": "present"}],
            },
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_bulk_mark_student_from_another_school(self, api_client):
        school_a, teacher_a = _teacher()
        school_b, _ = _teacher()
        section_a = SectionFactory(school=school_a)
        subject_a = SubjectFactory(school=school_a)
        student_b = StudentFactory(school=school_b)

        _login(api_client, teacher_a)
        response = api_client.post(
            "/api/v1/attendance/students/bulk-mark/",
            {
                "date": "2026-01-15",
                "section": str(section_a.id),
                "subject": str(subject_a.id),
                "entries": [{"student_id": str(student_b.id), "status": "present"}],
            },
            format="json",
        )
        assert response.status_code == 404


class TestAttendanceStats:
    def test_stats_counts_by_status(self, api_client):
        school, teacher = _teacher()
        section = SectionFactory(school=school)
        StudentAttendanceFactory(
            school=school, status=AttendanceStatus.PRESENT, section=section, date="2026-01-15"
        )
        StudentAttendanceFactory(
            school=school, status=AttendanceStatus.PRESENT, section=section, date="2026-01-15"
        )
        StudentAttendanceFactory(
            school=school, status=AttendanceStatus.ABSENT, section=section, date="2026-01-15"
        )
        _login(api_client, teacher)

        response = api_client.get("/api/v1/attendance/students/stats/?date=2026-01-15")
        assert response.status_code == 200
        assert response.data["stats"]["present"] == 2
        assert response.data["stats"]["absent"] == 1


class TestStudentAttendanceTenantIsolation:
    def test_cannot_list_another_schools_attendance(self, api_client):
        school_a, teacher_a = _teacher()
        school_b, _ = _teacher()
        StudentAttendanceFactory(school=school_b)
        record_a = StudentAttendanceFactory(school=school_a)

        _login(api_client, teacher_a)
        response = api_client.get("/api/v1/attendance/students/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(record_a.id) in ids_seen
        assert len(ids_seen) == 1


class TestStaffAttendancePermissionSeparation:
    def test_teacher_cannot_access_staff_attendance(self, api_client):
        school, teacher = _teacher()
        _login(api_client, teacher)

        response = api_client.get("/api/v1/attendance/staff/")
        assert response.status_code == 403

    def test_principal_can_record_staff_attendance(self, api_client):
        school, principal = _principal()
        staff = StaffFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/attendance/staff/",
            {"staff": str(staff.id), "date": "2026-01-15", "status": "present"},
            format="json",
        )
        assert response.status_code == 201

    def test_duplicate_staff_attendance_rejected_cleanly(self, api_client):
        school, principal = _principal()
        staff = StaffFactory(school=school)
        StaffAttendanceFactory(school=school, staff=staff, date="2026-01-15")
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/attendance/staff/",
            {"staff": str(staff.id), "date": "2026-01-15", "status": "absent"},
            format="json",
        )
        assert response.status_code == 400


class TestBulkMarkRequiresSubject:
    def test_bulk_mark_without_a_subject_is_rejected(self, api_client):
        school, teacher = _teacher()
        section = SectionFactory(school=school)
        student = StudentFactory(school=school, current_section=section)
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/attendance/students/bulk-mark/",
            {"date": "2026-01-15", "section": str(section.id), "entries": [{"student_id": str(student.id), "status": "present"}]},
            format="json",
        )
        assert response.status_code == 400


class TestStudentAttendanceAdminIsViewOnly:
    def test_school_administrator_cannot_record_student_attendance(self, api_client):
        school, _ = _teacher()
        admin = UserFactory(school=school)
        assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
        student = StudentFactory(school=school)
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/attendance/students/",
            {"student": str(student.id), "date": "2026-01-15", "status": "present"},
            format="json",
        )
        assert response.status_code == 403

    def test_school_administrator_can_view_student_attendance(self, api_client):
        school, _ = _teacher()
        admin = UserFactory(school=school)
        assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
        StudentAttendanceFactory(school=school)
        _login(api_client, admin)

        response = api_client.get("/api/v1/attendance/students/")
        assert response.status_code == 200


class TestSelfServiceAttendance:
    def test_student_sees_only_their_own_attendance(self, api_client):
        school, _ = _teacher()
        seed_default_roles_for_school(school)
        student = StudentFactory(school=school, user=UserFactory(school=school))
        other_student = StudentFactory(school=school, user=UserFactory(school=school))
        StudentAttendanceFactory(school=school, student=student, date="2026-01-15")
        StudentAttendanceFactory(school=school, student=other_student, date="2026-01-15")
        _login(api_client, student.user)

        response = api_client.get("/api/v1/attendance/my-attendance/")
        assert response.status_code == 200
        assert len(response.data["records"]) == 1
        assert response.data["records"][0]["student"] == student.id

    def test_staff_sees_only_their_own_attendance(self, api_client):
        school, _ = _principal()
        staff = StaffFactory(school=school)
        other_staff = StaffFactory(school=school)
        StaffAttendanceFactory(school=school, staff=staff, date="2026-01-15")
        StaffAttendanceFactory(school=school, staff=other_staff, date="2026-01-15")
        _login(api_client, staff.user)

        response = api_client.get("/api/v1/attendance/my-staff-attendance/")
        assert response.status_code == 200
        assert len(response.data["records"]) == 1
        assert response.data["records"][0]["staff"] == staff.id
