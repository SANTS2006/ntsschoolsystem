from decimal import Decimal

import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AcademicYearFactory,
    SchoolClassFactory,
    SchoolFactory,
    SectionFactory,
    UserFactory,
)

from .models import AcademicYear, SchoolClass, SubjectOffering

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


class TestAcademicYearCRUD:
    def test_principal_can_create_academic_year(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/academic-years/",
            {"name": "2026/2027", "start_date": "2026-09-01", "end_date": "2027-07-31"},
            format="json",
        )
        assert response.status_code == 201
        year = AcademicYear.unscoped_objects.get(school=school, name="2026/2027")
        assert year.school_id == school.id

    def test_teacher_without_permission_cannot_create(self, api_client):
        school, _principal_user = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/academics/academic-years/",
            {"name": "2026/2027", "start_date": "2026-09-01", "end_date": "2027-07-31"},
            format="json",
        )
        assert response.status_code == 403

    def test_teacher_can_view_academic_years(self, api_client):
        school, _ = _principal()
        year = AcademicYearFactory(school=school)
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/academics/academic-years/")
        assert response.status_code == 200
        assert any(row["id"] == str(year.id) for row in response.data["results"])


class TestTenantIsolation:
    def test_cannot_list_another_schools_academic_years(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        AcademicYearFactory(school=school_b)
        year_a = AcademicYearFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/academics/academic-years/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(year_a.id) in ids_seen
        assert len(ids_seen) == 1

    def test_cannot_retrieve_another_schools_class_by_id(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        class_b = SchoolClassFactory(school=school_b)

        _login(api_client, principal_a)
        response = api_client.get(f"/api/v1/academics/classes/{class_b.id}/")
        assert response.status_code == 404

    def test_cannot_create_section_referencing_another_schools_class(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        class_b = SchoolClassFactory(school=school_b)
        year_a = AcademicYearFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.post(
            "/api/v1/academics/sections/",
            {"school_class": str(class_b.id), "academic_year": str(year_a.id), "name": "A"},
            format="json",
        )
        assert response.status_code == 400


class TestTermSequence:
    """Phase 2 — Term.sequence: explicit 1st/2nd/3rd ordering, independent of start_date."""

    def test_terms_created_with_explicit_sequence_order_correctly(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school)
        _login(api_client, principal)

        for name, sequence in [("Term 2", 2), ("Term 1", 1), ("Term 3", 3)]:
            response = api_client.post(
                "/api/v1/academics/terms/",
                {
                    "academic_year": str(year.id), "name": name, "sequence": sequence,
                    "start_date": "2026-09-01", "end_date": "2026-12-01",
                },
                format="json",
            )
            assert response.status_code == 201, response.data

        response = api_client.get(f"/api/v1/academics/terms/?academic_year={year.id}")
        assert response.status_code == 200
        names_in_order = [row["name"] for row in response.data["results"]]
        assert names_in_order == ["Term 1", "Term 2", "Term 3"]

    def test_duplicate_sequence_in_same_year_rejected(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school)
        from tests.factories import TermFactory

        TermFactory(school=school, academic_year=year, name="Term 1", sequence=1)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/terms/",
            {
                "academic_year": str(year.id), "name": "Term 1B", "sequence": 1,
                "start_date": "2026-09-01", "end_date": "2026-12-01",
            },
            format="json",
        )
        assert response.status_code == 400
        assert "sequence" in response.data["errors"][0]["message"]

    def test_same_sequence_allowed_across_different_years(self, api_client):
        school, principal = _principal()
        year_a = AcademicYearFactory(school=school, name="2025/2026")
        year_b = AcademicYearFactory(school=school, name="2026/2027")
        from tests.factories import TermFactory

        TermFactory(school=school, academic_year=year_a, name="Term 1", sequence=1)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/terms/",
            {
                "academic_year": str(year_b.id), "name": "Term 1", "sequence": 1,
                "start_date": "2026-09-01", "end_date": "2026-12-01",
            },
            format="json",
        )
        assert response.status_code == 201


class TestSchoolClassProgression:
    """Phase 2 — SchoolClass.next_class / is_public_exam_transition / is_graduation_level."""

    def test_can_configure_next_class(self, api_client):
        school, principal = _principal()
        grade1 = SchoolClassFactory(school=school, name="Grade 1")
        grade2 = SchoolClassFactory(school=school, name="Grade 2")
        _login(api_client, principal)

        response = api_client.patch(
            f"/api/v1/academics/classes/{grade1.id}/", {"next_class": str(grade2.id)}, format="json"
        )
        assert response.status_code == 200
        assert response.data["next_class_name"] == "Grade 2"
        grade1.refresh_from_db()
        assert grade1.next_class_id == grade2.id

    def test_class_cannot_be_its_own_next_class(self, api_client):
        school, principal = _principal()
        grade1 = SchoolClassFactory(school=school, name="Grade 1")
        _login(api_client, principal)

        response = api_client.patch(
            f"/api/v1/academics/classes/{grade1.id}/", {"next_class": str(grade1.id)}, format="json"
        )
        assert response.status_code == 400

    def test_next_class_from_another_school_rejected(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        class_a = SchoolClassFactory(school=school_a, name="Grade 1")
        class_b = SchoolClassFactory(school=school_b, name="Grade 2")
        _login(api_client, principal_a)

        response = api_client.patch(
            f"/api/v1/academics/classes/{class_a.id}/", {"next_class": str(class_b.id)}, format="json"
        )
        assert response.status_code == 400

    def test_public_exam_transition_and_graduation_flags(self, api_client):
        school, principal = _principal()
        jss3 = SchoolClassFactory(school=school, name="JSS 3")
        sss3 = SchoolClassFactory(school=school, name="SSS 3")
        _login(api_client, principal)

        response = api_client.patch(
            f"/api/v1/academics/classes/{jss3.id}/", {"is_public_exam_transition": True}, format="json"
        )
        assert response.status_code == 200
        assert response.data["is_public_exam_transition"] is True

        response = api_client.patch(
            f"/api/v1/academics/classes/{sss3.id}/", {"is_graduation_level": True}, format="json"
        )
        assert response.status_code == 200
        assert response.data["is_graduation_level"] is True


class TestSubjectOffering:
    """Phase 3 — Subjects & Teacher Assignment. A SubjectOffering is `Subject` X as taught to
    one class, for one term/year, by one main teacher (+ optional assistant), with its own
    CA/Exam split and pass mark."""

    def _setup(self, school):
        from tests.factories import StaffFactory, SubjectFactory, TermFactory

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        subject = SubjectFactory(school=school, name="Mathematics")
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        return year, term, subject, school_class, teacher

    def test_create_offering_with_valid_ca_exam_split(self, api_client):
        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject.id), "academic_year": str(year.id), "term": str(term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                "ca_weight_percent": 40, "exam_weight_percent": 60, "pass_mark": 50,
            },
            format="json",
        )
        assert response.status_code == 201, response.data
        assert response.data["main_teacher_name"] == teacher.user.full_name
        assert response.data["assistant_teacher"] is None

    def test_ca_exam_split_must_sum_to_100(self, api_client):
        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject.id), "academic_year": str(year.id), "term": str(term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                "ca_weight_percent": 40, "exam_weight_percent": 50, "pass_mark": 50,
            },
            format="json",
        )
        assert response.status_code == 400
        assert "exam_weight_percent" in response.data["errors"][0]["field"]

    def test_optional_assistant_teacher(self, api_client):
        from tests.factories import StaffFactory

        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        assistant = StaffFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject.id), "academic_year": str(year.id), "term": str(term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                "assistant_teacher": str(assistant.id),
                "ca_weight_percent": 40, "exam_weight_percent": 60, "pass_mark": 60,
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.data["assistant_teacher_name"] == assistant.user.full_name
        assert response.data["pass_mark"] == 60

    def test_one_teacher_can_teach_multiple_subjects(self, api_client):
        from tests.factories import SubjectFactory

        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        physics = SubjectFactory(school=school, name="Physics")
        _login(api_client, principal)

        for subj in (subject, physics):
            response = api_client.post(
                "/api/v1/academics/subject-offerings/",
                {
                    "subject": str(subj.id), "academic_year": str(year.id), "term": str(term.id),
                    "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                    "ca_weight_percent": 40, "exam_weight_percent": 60, "pass_mark": 50,
                },
                format="json",
            )
            assert response.status_code == 201, response.data

        from apps.academics.models import SubjectOffering
        assert SubjectOffering.unscoped_objects.filter(school=school, main_teacher=teacher).count() == 2

    def test_duplicate_offering_for_same_subject_term_class_rejected(self, api_client):
        from tests.factories import SubjectOfferingFactory

        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term,
            school_class=school_class, main_teacher=teacher,
        )
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject.id), "academic_year": str(year.id), "term": str(term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                "ca_weight_percent": 30, "exam_weight_percent": 70, "pass_mark": 50,
            },
            format="json",
        )
        assert response.status_code == 400

    def test_teacher_role_cannot_create_offering(self, api_client):
        from tests.factories import UserFactory as _UserFactory

        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        teacher_user = _UserFactory(school=school)
        assign_role(user=teacher_user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher_user)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject.id), "academic_year": str(year.id), "term": str(term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                "ca_weight_percent": 40, "exam_weight_percent": 60, "pass_mark": 50,
            },
            format="json",
        )
        assert response.status_code == 403

    def test_teacher_role_can_view_offerings(self, api_client):
        from tests.factories import StaffFactory, SubjectOfferingFactory

        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        offering = SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term,
            school_class=school_class, main_teacher=teacher,
        )
        # A teacher sees the offerings they teach (as main or assistant teacher) - and only those.
        other_offering = SubjectOfferingFactory(
            school=school, academic_year=year, term=term, school_class=school_class,
            main_teacher=StaffFactory(school=school),
        )
        teacher_user = teacher.user
        assign_role(user=teacher_user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher_user)

        response = api_client.get("/api/v1/academics/subject-offerings/")
        assert response.status_code == 200
        ids = {row["id"] for row in response.data["results"]}
        assert str(offering.id) in ids
        assert str(other_offering.id) not in ids

    def test_cross_tenant_teacher_assignment_rejected(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        year, term, subject, school_class, _teacher_a = self._setup(school_a)
        from tests.factories import StaffFactory

        teacher_b = StaffFactory(school=school_b)
        _login(api_client, principal_a)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject.id), "academic_year": str(year.id), "term": str(term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher_b.id),
                "ca_weight_percent": 40, "exam_weight_percent": 60, "pass_mark": 50,
            },
            format="json",
        )
        assert response.status_code == 400

    def test_cross_tenant_subject_assignment_rejected(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        year, term, _subject_a, school_class, teacher = self._setup(school_a)
        from tests.factories import SubjectFactory

        subject_b = SubjectFactory(school=school_b)
        _login(api_client, principal_a)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject_b.id), "academic_year": str(year.id), "term": str(term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                "ca_weight_percent": 40, "exam_weight_percent": 60, "pass_mark": 50,
            },
            format="json",
        )
        assert response.status_code == 400

    def test_term_must_belong_to_selected_academic_year(self, api_client):
        from tests.factories import TermFactory

        school, principal = _principal()
        year, term, subject, school_class, teacher = self._setup(school)
        other_year = AcademicYearFactory(school=school, name="Other Year")
        other_term = TermFactory(school=school, academic_year=other_year, sequence=99)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/subject-offerings/",
            {
                "subject": str(subject.id), "academic_year": str(year.id), "term": str(other_term.id),
                "school_class": str(school_class.id), "main_teacher": str(teacher.id),
                "ca_weight_percent": 40, "exam_weight_percent": 60, "pass_mark": 50,
            },
            format="json",
        )
        assert response.status_code == 400
        assert "term" in response.data["errors"][0]["field"]

    def test_cannot_list_another_schools_subject_offerings(self, api_client):
        from tests.factories import SubjectOfferingFactory

        school_a, principal_a = _principal()
        school_b, _ = _principal()
        SubjectOfferingFactory(school=school_b)
        _login(api_client, principal_a)

        response = api_client.get("/api/v1/academics/subject-offerings/")
        assert response.status_code == 200
        assert response.data["count"] == 0


class TestStudentSubjectEnrollment:
    """Phase 4 — Student-Subject Enrollment. Deliberately never auto-assumed: a student must be
    explicitly enrolled into a SubjectOffering before it counts as "their" subject. Admins may
    manage any offering's roster; a teacher may only manage the roster for offerings where they
    are the main or assistant teacher — enforced at the object level, not just by permission code,
    to close IDOR/BOLA gaps."""

    def _setup(self, school):
        from tests.factories import StaffFactory, SubjectFactory, SubjectOfferingFactory, TermFactory

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        subject = SubjectFactory(school=school, name="Mathematics")
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        offering = SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term,
            school_class=school_class, main_teacher=teacher,
        )
        return offering, teacher

    def test_admin_can_enroll_student(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        offering, _teacher = self._setup(school)
        student = StudentFactory(school=school, current_class=offering.school_class)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/subject-enrollments/",
            {"subject_offering": str(offering.id), "student": str(student.id)},
            format="json",
        )
        assert response.status_code == 201, response.data
        assert response.data["student_name"] == student.full_name

    def test_duplicate_enrollment_rejected(self, api_client):
        from tests.factories import StudentFactory, StudentSubjectEnrollmentFactory

        school, principal = _principal()
        offering, _teacher = self._setup(school)
        student = StudentFactory(school=school, current_class=offering.school_class)
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/subject-enrollments/",
            {"subject_offering": str(offering.id), "student": str(student.id)},
            format="json",
        )
        assert response.status_code == 400

    def test_teacher_can_enroll_student_into_own_offering(self, api_client):
        from tests.factories import StudentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/academics/subject-enrollments/",
            {"subject_offering": str(offering.id), "student": str(student.id)},
            format="json",
        )
        assert response.status_code == 201, response.data

    def test_teacher_cannot_enroll_student_into_another_teachers_offering(self, api_client):
        from tests.factories import StaffFactory, StudentFactory

        school, _ = _principal()
        offering, _owning_teacher = self._setup(school)
        other_teacher = StaffFactory(school=school)
        assign_role(user=other_teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        _login(api_client, other_teacher.user)

        response = api_client.post(
            "/api/v1/academics/subject-enrollments/",
            {"subject_offering": str(offering.id), "student": str(student.id)},
            format="json",
        )
        assert response.status_code == 403

    def test_assistant_teacher_can_manage_own_offering_roster(self, api_client):
        from tests.factories import StaffFactory, StudentFactory

        school, _ = _principal()
        offering, _teacher = self._setup(school)
        assistant = StaffFactory(school=school)
        offering.assistant_teacher = assistant
        offering.save()
        assign_role(user=assistant.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        _login(api_client, assistant.user)

        response = api_client.post(
            "/api/v1/academics/subject-enrollments/",
            {"subject_offering": str(offering.id), "student": str(student.id)},
            format="json",
        )
        assert response.status_code == 201, response.data

    def test_teacher_can_only_list_own_offerings_enrollments(self, api_client):
        from tests.factories import (
            StaffFactory,
            StudentFactory,
            StudentSubjectEnrollmentFactory,
            SubjectFactory,
            SubjectOfferingFactory,
        )

        school, _ = _principal()
        offering, teacher = self._setup(school)
        other_teacher = StaffFactory(school=school)
        other_subject = SubjectFactory(school=school, name="Physics")
        other_offering = SubjectOfferingFactory(
            school=school, subject=other_subject, academic_year=offering.academic_year, term=offering.term,
            school_class=offering.school_class, main_teacher=other_teacher,
        )
        student = StudentFactory(school=school, current_class=offering.school_class)
        own_enrollment = StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        StudentSubjectEnrollmentFactory(school=school, subject_offering=other_offering, student=student)

        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.get("/api/v1/academics/subject-enrollments/")
        assert response.status_code == 200
        ids = [row["id"] for row in response.data["results"]]
        assert str(own_enrollment.id) in ids
        assert len(ids) == 1

    def test_teacher_can_remove_student_from_own_offering(self, api_client):
        from tests.factories import StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        student = StudentFactory(school=school, current_class=offering.school_class)
        enrollment = StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.delete(f"/api/v1/academics/subject-enrollments/{enrollment.id}/")
        assert response.status_code == 204

        from apps.academics.models import StudentSubjectEnrollment

        assert not StudentSubjectEnrollment.unscoped_objects.filter(id=enrollment.id).exists()

    def test_teacher_cannot_remove_enrollment_from_another_teachers_offering(self, api_client):
        from tests.factories import StaffFactory, StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, _owning_teacher = self._setup(school)
        other_teacher = StaffFactory(school=school)
        student = StudentFactory(school=school, current_class=offering.school_class)
        enrollment = StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        assign_role(user=other_teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, other_teacher.user)

        response = api_client.delete(f"/api/v1/academics/subject-enrollments/{enrollment.id}/")
        assert response.status_code == 404

        from apps.academics.models import StudentSubjectEnrollment

        assert StudentSubjectEnrollment.unscoped_objects.filter(id=enrollment.id).exists()

    def test_my_subjects_returns_only_explicitly_enrolled_subjects(self, api_client):
        from tests.factories import (
            StudentFactory,
            StudentSubjectEnrollmentFactory,
            SubjectFactory,
            SubjectOfferingFactory,
        )

        school, _ = _principal()
        offering, _teacher = self._setup(school)
        not_enrolled_subject = SubjectFactory(school=school, name="Chemistry")
        SubjectOfferingFactory(
            school=school, subject=not_enrolled_subject, academic_year=offering.academic_year,
            term=offering.term, school_class=offering.school_class,
        )
        student = StudentFactory(school=school, current_class=offering.school_class)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        _login(api_client, student.user)

        response = api_client.get("/api/v1/academics/my-subjects/")
        assert response.status_code == 200
        subjects = response.data["subjects"]
        assert len(subjects) == 1
        assert subjects[0]["id"] == str(offering.id)

    def test_cross_tenant_enrollment_rejected(self, api_client):
        from tests.factories import StudentFactory

        school_a, principal_a = _principal()
        school_b, _ = _principal()
        offering, _teacher = self._setup(school_a)
        student_b = StudentFactory(school=school_b)
        _login(api_client, principal_a)

        response = api_client.post(
            "/api/v1/academics/subject-enrollments/",
            {"subject_offering": str(offering.id), "student": str(student_b.id)},
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_list_another_schools_enrollments(self, api_client):
        from tests.factories import StudentSubjectEnrollmentFactory

        school_a, principal_a = _principal()
        school_b, _ = _principal()
        StudentSubjectEnrollmentFactory(school=school_b)
        _login(api_client, principal_a)

        response = api_client.get("/api/v1/academics/subject-enrollments/")
        assert response.status_code == 200
        assert response.data["count"] == 0


class TestAssessmentAndCA:
    """Phase 5 — Continuous Assessment. Assessments split a SubjectOffering's CA percentage into
    teacher-defined components (weight-budget enforced, never allowed to exceed
    ca_weight_percent — under-allocation is fine while a teacher is still adding assessments).
    AssessmentScore tracks a draft->submitted grade-entry workflow; Total CA only counts
    submitted scores. Admin can close/reopen CA, locking/unlocking teacher edits."""

    def _setup(self, school):
        from tests.factories import StaffFactory, SubjectFactory, SubjectOfferingFactory, TermFactory

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        subject = SubjectFactory(school=school, name="Mathematics")
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        offering = SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term, school_class=school_class,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60,
        )
        return offering, teacher

    def test_teacher_can_create_assessment_within_ca_budget(self, api_client):
        school, _ = _principal()
        offering, teacher = self._setup(school)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/academics/assessments/",
            {"subject_offering": str(offering.id), "name": "Assignment 1", "weight": 20, "max_score": "100"},
            format="json",
        )
        assert response.status_code == 201, response.data

    def test_assessment_weights_cannot_exceed_ca_percentage(self, api_client):
        from tests.factories import AssessmentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        AssessmentFactory(school=school, subject_offering=offering, weight=30)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/academics/assessments/",
            {"subject_offering": str(offering.id), "name": "Assignment 2", "weight": 20, "max_score": "100"},
            format="json",
        )
        assert response.status_code == 400
        assert "weight" in response.data["errors"][0]["field"]

    def test_partial_ca_allocation_allowed_and_reflected_in_progress_fields(self, api_client):
        school, principal = _principal()
        offering, teacher = self._setup(school)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/academics/assessments/",
            {"subject_offering": str(offering.id), "name": "Assignment 1", "weight": 15, "max_score": "100"},
            format="json",
        )
        assert response.status_code == 201, response.data

        _login(api_client, principal)
        get_response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/")
        assert get_response.data["ca_allocated_percent"] == 15
        assert get_response.data["ca_remaining_percent"] == 25

    def test_teacher_cannot_create_assessment_for_another_teachers_offering(self, api_client):
        from tests.factories import StaffFactory

        school, _ = _principal()
        offering, _owning_teacher = self._setup(school)
        other_teacher = StaffFactory(school=school)
        assign_role(user=other_teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, other_teacher.user)

        response = api_client.post(
            "/api/v1/academics/assessments/",
            {"subject_offering": str(offering.id), "name": "Assignment 1", "weight": 20, "max_score": "100"},
            format="json",
        )
        assert response.status_code == 403

    def test_submit_scores_computes_weighted_total_and_notifies_student(self, api_client):
        from tests.factories import AssessmentFactory, StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "80"}], "submit": True},
            format="json",
        )
        assert response.status_code == 200, response.data

        from apps.academics.models import AssessmentScore

        score = AssessmentScore.unscoped_objects.get(assessment=assessment, student=student)
        assert score.status == AssessmentScore.Status.SUBMITTED
        assert score.weighted_score == Decimal("16.00")  # 80/100 * 20

        from apps.notifications.models import Notification

        assert Notification.unscoped_objects.filter(recipient=student.user, category="assessment").exists()

    def test_draft_save_does_not_notify_or_count_toward_total_ca(self, api_client):
        from tests.factories import AssessmentFactory, StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "80"}], "submit": False},
            format="json",
        )
        assert response.status_code == 200, response.data

        from apps.notifications.models import Notification

        assert not Notification.unscoped_objects.filter(recipient=student.user, category="assessment").exists()

        from apps.academics.services import compute_total_ca

        assert compute_total_ca(offering, student) is None

    def test_negative_score_rejected(self, api_client):
        from tests.factories import AssessmentFactory, StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "-5"}], "submit": False},
            format="json",
        )
        assert response.status_code == 400

    def test_score_cannot_exceed_max_score(self, api_client):
        from tests.factories import AssessmentFactory, StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "150"}], "submit": False},
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_score_student_not_enrolled_in_offering(self, api_client):
        from tests.factories import AssessmentFactory, StudentFactory

        school, _ = _principal()
        offering, teacher = self._setup(school)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        not_enrolled_student = StudentFactory(school=school, current_class=offering.school_class)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(not_enrolled_student.id), "raw_score": "50"}], "submit": False},
            format="json",
        )
        assert response.status_code == 400

    def test_admin_can_close_ca_and_teacher_cannot_modify_afterward(self, api_client):
        from tests.factories import AssessmentFactory, StudentFactory, StudentSubjectEnrollmentFactory

        school, principal = _principal()
        offering, teacher = self._setup(school)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        _login(api_client, principal)

        close_response = api_client.post(f"/api/v1/academics/subject-offerings/{offering.id}/close-ca/")
        assert close_response.status_code == 200, close_response.data

        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "80"}], "submit": True},
            format="json",
        )
        assert response.status_code == 400

    def test_teacher_cannot_close_ca(self, api_client):
        school, _ = _principal()
        offering, teacher = self._setup(school)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(f"/api/v1/academics/subject-offerings/{offering.id}/close-ca/")
        assert response.status_code == 403

    def test_admin_can_reopen_ca_with_reason(self, api_client):
        school, principal = _principal()
        offering, _teacher = self._setup(school)
        _login(api_client, principal)
        api_client.post(f"/api/v1/academics/subject-offerings/{offering.id}/close-ca/")

        response = api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/reopen-ca/",
            {"reason": "Data entry error"},
            format="json",
        )
        assert response.status_code == 200, response.data
        offering.refresh_from_db()
        assert offering.ca_status == SubjectOffering.CAStatus.OPEN

    def test_reopen_ca_requires_reason(self, api_client):
        school, principal = _principal()
        offering, _teacher = self._setup(school)
        _login(api_client, principal)
        api_client.post(f"/api/v1/academics/subject-offerings/{offering.id}/close-ca/")

        response = api_client.post(f"/api/v1/academics/subject-offerings/{offering.id}/reopen-ca/", {}, format="json")
        assert response.status_code == 400

    def test_student_can_view_own_subject_ca(self, api_client):
        from tests.factories import AssessmentFactory, StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, _teacher = self._setup(school)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        student = StudentFactory(school=school, current_class=offering.school_class)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)

        from apps.academics.services import save_assessment_scores

        save_assessment_scores(assessment, entries=[{"student": student, "raw_score": Decimal("80")}], submit=True)
        _login(api_client, student.user)

        response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/ca/")
        assert response.status_code == 200, response.data
        assert Decimal(response.data["total_ca"]) == Decimal("16.00")
        assert len(response.data["assessments"]) == 1

    def test_student_cannot_view_ca_for_subject_not_enrolled_in(self, api_client):
        from tests.factories import StudentFactory

        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = StudentFactory(school=school)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        _login(api_client, student.user)

        response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/ca/")
        assert response.status_code == 404

    def test_cannot_list_another_schools_assessments(self, api_client):
        from tests.factories import AssessmentFactory

        school_a, principal_a = _principal()
        school_b, _ = _principal()
        AssessmentFactory(school=school_b)
        _login(api_client, principal_a)

        response = api_client.get("/api/v1/academics/assessments/")
        assert response.status_code == 200
        assert response.data["count"] == 0


class TestDiscretionaryMarks:
    """A teacher can reserve part of an assessment's weight to award by hand per student. The test
    itself then only earns weight - discretionary_weight; the reserved part is added on top."""

    def _teacher_world(self, api_client):
        school, _ = _principal()
        offering, teacher = TestAssessmentAndCA()._setup(school)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)
        return school, offering, teacher

    def _enrolled_student(self, school, offering):
        from tests.factories import StudentFactory, StudentSubjectEnrollmentFactory

        student = StudentFactory(school=school, current_class=offering.school_class)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        return student

    def test_can_reserve_marks_when_creating_assessment(self, api_client):
        _, offering, _ = self._teacher_world(api_client)
        response = api_client.post(
            "/api/v1/academics/assessments/",
            {
                "subject_offering": str(offering.id), "name": "Project", "weight": 20,
                "discretionary_weight": 5, "max_score": "100",
            },
            format="json",
        )
        assert response.status_code == 201, response.data
        assert response.data["discretionary_weight"] == 5

    def test_reserved_marks_cannot_exceed_assessment_weight(self, api_client):
        _, offering, _ = self._teacher_world(api_client)
        response = api_client.post(
            "/api/v1/academics/assessments/",
            {
                "subject_offering": str(offering.id), "name": "Project", "weight": 10,
                "discretionary_weight": 11, "max_score": "100",
            },
            format="json",
        )
        assert response.status_code == 400

    def test_weighted_score_combines_test_portion_and_discretionary_mark(self, api_client):
        from tests.factories import AssessmentFactory

        from apps.academics.models import AssessmentScore

        school, offering, _ = self._teacher_world(api_client)
        assessment = AssessmentFactory(
            school=school, subject_offering=offering, weight=20, discretionary_weight=5, max_score=Decimal("100")
        )
        student = self._enrolled_student(school, offering)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "80", "discretionary_mark": "4"}], "submit": True},
            format="json",
        )
        assert response.status_code == 200, response.data

        score = AssessmentScore.unscoped_objects.get(assessment=assessment, student=student)
        # 80/100 of the 15 test marks = 12, plus 4 discretionary = 16 out of 20.
        assert score.weighted_score == Decimal("16.00")
        assert score.discretionary_mark == Decimal("4")

    def test_discretionary_mark_cannot_exceed_reserved_marks(self, api_client):
        from tests.factories import AssessmentFactory

        school, offering, _ = self._teacher_world(api_client)
        assessment = AssessmentFactory(
            school=school, subject_offering=offering, weight=20, discretionary_weight=5, max_score=Decimal("100")
        )
        student = self._enrolled_student(school, offering)

        response = api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "50", "discretionary_mark": "6"}], "submit": False},
            format="json",
        )
        assert response.status_code == 400

    def test_saving_scores_without_discretionary_key_keeps_existing_mark(self, api_client):
        from tests.factories import AssessmentFactory

        from apps.academics.models import AssessmentScore

        school, offering, _ = self._teacher_world(api_client)
        assessment = AssessmentFactory(
            school=school, subject_offering=offering, weight=20, discretionary_weight=5, max_score=Decimal("100")
        )
        student = self._enrolled_student(school, offering)
        url = f"/api/v1/academics/assessments/{assessment.id}/scores/"
        api_client.post(
            url, {"entries": [{"student": str(student.id), "raw_score": "50", "discretionary_mark": "3"}], "submit": False},
            format="json",
        )
        api_client.post(url, {"entries": [{"student": str(student.id), "raw_score": "60"}], "submit": False}, format="json")

        score = AssessmentScore.unscoped_objects.get(assessment=assessment, student=student)
        assert score.discretionary_mark == Decimal("3")
        assert score.weighted_score == Decimal("9.00") + Decimal("3")  # 60/100 * 15 + 3

    def test_cannot_lower_reserved_marks_below_what_was_awarded(self, api_client):
        from tests.factories import AssessmentFactory

        school, offering, _ = self._teacher_world(api_client)
        assessment = AssessmentFactory(
            school=school, subject_offering=offering, weight=20, discretionary_weight=5, max_score=Decimal("100")
        )
        student = self._enrolled_student(school, offering)
        api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "50", "discretionary_mark": "4"}], "submit": False},
            format="json",
        )
        response = api_client.patch(
            f"/api/v1/academics/assessments/{assessment.id}/", {"discretionary_weight": 2}, format="json"
        )
        assert response.status_code == 400

    def test_assessment_without_reserved_marks_scores_exactly_as_before(self, api_client):
        from tests.factories import AssessmentFactory

        from apps.academics.models import AssessmentScore

        school, offering, _ = self._teacher_world(api_client)
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=Decimal("100"))
        student = self._enrolled_student(school, offering)
        api_client.post(
            f"/api/v1/academics/assessments/{assessment.id}/scores/",
            {"entries": [{"student": str(student.id), "raw_score": "80"}], "submit": True},
            format="json",
        )
        score = AssessmentScore.unscoped_objects.get(assessment=assessment, student=student)
        assert score.weighted_score == Decimal("16.00")


class TestSubjectResultAndFinalScore:
    """Phase 6 — Examination & Result Engine. Exam scores are entered by Admin/Exams-Director
    only (never a teacher, never a School Administrator — who has no examinations access by
    design) and combined with Phase 5's Total CA into a deterministic Final Subject Score,
    computed entirely in apps.academics.services — never in the frontend."""

    def _setup(self, school):
        from tests.factories import StaffFactory, SubjectFactory, SubjectOfferingFactory, TermFactory

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        subject = SubjectFactory(school=school, name="Mathematics")
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        offering = SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term, school_class=school_class,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )
        return offering, teacher

    def _enroll(self, school, offering):
        from tests.factories import StudentFactory, StudentSubjectEnrollmentFactory

        student = StudentFactory(school=school, current_class=offering.school_class)
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        return student

    def _submit_ca(self, school, offering, student, *, weight, raw_score):
        from tests.factories import AssessmentFactory

        from apps.academics.services import save_assessment_scores

        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=weight, max_score=Decimal("100"))
        save_assessment_scores(assessment, entries=[{"student": student, "raw_score": raw_score}], submit=True)
        return assessment

    def _exams_director(self, school):
        director = UserFactory(school=school)
        assign_role(user=director, role=Role.unscoped_objects.get(school=school, slug="exams-director"))
        return director

    def test_exams_director_can_enter_exam_score(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        director = self._exams_director(school)
        _login(api_client, director)

        response = api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "70"}]},
            format="json",
        )
        assert response.status_code == 200, response.data

        from apps.academics.models import SubjectResult

        result = SubjectResult.unscoped_objects.get(subject_offering=offering, student=student)
        assert result.exam_score == Decimal("70.00")

    def test_teacher_cannot_enter_exam_score(self, api_client):
        school, _ = _principal()
        offering, teacher = self._setup(school)
        student = self._enroll(school, offering)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher.user)

        response = api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "70"}]},
            format="json",
        )
        assert response.status_code == 403

    def test_school_administrator_can_view_results(self, api_client):
        # School Administrator was granted full `examinations.*` alongside Exams Director (per a
        # later product decision) — they can enter exam scores and view/publish results too, not
        # just the Principal/Exams-Director. Accountant still holds neither, see the sibling test
        # right below `test_teacher_cannot_enter_exam_score` for the negative case that remains.
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        admin_user = UserFactory(school=school)
        assign_role(user=admin_user, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
        _login(api_client, admin_user)

        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        assert response.status_code == 200

    def test_final_subject_score_combines_ca_and_exam(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)  # ca=40, exam=60, pass_mark=50
        student = self._enroll(school, offering)
        self._submit_ca(school, offering, student, weight=40, raw_score=Decimal("80"))  # CA contribution = 32
        director = self._exams_director(school)
        _login(api_client, director)

        response = api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "70"}]},  # exam contribution = 42
            format="json",
        )
        assert response.status_code == 200, response.data

        get_response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in get_response.data["rows"] if r["student"] == str(student.id))
        assert Decimal(row["ca_contribution"]) == Decimal("32.00")
        assert Decimal(row["exam_contribution"]) == Decimal("42.00")
        assert Decimal(row["final_score"]) == Decimal("74.00")
        assert row["pass_status"] == "pass"

    def test_near_pass_status(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)  # pass_mark=50
        student = self._enroll(school, offering)
        self._submit_ca(school, offering, student, weight=40, raw_score=Decimal("50"))  # CA contribution = 20
        director = self._exams_director(school)
        _login(api_client, director)

        api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "45"}]},  # exam contribution = 27
            format="json",
        )
        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert Decimal(row["final_score"]) == Decimal("47.00")
        assert row["pass_status"] == "near_pass"

    def test_fail_status(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        self._submit_ca(school, offering, student, weight=40, raw_score=Decimal("20"))  # CA contribution = 8
        director = self._exams_director(school)
        _login(api_client, director)

        api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "10"}]},  # exam contribution = 6
            format="json",
        )
        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert row["pass_status"] == "fail"

    def test_missing_ca_marks_incomplete_not_fail(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)  # no CA submitted at all
        director = self._exams_director(school)
        _login(api_client, director)

        api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "90"}]},
            format="json",
        )
        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert row["final_score"] is None
        assert row["pass_status"] == "incomplete"

    def test_missing_exam_score_marks_incomplete(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        self._submit_ca(school, offering, student, weight=40, raw_score=Decimal("80"))
        director = self._exams_director(school)
        _login(api_client, director)

        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert row["exam_score"] is None
        assert row["final_score"] is None
        assert row["pass_status"] == "incomplete"

    def test_boundary_exact_pass_mark_is_pass(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        self._submit_ca(school, offering, student, weight=40, raw_score=Decimal("50"))  # CA = 20
        director = self._exams_director(school)
        _login(api_client, director)

        api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "50"}]},  # exam = 30 -> final = 50
            format="json",
        )
        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert Decimal(row["final_score"]) == Decimal("50.00")
        assert row["pass_status"] == "pass"

    def test_boundary_exact_near_pass_margin_is_near_pass(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        self._submit_ca(school, offering, student, weight=40, raw_score=Decimal("50"))  # CA = 20
        director = self._exams_director(school)
        _login(api_client, director)

        # exam contribution 25.00 -> final = 45.00, exactly pass_mark(50) - NEAR_PASS_MARGIN(5)
        api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "41.67"}]},
            format="json",
        )
        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert Decimal(row["final_score"]) == Decimal("45.00")
        assert row["pass_status"] == "near_pass"

    def test_decimal_scores_handled_correctly(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        self._submit_ca(school, offering, student, weight=40, raw_score=Decimal("67.5"))  # CA = 27.00
        director = self._exams_director(school)
        _login(api_client, director)

        api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "62.5"}]},  # exam = 37.50
            format="json",
        )
        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/results/")
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert Decimal(row["ca_contribution"]) == Decimal("27.00")
        assert Decimal(row["exam_contribution"]) == Decimal("37.50")
        assert Decimal(row["final_score"]) == Decimal("64.50")

    def test_exam_score_cannot_exceed_max(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        director = self._exams_director(school)
        _login(api_client, director)

        response = api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "150"}]},
            format="json",
        )
        assert response.status_code == 400

    def test_negative_exam_score_rejected(self, api_client):
        school, _ = _principal()
        offering, _teacher = self._setup(school)
        student = self._enroll(school, offering)
        director = self._exams_director(school)
        _login(api_client, director)

        response = api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(student.id), "exam_score": "-1"}]},
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_enter_score_for_unenrolled_student(self, api_client):
        from tests.factories import StudentFactory

        school, _ = _principal()
        offering, _teacher = self._setup(school)
        not_enrolled = StudentFactory(school=school, current_class=offering.school_class)
        director = self._exams_director(school)
        _login(api_client, director)

        response = api_client.post(
            f"/api/v1/academics/subject-offerings/{offering.id}/results/",
            {"entries": [{"student": str(not_enrolled.id), "exam_score": "50"}]},
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_view_results_for_another_schools_offering(self, api_client):
        school_a, _ = _principal()
        school_b, _ = _principal()
        offering_b, _teacher_b = self._setup(school_b)
        director_a = self._exams_director(school_a)
        _login(api_client, director_a)

        response = api_client.get(f"/api/v1/academics/subject-offerings/{offering_b.id}/results/")
        assert response.status_code == 404


class TestTermResultsClassPositionsAndPromotion:
    """Phase 7 — Term Results, Class Positions & Promotion. Term Percentage averages Final
    Subject Scores (Phase 6) across every subject a student takes in one term; Overall %
    averages Term Percentage across however many terms the school actually configured (never
    hard-coded to three); promotion compares Overall % to the school's own
    promotion_threshold_percent and respects the class's own is_public_exam_transition flag."""

    def _setup_multi_subject_term(self, school):
        """One class/term/year with TWO subject offerings — for Term Percentage's
        "average across subjects" rule."""
        from tests.factories import StaffFactory, SubjectFactory, SubjectOfferingFactory, TermFactory

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        math = SubjectFactory(school=school, name="Mathematics")
        english = SubjectFactory(school=school, name="English")
        offering_math = SubjectOfferingFactory(
            school=school, subject=math, academic_year=year, term=term, school_class=school_class,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )
        offering_english = SubjectOfferingFactory(
            school=school, subject=english, academic_year=year, term=term, school_class=school_class,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )
        return year, term, school_class, [offering_math, offering_english]

    def _setup_multi_term(self, school, num_terms=2):
        """One class/year with `num_terms` terms, each carrying its own single-subject
        offering — for Overall %'s "average across however many terms" rule."""
        from tests.factories import StaffFactory, SubjectFactory, SubjectOfferingFactory, TermFactory

        year = AcademicYearFactory(school=school)
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        subject = SubjectFactory(school=school, name="Mathematics")
        terms, offerings = [], []
        for i in range(num_terms):
            term = TermFactory(school=school, academic_year=year, sequence=i + 1, name=f"Term {i + 1}")
            offering = SubjectOfferingFactory(
                school=school, subject=subject, academic_year=year, term=term, school_class=school_class,
                main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
            )
            terms.append(term)
            offerings.append(offering)
        return year, school_class, terms, offerings

    def _grade(self, school, offering, student, *, ca_raw, exam_raw):
        from tests.factories import AssessmentFactory, StudentSubjectEnrollmentFactory

        from apps.academics.services import enter_subject_exam_score, save_assessment_scores

        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        if ca_raw is not None:
            assessment = AssessmentFactory(
                school=school, subject_offering=offering, weight=offering.ca_weight_percent, max_score=Decimal("100")
            )
            save_assessment_scores(assessment, entries=[{"student": student, "raw_score": ca_raw}], submit=True)
        if exam_raw is not None:
            enter_subject_exam_score(offering, student=student, exam_score=exam_raw, entered_by=None)

    def test_term_percentage_averages_across_subjects(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        _year, _term, school_class, (math, english) = self._setup_multi_subject_term(school)
        student = StudentFactory(school=school, current_class=school_class)
        self._grade(school, math, student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))  # final = 80
        self._grade(school, english, student, ca_raw=Decimal("40"), exam_raw=Decimal("40"))  # final = 40
        _login(api_client, principal)

        response = api_client.get(f"/api/v1/academics/classes/{school_class.id}/term-results/?term={_term.id}")
        assert response.status_code == 200, response.data
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert Decimal(row["term_percentage"]) == Decimal("60.00")

    def test_overall_result_shows_none_when_a_subject_is_incomplete(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        _year, _term, school_class, (math, english) = self._setup_multi_subject_term(school)
        student = StudentFactory(school=school, current_class=school_class)
        self._grade(school, math, student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))
        self._grade(school, english, student, ca_raw=Decimal("40"), exam_raw=None)  # exam missing
        _login(api_client, principal)

        response = api_client.get(
            f"/api/v1/academics/classes/{school_class.id}/overall-results/?academic_year={_year.id}"
        )
        assert response.status_code == 200, response.data
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert row["overall_percent"] is None

    def test_class_position_ranking_with_ties(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        _year, _term, school_class, (math, _english) = self._setup_multi_subject_term(school)
        top_a = StudentFactory(school=school, current_class=school_class, first_name="TopA")
        top_b = StudentFactory(school=school, current_class=school_class, first_name="TopB")
        third = StudentFactory(school=school, current_class=school_class, first_name="Third")
        self._grade(school, math, top_a, ca_raw=Decimal("90"), exam_raw=Decimal("90"))
        self._grade(school, math, top_b, ca_raw=Decimal("90"), exam_raw=Decimal("90"))
        self._grade(school, math, third, ca_raw=Decimal("85"), exam_raw=Decimal("85"))
        _login(api_client, principal)

        response = api_client.get(f"/api/v1/academics/classes/{school_class.id}/term-results/?term={_term.id}")
        assert response.status_code == 200, response.data
        positions = {row["student"]: row["position"] for row in response.data["rows"]}
        assert positions[str(top_a.id)] == 1
        assert positions[str(top_b.id)] == 1
        assert positions[str(third.id)] == 3

    def test_students_with_incomplete_term_percentage_excluded_from_ranking(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        _year, _term, school_class, (math, english) = self._setup_multi_subject_term(school)
        graded = StudentFactory(school=school, current_class=school_class)
        incomplete = StudentFactory(school=school, current_class=school_class)
        self._grade(school, math, graded, ca_raw=Decimal("80"), exam_raw=Decimal("80"))
        self._grade(school, math, incomplete, ca_raw=Decimal("80"), exam_raw=None)
        _login(api_client, principal)

        response = api_client.get(f"/api/v1/academics/classes/{school_class.id}/term-results/?term={_term.id}")
        assert response.status_code == 200
        student_ids = [row["student"] for row in response.data["rows"]]
        assert str(graded.id) in student_ids
        assert str(incomplete.id) not in student_ids

    def test_overall_percentage_averages_across_terms(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=2)
        student = StudentFactory(school=school, current_class=school_class)
        self._grade(school, offerings[0], student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))  # term1 = 80
        self._grade(school, offerings[1], student, ca_raw=Decimal("60"), exam_raw=Decimal("60"))  # term2 = 60
        _login(api_client, principal)

        response = api_client.get(
            f"/api/v1/academics/classes/{school_class.id}/overall-results/?academic_year={year.id}"
        )
        assert response.status_code == 200, response.data
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert Decimal(row["overall_percent"]) == Decimal("70.00")

    def test_overall_percentage_none_when_any_term_incomplete(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=2)
        student = StudentFactory(school=school, current_class=school_class)
        self._grade(school, offerings[0], student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))
        # term2: never even enrolled/graded
        _login(api_client, principal)

        response = api_client.get(
            f"/api/v1/academics/classes/{school_class.id}/overall-results/?academic_year={year.id}"
        )
        assert response.status_code == 200, response.data
        row = next(r for r in response.data["rows"] if r["student"] == str(student.id))
        assert row["overall_percent"] is None

    def test_promoted_when_overall_meets_threshold(self, api_client):
        from tests.factories import SchoolClassFactory as _SchoolClassFactory
        from tests.factories import StudentFactory

        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=1)
        next_class = _SchoolClassFactory(school=school, name="Grade 2")
        school_class.next_class = next_class
        school_class.save(update_fields=["next_class"])
        target_year = AcademicYearFactory(school=school, name="Next Year")

        student = StudentFactory(school=school, current_class=school_class, current_academic_year=year)
        self._grade(school, offerings[0], student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))  # 80 >= 50
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        student.refresh_from_db()
        assert student.current_class_id == next_class.id
        assert student.current_academic_year_id == target_year.id

        from apps.academics.models import PromotionRecord

        record = PromotionRecord.unscoped_objects.get(student=student, previous_academic_year=year)
        assert record.status == PromotionRecord.Status.PROMOTED
        assert record.type == PromotionRecord.Type.NORMAL
        assert record.overall_percent == Decimal("80.00")
        assert record.new_class_id == next_class.id

    def test_repeated_when_below_threshold_stays_in_class_but_year_advances(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=1)
        target_year = AcademicYearFactory(school=school, name="Next Year")

        student = StudentFactory(school=school, current_class=school_class, current_academic_year=year)
        self._grade(school, offerings[0], student, ca_raw=Decimal("30"), exam_raw=Decimal("30"))  # 30 < 50
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        student.refresh_from_db()
        assert student.current_class_id == school_class.id
        assert student.current_academic_year_id == target_year.id

        from apps.academics.models import PromotionRecord

        record = PromotionRecord.unscoped_objects.get(student=student, previous_academic_year=year)
        assert record.status == PromotionRecord.Status.REPEATED

    def test_boundary_exact_threshold_is_promoted(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=1)
        target_year = AcademicYearFactory(school=school, name="Next Year")

        student = StudentFactory(school=school, current_class=school_class, current_academic_year=year)
        self._grade(school, offerings[0], student, ca_raw=Decimal("50"), exam_raw=Decimal("50"))  # exactly 50
        _login(api_client, principal)

        api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )

        from apps.academics.models import PromotionRecord

        record = PromotionRecord.unscoped_objects.get(student=student, previous_academic_year=year)
        assert record.overall_percent == Decimal("50.00")
        assert record.status == PromotionRecord.Status.PROMOTED

    def test_public_exam_transition_class_creates_pending_record_without_advancing(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=1)
        school_class.is_public_exam_transition = True
        school_class.save(update_fields=["is_public_exam_transition"])
        target_year = AcademicYearFactory(school=school, name="Next Year")

        student = StudentFactory(school=school, current_class=school_class, current_academic_year=year)
        self._grade(school, offerings[0], student, ca_raw=Decimal("90"), exam_raw=Decimal("90"))
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        student.refresh_from_db()
        assert student.current_class_id == school_class.id
        assert student.current_academic_year_id == year.id  # unchanged — nothing auto-advances

        from apps.academics.models import PromotionRecord

        record = PromotionRecord.unscoped_objects.get(student=student, previous_academic_year=year)
        assert record.status == PromotionRecord.Status.PUBLIC_EXAM_REQUIRED
        assert record.type == PromotionRecord.Type.PUBLIC_EXAM
        assert record.new_class is None
        assert record.new_academic_year is None
        assert record.external_exam_status == PromotionRecord.ExternalExamStatus.PENDING

    def test_manual_promote_resolves_pending_public_exam_record(self, api_client):
        from tests.factories import SchoolClassFactory as _SchoolClassFactory
        from tests.factories import StudentFactory

        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=1)
        school_class.is_public_exam_transition = True
        school_class.save(update_fields=["is_public_exam_transition"])
        next_class = _SchoolClassFactory(school=school, name="SSS 1")
        target_year = AcademicYearFactory(school=school, name="Next Year")

        student = StudentFactory(school=school, current_class=school_class, current_academic_year=year)
        self._grade(school, offerings[0], student, ca_raw=Decimal("90"), exam_raw=Decimal("90"))
        _login(api_client, principal)

        api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )

        response = api_client.post(
            "/api/v1/academics/promotions/manual-promote/",
            {
                "student": str(student.id), "new_class": str(next_class.id),
                "new_academic_year": str(target_year.id), "status": "promoted",
                "external_exam_status": "passed",
            },
            format="json",
        )
        assert response.status_code == 200, response.data
        student.refresh_from_db()
        assert student.current_class_id == next_class.id
        assert student.current_academic_year_id == target_year.id

        from apps.academics.models import PromotionRecord

        records = PromotionRecord.unscoped_objects.filter(student=student).order_by("created_at")
        assert records.count() == 2
        assert records[0].status == PromotionRecord.Status.PUBLIC_EXAM_REQUIRED
        assert records[1].status == PromotionRecord.Status.PROMOTED
        assert records[1].type == PromotionRecord.Type.MANUAL
        assert records[1].external_exam_status == PromotionRecord.ExternalExamStatus.PASSED

    def test_manual_promote_requires_pending_public_exam_record(self, api_client):
        from tests.factories import SchoolClassFactory as _SchoolClassFactory
        from tests.factories import StudentFactory

        school, principal = _principal()
        student = StudentFactory(school=school)
        next_class = _SchoolClassFactory(school=school)
        target_year = AcademicYearFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/promotions/manual-promote/",
            {
                "student": str(student.id), "new_class": str(next_class.id),
                "new_academic_year": str(target_year.id), "status": "promoted",
                "external_exam_status": "passed",
            },
            format="json",
        )
        assert response.status_code == 400

    def test_bulk_promote_is_idempotent_skips_already_decided(self, api_client):
        from tests.factories import StudentFactory

        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=1)
        target_year = AcademicYearFactory(school=school, name="Next Year")

        # Below threshold -> REPEATED, which (unlike PROMOTED) keeps the student in
        # `school_class` — so a second run's queryset still finds them, genuinely exercising
        # the already-decided skip guard rather than the student simply no longer matching.
        student = StudentFactory(school=school, current_class=school_class, current_academic_year=year)
        self._grade(school, offerings[0], student, ca_raw=Decimal("30"), exam_raw=Decimal("30"))
        _login(api_client, principal)

        payload = {
            "school_class": str(school_class.id), "academic_year": str(year.id),
            "target_academic_year": str(target_year.id),
        }
        first = api_client.post("/api/v1/academics/promotions/bulk-promote/", payload, format="json")
        assert first.data["skipped_count"] == 0

        second = api_client.post("/api/v1/academics/promotions/bulk-promote/", payload, format="json")
        assert second.data["skipped_count"] == 1

        from apps.academics.models import PromotionRecord

        assert PromotionRecord.unscoped_objects.filter(student=student, previous_academic_year=year).count() == 1

    def test_teacher_cannot_bulk_promote(self, api_client):
        school, _ = _principal()
        year, school_class, terms, offerings = self._setup_multi_term(school, num_terms=1)
        target_year = AcademicYearFactory(school=school, name="Next Year")
        teacher_user = UserFactory(school=school)
        assign_role(user=teacher_user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher_user)

        response = api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )
        assert response.status_code == 403

    def test_teacher_can_view_class_term_results(self, api_client):
        school, _ = _principal()
        _year, term, school_class, (math, _english) = self._setup_multi_subject_term(school)
        teacher_user = UserFactory(school=school)
        assign_role(user=teacher_user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher_user)

        response = api_client.get(f"/api/v1/academics/classes/{school_class.id}/term-results/?term={term.id}")
        assert response.status_code == 200

    def test_cannot_view_term_results_for_another_schools_class(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        _year, term_b, school_class_b, _offerings = self._setup_multi_subject_term(school_b)
        _login(api_client, principal_a)

        response = api_client.get(
            f"/api/v1/academics/classes/{school_class_b.id}/term-results/?term={term_b.id}"
        )
        assert response.status_code == 404


class TestResultPublicationAndAcademicHistory:
    """Phase 8 — Result Publication & Academic History. Students never see a term's computed
    results until an admin/exams-director explicitly publishes them; a locked result is
    terminal; a published result keeps the class/term it was actually published for even after
    the student is later promoted — "never overwrite previous academic records.\""""

    def _setup(self, school):
        from tests.factories import (
            StaffFactory,
            StudentFactory,
            StudentSubjectEnrollmentFactory,
            SubjectFactory,
            SubjectOfferingFactory,
            TermFactory,
        )

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        subject = SubjectFactory(school=school, name="Mathematics")
        offering = SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term, school_class=school_class,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )
        student = StudentFactory(school=school, current_class=school_class, current_academic_year=year)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        return year, term, school_class, offering, student

    def _grade_complete(self, school, offering, student, *, ca_raw=Decimal("80"), exam_raw=Decimal("80")):
        from tests.factories import AssessmentFactory

        from apps.academics.services import enter_subject_exam_score, save_assessment_scores

        assessment = AssessmentFactory(
            school=school, subject_offering=offering, weight=offering.ca_weight_percent, max_score=Decimal("100")
        )
        save_assessment_scores(assessment, entries=[{"student": student, "raw_score": ca_raw}], submit=True)
        enter_subject_exam_score(offering, student=student, exam_score=exam_raw, entered_by=None)

    def _verify_and_publish(self, api_client, school_class, term, student_ids=None):
        body = {"school_classes": [str(school_class.id)], "term": str(term.id)}
        if student_ids:
            body["student_ids"] = student_ids
        api_client.post("/api/v1/academics/results/verify/", body, format="json")
        return api_client.post("/api/v1/academics/results/publish/", body, format="json")

    def test_student_cannot_see_unpublished_result(self, api_client):
        school, _ = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student)
        _login(api_client, student.user)

        response = api_client.get(f"/api/v1/academics/my-results/classes/{school_class.id}/terms/{term.id}/")
        assert response.status_code == 404

        list_response = api_client.get("/api/v1/academics/my-results/")
        assert list_response.status_code == 200
        assert list_response.data["results"] == []

    def test_student_can_see_published_result(self, api_client):
        school, principal = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))
        _login(api_client, principal)
        publish_response = self._verify_and_publish(api_client, school_class, term)
        assert publish_response.status_code == 200, publish_response.data
        assert publish_response.data["processed_count"] == 1

        _login(api_client, student.user)
        response = api_client.get(f"/api/v1/academics/my-results/classes/{school_class.id}/terms/{term.id}/")
        assert response.status_code == 200, response.data
        assert response.data["subjects"][0]["final_score"] == "80.00"  # 80/100*40 + 80/100*60
        assert response.data["term_percentage"] == "80.00"

        list_response = api_client.get("/api/v1/academics/my-results/")
        assert len(list_response.data["results"]) == 1

    def test_verify_requires_complete_data(self, api_client):
        school, principal = _principal()
        _year, term, school_class, _offering, student = self._setup(school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/results/verify/",
            {"school_classes": [str(school_class.id)], "term": str(term.id)},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["processed_count"] == 0
        assert response.data["skipped_count"] == 1

        from apps.academics.models import TermResultPublication

        pub = TermResultPublication.unscoped_objects.get(student=student, school_class=school_class, term=term)
        # The student IS enrolled in one subject (via _setup) but nothing has been graded yet —
        # that's IN_PROGRESS, not DRAFT (DRAFT is reserved for zero enrolled subjects at all).
        assert pub.status == TermResultPublication.Status.IN_PROGRESS

    def test_publish_requires_verified(self, api_client):
        school, principal = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/results/publish/",
            {"school_classes": [str(school_class.id)], "term": str(term.id)},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["processed_count"] == 0
        assert response.data["skipped_count"] == 1

    def test_lock_requires_published_and_is_terminal(self, api_client):
        school, principal = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student)
        _login(api_client, principal)
        self._verify_and_publish(api_client, school_class, term)

        lock_response = api_client.post(
            "/api/v1/academics/results/lock/",
            {"school_classes": [str(school_class.id)], "term": str(term.id)},
            format="json",
        )
        assert lock_response.data["processed_count"] == 1

        from apps.academics.models import TermResultPublication

        pub = TermResultPublication.unscoped_objects.get(student=student, school_class=school_class, term=term)
        assert pub.status == TermResultPublication.Status.LOCKED

        second_publish = api_client.post(
            "/api/v1/academics/results/publish/",
            {"school_classes": [str(school_class.id)], "term": str(term.id)},
            format="json",
        )
        assert second_publish.data["processed_count"] == 0
        assert second_publish.data["skipped_count"] == 1

    def test_student_can_still_see_result_after_it_is_locked(self, api_client):
        """Locking is a terminal state *after* publication (no further edits allowed) — it must
        never roll the result back to invisible for the student it belongs to."""
        school, principal = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student)
        _login(api_client, principal)
        self._verify_and_publish(api_client, school_class, term)
        api_client.post(
            "/api/v1/academics/results/lock/",
            {"school_classes": [str(school_class.id)], "term": str(term.id)},
            format="json",
        )

        _login(api_client, student.user)
        detail_response = api_client.get(f"/api/v1/academics/my-results/classes/{school_class.id}/terms/{term.id}/")
        assert detail_response.status_code == 200, detail_response.data

        list_response = api_client.get("/api/v1/academics/my-results/")
        assert len(list_response.data["results"]) == 1

    def test_historical_result_preserved_after_promotion(self, api_client):
        from tests.factories import SchoolClassFactory as _SchoolClassFactory

        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))
        next_class = _SchoolClassFactory(school=school, name="Grade 2")
        school_class.next_class = next_class
        school_class.save(update_fields=["next_class"])
        target_year = AcademicYearFactory(school=school, name="Next Year")
        _login(api_client, principal)
        self._verify_and_publish(api_client, school_class, term)

        api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )
        student.refresh_from_db()
        assert student.current_class_id == next_class.id

        from apps.academics.models import TermResultPublication

        pub = TermResultPublication.unscoped_objects.get(student=student, term=term)
        assert pub.school_class_id == school_class.id
        assert pub.school_class_id != next_class.id

        _login(api_client, student.user)
        response = api_client.get(f"/api/v1/academics/my-results/classes/{school_class.id}/terms/{term.id}/")
        assert response.status_code == 200
        assert response.data["school_class_name"] == "Grade 1"

    def test_promotion_status_shown_in_report(self, api_client):
        school, principal = _principal()
        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])
        year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student, ca_raw=Decimal("80"), exam_raw=Decimal("80"))
        target_year = AcademicYearFactory(school=school, name="Next Year")
        _login(api_client, principal)

        api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(school_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )

        response = api_client.get(
            f"/api/v1/academics/results/students/{student.id}/classes/{school_class.id}/terms/{term.id}/"
        )
        assert response.status_code == 200, response.data
        assert response.data["promotion_status"] == "promoted"

    def test_tenant_isolation_on_student_term_report(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        _year_b, term_b, school_class_b, offering_b, student_b = self._setup(school_b)
        self._grade_complete(school_b, offering_b, student_b)
        _login(api_client, principal_a)

        response = api_client.get(
            f"/api/v1/academics/results/students/{student_b.id}/classes/{school_class_b.id}/terms/{term_b.id}/"
        )
        assert response.status_code == 404

    def test_teacher_can_view_but_not_publish(self, api_client):
        school, _ = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student)
        teacher_user = UserFactory(school=school)
        assign_role(user=teacher_user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher_user)

        view_response = api_client.get(
            f"/api/v1/academics/results/students/{student.id}/classes/{school_class.id}/terms/{term.id}/"
        )
        assert view_response.status_code == 200

        publish_response = api_client.post(
            "/api/v1/academics/results/publish/",
            {"school_classes": [str(school_class.id)], "term": str(term.id)},
            format="json",
        )
        assert publish_response.status_code == 403

    def test_publish_creates_notification(self, api_client):
        school, principal = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student)
        _login(api_client, principal)
        self._verify_and_publish(api_client, school_class, term)

        from apps.notifications.models import Notification

        assert Notification.unscoped_objects.filter(recipient=student.user, category="result_published").exists()

    def test_audit_log_entries_created_for_verify_publish_lock(self, api_client):
        school, principal = _principal()
        _year, term, school_class, offering, _student = self._setup(school)
        self._grade_complete(school, offering, _student)
        _login(api_client, principal)
        self._verify_and_publish(api_client, school_class, term)
        api_client.post(
            "/api/v1/academics/results/lock/",
            {"school_classes": [str(school_class.id)], "term": str(term.id)},
            format="json",
        )

        from apps.audit.models import AuditLog

        actions = set(AuditLog.objects.filter(action__startswith="academics.result_").values_list("action", flat=True))
        assert actions == {"academics.result_verified", "academics.result_published", "academics.result_locked"}

    def test_bulk_publish_across_multiple_classes(self, api_client):
        from tests.factories import StudentFactory, StudentSubjectEnrollmentFactory, SubjectOfferingFactory

        school, principal = _principal()
        year, term, school_class_a, offering_a, student_a = self._setup(school)
        school_class_b = SchoolClassFactory(school=school, name="Grade 2")
        offering_b = SubjectOfferingFactory(
            school=school, subject=offering_a.subject, academic_year=year, term=term, school_class=school_class_b,
            main_teacher=offering_a.main_teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )
        student_b = StudentFactory(school=school, current_class=school_class_b, current_academic_year=year)
        student_b.user = UserFactory(school=school)
        student_b.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering_b, student=student_b)
        self._grade_complete(school, offering_a, student_a)
        self._grade_complete(school, offering_b, student_b)
        _login(api_client, principal)

        api_client.post(
            "/api/v1/academics/results/verify/",
            {"school_classes": [str(school_class_a.id), str(school_class_b.id)], "term": str(term.id)},
            format="json",
        )
        response = api_client.post(
            "/api/v1/academics/results/publish/",
            {"school_classes": [str(school_class_a.id), str(school_class_b.id)], "term": str(term.id)},
            format="json",
        )
        assert response.data["processed_count"] == 2

    def test_individual_publish_targets_specific_student_regardless_of_current_class(self, api_client):
        from tests.factories import SchoolClassFactory as _SchoolClassFactory

        school, principal = _principal()
        _year, term, school_class, offering, student = self._setup(school)
        self._grade_complete(school, offering, student)
        next_class = _SchoolClassFactory(school=school, name="Grade 2")
        # Simulate the student having already moved on to a different current_class by the time
        # an admin comes back to individually publish this specific historical result.
        student.current_class = next_class
        student.save(update_fields=["current_class"])
        _login(api_client, principal)

        response = self._verify_and_publish(api_client, school_class, term, student_ids=[str(student.id)])
        assert response.data["processed_count"] == 1


class TestSubjectMaterialsAndMessaging:
    """Phase 9 — Subject Materials, Messaging & Notifications. Materials/general messages reach
    only currently-enrolled students; private threads are strictly two-party (the offering's
    teacher and one specific enrolled student) with every id re-verified server-side — "never
    trust frontend IDs.\""""

    def _setup(self, school):
        from tests.factories import (
            StaffFactory,
            StudentFactory,
            StudentSubjectEnrollmentFactory,
            SubjectFactory,
            SubjectOfferingFactory,
            TermFactory,
        )

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        school_class = SchoolClassFactory(school=school, name="Grade 1")
        teacher = StaffFactory(school=school)
        subject = SubjectFactory(school=school, name="Mathematics")
        offering = SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term, school_class=school_class,
            main_teacher=teacher,
        )
        student = StudentFactory(school=school, current_class=school_class)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        return offering, teacher, student

    def test_teacher_can_upload_material_and_enrolled_student_can_access(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile

        school, _ = _principal()
        offering, teacher, student = self._setup(school)
        _login(api_client, teacher.user)

        file = SimpleUploadedFile("notes.pdf", b"%PDF-1.4 fake content", content_type="application/pdf")
        response = api_client.post(
            "/api/v1/academics/subject-materials/",
            {"subject_offering": str(offering.id), "title": "Chapter 1 Notes", "file": file},
            format="multipart",
        )
        assert response.status_code == 201, response.data

        _login(api_client, student.user)
        list_response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/materials/")
        assert list_response.status_code == 200
        assert len(list_response.data["materials"]) == 1
        assert list_response.data["materials"][0]["title"] == "Chapter 1 Notes"

    def test_admin_cannot_upload_or_see_material_for_a_subject_they_dont_teach(self, api_client):
        """Materials are private to the subject's own teacher and its enrolled students, not
        visible to a Principal/School Administrator just because they hold academics.update -
        see SubjectMaterialViewSet.get_queryset's docstring."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        school, principal = _principal()
        offering, _teacher, _student = self._setup(school)
        _login(api_client, principal)

        file = SimpleUploadedFile("notes.pdf", b"%PDF-1.4 fake content", content_type="application/pdf")
        response = api_client.post(
            "/api/v1/academics/subject-materials/",
            {"subject_offering": str(offering.id), "title": "Admin notes", "file": file},
            format="multipart",
        )
        assert response.status_code == 403

        listing = api_client.get("/api/v1/academics/subject-materials/", {"subject_offering": str(offering.id)})
        assert listing.status_code == 200
        assert listing.data["results"] == []

    def test_teacher_not_teaching_subject_cannot_upload_material(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from tests.factories import StaffFactory

        school, _ = _principal()
        offering, _teacher, _student = self._setup(school)
        other_teacher = StaffFactory(school=school)
        assign_role(user=other_teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, other_teacher.user)

        file = SimpleUploadedFile("notes.pdf", b"%PDF-1.4 fake content", content_type="application/pdf")
        response = api_client.post(
            "/api/v1/academics/subject-materials/",
            {"subject_offering": str(offering.id), "title": "Notes", "file": file},
            format="multipart",
        )
        assert response.status_code == 403

    def test_material_upload_notifies_enrolled_students(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile

        school, _ = _principal()
        offering, teacher, student = self._setup(school)
        _login(api_client, teacher.user)

        file = SimpleUploadedFile("notes.pdf", b"%PDF-1.4 fake content", content_type="application/pdf")
        api_client.post(
            "/api/v1/academics/subject-materials/",
            {"subject_offering": str(offering.id), "title": "Notes", "file": file},
            format="multipart",
        )

        from apps.notifications.models import Notification

        assert Notification.unscoped_objects.filter(recipient=student.user, category="subject_material").exists()

    def test_non_enrolled_student_cannot_access_materials(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from tests.factories import StudentFactory

        from apps.academics.models import SubjectMaterial

        school, _ = _principal()
        offering, teacher, _enrolled_student = self._setup(school)
        SubjectMaterial.objects.create(
            school=school, subject_offering=offering, title="Secret notes",
            file=SimpleUploadedFile("x.pdf", b"data"), uploaded_by=teacher.user,
        )
        outsider = StudentFactory(school=school)
        outsider.user = UserFactory(school=school)
        outsider.save(update_fields=["user"])
        _login(api_client, outsider.user)

        response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/materials/")
        assert response.status_code == 404

    def test_teacher_can_send_general_message_and_enrolled_student_receives_notification(self, api_client):
        school, _ = _principal()
        offering, teacher, student = self._setup(school)
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/academics/subject-messages/",
            {"subject_offering": str(offering.id), "body": "Test is next week."},
            format="json",
        )
        assert response.status_code == 201, response.data

        from apps.notifications.models import Notification

        assert Notification.unscoped_objects.filter(recipient=student.user, category="subject_message").exists()

        _login(api_client, student.user)
        list_response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/messages/")
        assert list_response.status_code == 200
        assert len(list_response.data["messages"]) == 1

    def test_teacher_can_start_private_thread_with_enrolled_student(self, api_client):
        school, _ = _principal()
        offering, teacher, student = self._setup(school)
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/academics/subject-private-messages/",
            {"subject_offering": str(offering.id), "student": str(student.id), "body": "Please see me after class."},
            format="json",
        )
        assert response.status_code == 201, response.data

        from apps.notifications.models import Notification

        assert Notification.unscoped_objects.filter(
            recipient=student.user, category="subject_private_message"
        ).exists()

    def test_teacher_cannot_message_unenrolled_student(self, api_client):
        from tests.factories import StudentFactory

        school, _ = _principal()
        offering, teacher, _student = self._setup(school)
        outsider = StudentFactory(school=school)
        _login(api_client, teacher.user)

        response = api_client.post(
            "/api/v1/academics/subject-private-messages/",
            {"subject_offering": str(offering.id), "student": str(outsider.id), "body": "Hi"},
            format="json",
        )
        assert response.status_code == 400

    def test_student_can_reply_to_private_thread(self, api_client):
        school, _ = _principal()
        offering, teacher, student = self._setup(school)
        _login(api_client, teacher.user)
        api_client.post(
            "/api/v1/academics/subject-private-messages/",
            {"subject_offering": str(offering.id), "student": str(student.id), "body": "See me after class."},
            format="json",
        )

        _login(api_client, student.user)
        response = api_client.post(
            f"/api/v1/academics/my-subjects/{offering.id}/private-messages/",
            {"body": "Okay, will do!"},
            format="json",
        )
        assert response.status_code == 200, response.data

        from apps.notifications.models import Notification

        assert Notification.unscoped_objects.filter(
            recipient=teacher.user, category="subject_private_message"
        ).exists()

        list_response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/private-messages/")
        assert list_response.status_code == 200
        assert len(list_response.data["messages"]) == 2

    def test_student_cannot_view_private_messages_for_unenrolled_subject(self, api_client):
        from tests.factories import StudentFactory

        school, _ = _principal()
        offering, _teacher, _student = self._setup(school)
        outsider = StudentFactory(school=school)
        outsider.user = UserFactory(school=school)
        outsider.save(update_fields=["user"])
        _login(api_client, outsider.user)

        response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/private-messages/")
        assert response.status_code == 404

    def test_student_cannot_see_another_students_private_thread(self, api_client):
        from tests.factories import StudentFactory, StudentSubjectEnrollmentFactory

        school, _ = _principal()
        offering, teacher, student_a = self._setup(school)
        student_b = StudentFactory(school=school, current_class=offering.school_class)
        student_b.user = UserFactory(school=school)
        student_b.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student_b)
        _login(api_client, teacher.user)
        api_client.post(
            "/api/v1/academics/subject-private-messages/",
            {"subject_offering": str(offering.id), "student": str(student_a.id), "body": "Message for A only"},
            format="json",
        )

        _login(api_client, student_b.user)
        response = api_client.get(f"/api/v1/academics/my-subjects/{offering.id}/private-messages/")
        assert response.status_code == 200
        assert response.data["messages"] == []

    def test_cannot_upload_material_for_another_schools_offering(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile

        school_a, principal_a = _principal()
        school_b, _ = _principal()
        offering_b, _teacher_b, _student_b = self._setup(school_b)
        _login(api_client, principal_a)

        file = SimpleUploadedFile("notes.pdf", b"data", content_type="application/pdf")
        response = api_client.post(
            "/api/v1/academics/subject-materials/",
            {"subject_offering": str(offering_b.id), "title": "Notes", "file": file},
            format="multipart",
        )
        assert response.status_code == 400

    def test_disallowed_file_type_rejected(self, api_client):
        """Phase 10 security audit: the shared upload allowlist (apps.common.validators) must
        actually be wired through to this serializer, not just declared on the model field and
        silently skipped."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        school, _ = _principal()
        offering, teacher, _student = self._setup(school)
        _login(api_client, teacher.user)

        file = SimpleUploadedFile("virus.exe", b"MZ fake executable", content_type="application/octet-stream")
        response = api_client.post(
            "/api/v1/academics/subject-materials/",
            {"subject_offering": str(offering.id), "title": "Suspicious", "file": file},
            format="multipart",
        )
        assert response.status_code == 400


class TestGraduationStatus:
    """Phase 10 — graduation eligibility derived from the school's own configured
    is_graduation_level class(es) and the student's actual PromotionRecord history — never a
    hard-coded number of levels."""

    def _setup_graduating_flow(self, school):
        from tests.factories import StaffFactory, StudentFactory, StudentSubjectEnrollmentFactory, SubjectFactory, SubjectOfferingFactory, TermFactory

        from apps.academics.services import enter_subject_exam_score, save_assessment_scores

        school.promotion_threshold_percent = 50
        school.save(update_fields=["promotion_threshold_percent"])

        year = AcademicYearFactory(school=school)
        term = TermFactory(school=school, academic_year=year)
        final_class = SchoolClassFactory(school=school, name="Grade 12", is_graduation_level=True)
        teacher = StaffFactory(school=school)
        subject = SubjectFactory(school=school, name="Mathematics")
        offering = SubjectOfferingFactory(
            school=school, subject=subject, academic_year=year, term=term, school_class=final_class,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )
        student = StudentFactory(school=school, current_class=final_class, current_academic_year=year)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        StudentSubjectEnrollmentFactory(school=school, subject_offering=offering, student=student)

        from tests.factories import AssessmentFactory

        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=40, max_score=Decimal("100"))
        save_assessment_scores(assessment, entries=[{"student": student, "raw_score": Decimal("90")}], submit=True)
        enter_subject_exam_score(offering, student=student, exam_score=Decimal("90"), entered_by=None)

        return year, final_class, student

    def test_student_in_graduation_level_but_not_yet_promoted_out_has_not_graduated(self, api_client):
        school, principal = _principal()
        _year, final_class, student = self._setup_graduating_flow(school)
        _login(api_client, principal)

        response = api_client.get(f"/api/v1/academics/students/{student.id}/graduation-status/")
        assert response.status_code == 200, response.data
        assert response.data["current_class_name"] == "Grade 12"
        assert response.data["is_in_graduation_level"] is True
        assert response.data["has_graduated"] is False

    def test_student_promoted_out_of_graduation_level_class_has_graduated(self, api_client):
        school, principal = _principal()
        year, final_class, student = self._setup_graduating_flow(school)
        target_year = AcademicYearFactory(school=school, name="Next Year")
        _login(api_client, principal)

        api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(final_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )

        response = api_client.get(f"/api/v1/academics/students/{student.id}/graduation-status/")
        assert response.status_code == 200, response.data
        assert response.data["has_graduated"] is True
        assert response.data["graduated_at"] is not None
        assert len(response.data["history"]) == 1
        assert response.data["history"][0]["status"] == "promoted"

    def test_student_can_view_own_graduation_status(self, api_client):
        school, principal = _principal()
        year, final_class, student = self._setup_graduating_flow(school)
        target_year = AcademicYearFactory(school=school, name="Next Year")
        _login(api_client, principal)
        api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(final_class.id), "academic_year": str(year.id),
                "target_academic_year": str(target_year.id),
            },
            format="json",
        )

        _login(api_client, student.user)
        response = api_client.get("/api/v1/academics/my-graduation-status/")
        assert response.status_code == 200, response.data
        assert response.data["has_graduated"] is True

    def test_teacher_can_view_students_graduation_status(self, api_client):
        school, _ = _principal()
        _year, _final_class, student = self._setup_graduating_flow(school)
        teacher_user = UserFactory(school=school)
        assign_role(user=teacher_user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher_user)

        response = api_client.get(f"/api/v1/academics/students/{student.id}/graduation-status/")
        assert response.status_code == 200

    def test_cannot_view_another_schools_student_graduation_status(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        _year_b, _final_class_b, student_b = self._setup_graduating_flow(school_b)
        _login(api_client, principal_a)

        response = api_client.get(f"/api/v1/academics/students/{student_b.id}/graduation-status/")
        assert response.status_code == 404


class TestFullSchoolYearSimulation:
    """Phase 10's explicit final check: "a complete school year including a repeating student, a
    public-exam-transition class, and two-school tenant isolation" — one end-to-end walk through
    every phase's real API, backend, and database together, not a unit-level check of any single
    piece in isolation."""

    def test_full_year_simulation(self, api_client):
        from tests.factories import (
            AssessmentFactory,
            StaffFactory,
            StudentFactory,
            StudentSubjectEnrollmentFactory,
            SubjectFactory,
            SubjectOfferingFactory,
            TermFactory,
        )

        from apps.academics.models import PromotionRecord
        from apps.academics.services import enter_subject_exam_score, save_assessment_scores

        # ---- School A: normal promotion + repeating student in the same class/term ----
        school_a, principal_a = _principal()
        school_a.promotion_threshold_percent = 50
        school_a.save(update_fields=["promotion_threshold_percent"])
        year = AcademicYearFactory(school=school_a)
        term = TermFactory(school=school_a, academic_year=year)
        next_year = AcademicYearFactory(school=school_a, name="Next Year")

        grade1 = SchoolClassFactory(school=school_a, name="Grade 1")
        grade2 = SchoolClassFactory(school=school_a, name="Grade 2")
        grade1.next_class = grade2
        grade1.save(update_fields=["next_class"])
        teacher = StaffFactory(school=school_a)
        subject = SubjectFactory(school=school_a, name="Mathematics")
        offering = SubjectOfferingFactory(
            school=school_a, subject=subject, academic_year=year, term=term, school_class=grade1,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )

        passing_student = StudentFactory(school=school_a, current_class=grade1, current_academic_year=year)
        passing_student.user = UserFactory(school=school_a)
        passing_student.save(update_fields=["user"])
        failing_student = StudentFactory(school=school_a, current_class=grade1, current_academic_year=year)

        StudentSubjectEnrollmentFactory(school=school_a, subject_offering=offering, student=passing_student)
        StudentSubjectEnrollmentFactory(school=school_a, subject_offering=offering, student=failing_student)

        for student, ca, exam in [(passing_student, Decimal("80"), Decimal("80")), (failing_student, Decimal("20"), Decimal("20"))]:
            assessment = AssessmentFactory(school=school_a, subject_offering=offering, weight=40, max_score=Decimal("100"))
            save_assessment_scores(assessment, entries=[{"student": student, "raw_score": ca}], submit=True)
            enter_subject_exam_score(offering, student=student, exam_score=exam, entered_by=None)

        _login(api_client, principal_a)

        # Verify, publish, and lock this term's results for the whole class.
        body = {"school_classes": [str(grade1.id)], "term": str(term.id)}
        verify_resp = api_client.post("/api/v1/academics/results/verify/", body, format="json")
        assert verify_resp.data["processed_count"] == 2
        publish_resp = api_client.post("/api/v1/academics/results/publish/", body, format="json")
        assert publish_resp.data["processed_count"] == 2
        lock_resp = api_client.post("/api/v1/academics/results/lock/", body, format="json")
        assert lock_resp.data["processed_count"] == 2

        # The passing student can now see their own published, locked result.
        _login(api_client, passing_student.user)
        my_result = api_client.get(f"/api/v1/academics/my-results/classes/{grade1.id}/terms/{term.id}/")
        assert my_result.status_code == 200
        assert my_result.data["term_percentage"] == "80.00"

        # Bulk-promote the whole class.
        _login(api_client, principal_a)
        promote_resp = api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {"school_class": str(grade1.id), "academic_year": str(year.id), "target_academic_year": str(next_year.id)},
            format="json",
        )
        assert promote_resp.status_code == 200

        passing_student.refresh_from_db()
        failing_student.refresh_from_db()
        assert passing_student.current_class_id == grade2.id  # promoted
        assert passing_student.current_academic_year_id == next_year.id
        assert failing_student.current_class_id == grade1.id  # repeating — same class
        assert failing_student.current_academic_year_id == next_year.id  # but a new year

        passing_record = PromotionRecord.unscoped_objects.get(student=passing_student, previous_academic_year=year)
        failing_record = PromotionRecord.unscoped_objects.get(student=failing_student, previous_academic_year=year)
        assert passing_record.status == PromotionRecord.Status.PROMOTED
        assert failing_record.status == PromotionRecord.Status.REPEATED

        # The original term's published result is never overwritten by the later promotion —
        # it still names the class the student actually sat the term in.
        from apps.academics.models import TermResultPublication

        original_result = TermResultPublication.unscoped_objects.get(
            student=passing_student, school_class=grade1, term=term
        )
        assert original_result.school_class_id == grade1.id

        # ---- Public-exam-transition class, same school ----
        transition_class = SchoolClassFactory(school=school_a, name="Grade 9", is_public_exam_transition=True)
        pe_offering = SubjectOfferingFactory(
            school=school_a, subject=subject, academic_year=year, term=term, school_class=transition_class,
            main_teacher=teacher, ca_weight_percent=40, exam_weight_percent=60, pass_mark=50,
        )
        pe_student = StudentFactory(school=school_a, current_class=transition_class, current_academic_year=year)
        StudentSubjectEnrollmentFactory(school=school_a, subject_offering=pe_offering, student=pe_student)
        pe_assessment = AssessmentFactory(school=school_a, subject_offering=pe_offering, weight=40, max_score=Decimal("100"))
        save_assessment_scores(pe_assessment, entries=[{"student": pe_student, "raw_score": Decimal("95")}], submit=True)
        enter_subject_exam_score(pe_offering, student=pe_student, exam_score=Decimal("95"), entered_by=None)

        pe_promote_resp = api_client.post(
            "/api/v1/academics/promotions/bulk-promote/",
            {
                "school_class": str(transition_class.id), "academic_year": str(year.id),
                "target_academic_year": str(next_year.id),
            },
            format="json",
        )
        assert pe_promote_resp.status_code == 200
        pe_student.refresh_from_db()
        assert pe_student.current_class_id == transition_class.id  # unchanged — no internal auto-promotion
        pe_record = PromotionRecord.unscoped_objects.get(student=pe_student, previous_academic_year=year)
        assert pe_record.status == PromotionRecord.Status.PUBLIC_EXAM_REQUIRED

        # ---- School B: completely separate tenant ----
        school_b, principal_b = _principal()
        AcademicYearFactory(school=school_b)
        grade1_b = SchoolClassFactory(school=school_b, name="Grade 1")

        # School A's principal cannot see School B's class in results/promotion endpoints.
        _login(api_client, principal_a)
        cross_tenant_resp = api_client.get(
            f"/api/v1/academics/classes/{grade1_b.id}/term-results/?term={term.id}"
        )
        assert cross_tenant_resp.status_code == 404

        # School B's principal cannot see School A's promotion records. django-filter's
        # auto-generated FK filter validates the id against the *current tenant's* queryset, so
        # a cross-tenant id is rejected outright as "not a valid choice" (400) — safer than
        # silently returning an empty 200, and the actual observed behavior here. Either way, no
        # cross-tenant data may ever be returned.
        _login(api_client, principal_b)
        cross_tenant_records = api_client.get(
            f"/api/v1/academics/promotion-records/?student={passing_student.id}"
        )
        assert cross_tenant_records.status_code in (200, 400)
        if cross_tenant_records.status_code == 200:
            assert cross_tenant_records.data["count"] == 0


class TestSectionClassTeacher:
    def test_section_lists_class_teacher_name(self, api_client):
        from tests.factories import StaffFactory

        school, principal = _principal()
        staff = StaffFactory(school=school)
        section = SectionFactory(school=school, class_teacher=staff)
        _login(api_client, principal)

        response = api_client.get(f"/api/v1/academics/sections/{section.id}/")
        assert response.status_code == 200
        assert response.data["class_teacher_name"] == staff.user.full_name


class TestAcademicYearArchiving:
    def test_archives_a_non_current_year(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school, is_current=False)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/academics/academic-years/{year.id}/archive/")

        assert response.status_code == 200
        year.refresh_from_db()
        assert year.is_archived is True
        assert year.archived_at is not None

    def test_cannot_archive_the_current_year(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school, is_current=True)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/academics/academic-years/{year.id}/archive/")

        assert response.status_code == 400
        year.refresh_from_db()
        assert year.is_archived is False

    def test_cannot_archive_an_already_archived_year(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/academics/academic-years/{year.id}/archive/")

        assert response.status_code == 400

    def test_unarchive_restores_write_access(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/academics/academic-years/{year.id}/unarchive/")

        assert response.status_code == 200
        year.refresh_from_db()
        assert year.is_archived is False
        assert year.archived_at is None

    def test_teacher_without_permission_cannot_archive(self, api_client):
        school, _ = _principal()
        year = AcademicYearFactory(school=school, is_current=False)
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(f"/api/v1/academics/academic-years/{year.id}/archive/")

        assert response.status_code == 403

    def test_cannot_create_a_section_for_an_archived_year(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        school_class = SchoolClassFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/sections/",
            {"school_class": str(school_class.id), "academic_year": str(year.id), "name": "A"},
            format="json",
        )

        assert response.status_code == 400

    def test_cannot_create_a_term_for_an_archived_year(self, api_client):
        school, principal = _principal()
        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/academics/terms/",
            {
                "academic_year": str(year.id),
                "name": "Term 1",
                "sequence": 1,
                "start_date": "2025-09-01",
                "end_date": "2025-12-15",
            },
            format="json",
        )

        assert response.status_code == 400

    def test_can_still_update_a_section_in_a_non_archived_year(self, api_client):
        school, principal = _principal()
        section = SectionFactory(school=school)
        _login(api_client, principal)

        response = api_client.patch(
            f"/api/v1/academics/sections/{section.id}/", {"capacity": 40}, format="json"
        )

        assert response.status_code == 200


class TestEditingAssessments:
    """A teacher can correct their own assessment, and so can an administrator (academics.update);
    other staff can't. Edits recompute the scores already recorded and are refused once CA is closed."""

    def _world(self):
        from tests.factories import AcademicYearFactory, SchoolClassFactory, StaffFactory, SubjectFactory, SubjectOfferingFactory, TermFactory

        school, principal = _principal()
        year = AcademicYearFactory(school=school)
        offering = SubjectOfferingFactory(
            school=school, subject=SubjectFactory(school=school), academic_year=year,
            term=TermFactory(school=school, academic_year=year), school_class=SchoolClassFactory(school=school),
            main_teacher=StaffFactory(school=school), ca_weight_percent=40, exam_weight_percent=60,
        )
        teacher = offering.main_teacher
        assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        return school, principal, offering, teacher

    def _patch(self, api_client, assessment, **payload):
        return api_client.patch(f"/api/v1/academics/assessments/{assessment.id}/", payload, format="json")

    def test_the_teacher_can_edit_name_weight_and_status(self, api_client):
        from tests.factories import AssessmentFactory

        school, _, offering, teacher = self._world()
        assessment = AssessmentFactory(school=school, subject_offering=offering, name="Test 1", weight=20)
        _login(api_client, teacher.user)

        response = self._patch(api_client, assessment, name="Mid-term test", weight=30, status="inactive")

        assert response.status_code == 200, response.data
        assessment.refresh_from_db()
        assert (assessment.name, assessment.weight, assessment.status) == ("Mid-term test", 30, "inactive")

    def test_an_administrator_cannot_edit_it(self, api_client):
        from tests.factories import AssessmentFactory

        school, principal, offering, teacher = self._world()
        assessment = AssessmentFactory(school=school, subject_offering=offering, name="Test 1", weight=20)
        _login(api_client, principal)

        assert self._patch(api_client, assessment, name="Changed").status_code == 403
        assessment.refresh_from_db()
        assert assessment.name == "Test 1"

    def test_the_offering_says_whether_it_is_the_users_own_subject(self, api_client):
        school, principal, offering, teacher = self._world()
        _login(api_client, teacher.user)
        mine = api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/").data
        assert mine["is_my_subject"] is True
        api_client.cookies.clear()
        _login(api_client, principal)
        assert api_client.get(f"/api/v1/academics/subject-offerings/{offering.id}/").data["is_my_subject"] is False

    def test_the_subjects_own_teacher_can_edit(self, api_client):
        from tests.factories import AssessmentFactory

        school, _, offering, teacher = self._world()
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20)
        _login(api_client, teacher.user)
        assert self._patch(api_client, assessment, name="Renamed").status_code == 200

    def test_another_teacher_cannot_edit(self, api_client):
        from tests.factories import AssessmentFactory, StaffFactory

        school, _, offering, _ = self._world()
        outsider = StaffFactory(school=school)
        assign_role(user=outsider.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20)
        _login(api_client, outsider.user)
        # an unrelated teacher can't even see it (404) — never edit it
        assert self._patch(api_client, assessment, name="Hijacked").status_code in (403, 404)
        assessment.refresh_from_db()
        assert assessment.name != "Hijacked"

    def test_changing_the_weight_recomputes_scores_already_recorded(self, api_client):
        from decimal import Decimal

        from tests.factories import AssessmentFactory, AssessmentScoreFactory, StudentFactory

        school, principal, offering, teacher = self._world()
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=100)
        score = AssessmentScoreFactory(
            school=school, assessment=assessment, student=StudentFactory(school=school), raw_score=Decimal("50"), status="submitted"
        )
        assert score.weighted_score == Decimal("10")
        _login(api_client, teacher.user)

        assert self._patch(api_client, assessment, weight=30, max_score="50").status_code == 200

        score.refresh_from_db()
        assert score.weighted_score == Decimal("30")  # 50/50 of the new weight 30

    def test_max_score_cannot_drop_below_a_score_already_entered(self, api_client):
        from decimal import Decimal

        from tests.factories import AssessmentFactory, AssessmentScoreFactory, StudentFactory

        school, principal, offering, teacher = self._world()
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, max_score=100)
        AssessmentScoreFactory(school=school, assessment=assessment, student=StudentFactory(school=school), raw_score=Decimal("80"))
        _login(api_client, teacher.user)

        response = self._patch(api_client, assessment, max_score="60")
        assert response.status_code == 400
        assert "max_score" in str(response.data)

    def test_no_editing_once_ca_is_closed(self, api_client):
        from tests.factories import AssessmentFactory

        school, principal, offering, teacher = self._world()
        assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20)
        offering.ca_status = "closed"
        offering.save()
        _login(api_client, teacher.user)

        assert self._patch(api_client, assessment, name="Too late").status_code == 400


class TestLetterGradesAndGradePoints:
    """A subject's final score becomes a letter from the school's grading scale; tertiary schools also get
    grade points and a grade-point average on the scale the school chose (4.00 or 5.00)."""

    def _scale(self, school, with_points=True):
        from tests.factories import GradeBoundaryFactory, GradingScaleFactory

        scale = GradingScaleFactory(school=school, is_default=True)
        for grade, low, high, points in (("A", 70, 100, 5), ("B", 60, 69.99, 4), ("C", 50, 59.99, 3), ("F", 0, 49.99, 0)):
            GradeBoundaryFactory(
                school=school, grading_scale=scale, grade=grade, min_score=low, max_score=high,
                gpa_value=points if with_points else None,
            )
        return scale

    def test_the_letter_comes_from_the_best_boundary_the_score_reaches(self):
        from decimal import Decimal

        from apps.academics import services

        school, _ = _principal()
        self._scale(school)
        boundaries = services.load_grade_boundaries(school)
        assert services.grade_for_score(boundaries, Decimal("85")) == ("A", Decimal("5.00"))
        assert services.grade_for_score(boundaries, Decimal("69.995"))[0] == "B"  # between two bands: the lower one
        assert services.grade_for_score(boundaries, Decimal("12"))[0] == "F"
        assert services.grade_for_score(boundaries, None) == (None, None)
        assert services.grade_for_score([], Decimal("80")) == (None, None)

    def test_the_grade_point_average_is_the_mean_and_waits_for_every_subject(self):
        from decimal import Decimal

        from apps.academics import services

        assert services.compute_grade_point_average([Decimal("5"), Decimal("4"), Decimal("3")]) == Decimal("4.00")
        assert services.compute_grade_point_average([Decimal("5"), None]) is None
        assert services.compute_grade_point_average([]) is None

    def test_a_schools_top_points_are_four_or_five_and_boundaries_stay_within_it(self, api_client):
        from tests.factories import GradeBoundaryFactory, GradingScaleFactory

        school, principal = _principal()
        _login(api_client, principal)
        assert api_client.patch("/api/v1/schools/me/", {"grade_point_scale": "4.00"}, format="json").status_code == 200
        assert api_client.patch("/api/v1/schools/me/", {"grade_point_scale": "10.00"}, format="json").status_code == 400
        school.refresh_from_db()
        assert str(school.grade_point_scale) == "4.00"

        scale = GradingScaleFactory(school=school)
        too_high = api_client.post(
            "/api/v1/examinations/grade-boundaries/",
            {"grading_scale": str(scale.id), "grade": "A", "min_score": 70, "max_score": 100, "gpa_value": "5.00"},
            format="json",
        )
        assert too_high.status_code == 400 and "gpa_value" in str(too_high.data)
        fine = api_client.post(
            "/api/v1/examinations/grade-boundaries/",
            {"grading_scale": str(scale.id), "grade": "A", "min_score": 70, "max_score": 100, "gpa_value": "4.00"},
            format="json",
        )
        assert fine.status_code == 201, fine.data
