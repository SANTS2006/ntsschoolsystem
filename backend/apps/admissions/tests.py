import pytest

from apps.authorization.models import Role, UserRole
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.staff.models import Staff
from apps.students.models import Student
from apps.users.models import User
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    SchoolClassFactory,
    SchoolFactory,
    UserFactory,
)

from .models import Application, ApplicationDocument

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _school_administrator():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    admin = UserFactory(school=school)
    assign_role(user=admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    return school, admin


class TestPublicApplicationOptions:
    def test_returns_classes_and_assignable_roles(self, api_client):
        school, _ = _school_administrator()
        school_class = SchoolClassFactory(school=school)

        response = api_client.get(f"/api/v1/admissions/apply/{school.slug}/options/")

        assert response.status_code == 200
        class_names = [c["name"] for c in response.data["classes"]]
        assert school_class.name in class_names
        role_slugs = {r["name"] for r in response.data["roles"]}
        # "student" is excluded — a staff applicant never applies for the student role.
        assert "Student" not in role_slugs
        assert "Teacher" in role_slugs

    def test_unknown_school_slug_404s(self, api_client):
        response = api_client.get("/api/v1/admissions/apply/no-such-school/options/")
        assert response.status_code == 404

    def test_inactive_school_404s(self, api_client):
        school = SchoolFactory(status="pending")
        response = api_client.get(f"/api/v1/admissions/apply/{school.slug}/options/")
        assert response.status_code == 404


class TestPublicApplySubmission:
    def test_submits_a_student_application_with_documents(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile

        school, _ = _school_administrator()
        school_class = SchoolClassFactory(school=school)

        response = api_client.post(
            f"/api/v1/admissions/apply/{school.slug}/",
            {
                "kind": "student",
                "first_name": "Ama",
                "last_name": "Koroma",
                "email": "ama@example.test",
                "applying_for_class": str(school_class.id),
                "documents": [SimpleUploadedFile("transcript.pdf", b"%PDF-1.4 fake transcript")],
            },
            format="multipart",
        )

        assert response.status_code == 201
        application = Application.unscoped_objects.get(school=school, email="ama@example.test")
        assert application.kind == Application.Kind.STUDENT
        assert application.status == Application.Status.SUBMITTED
        assert application.applying_for_class_id == school_class.id
        assert ApplicationDocument.unscoped_objects.filter(application=application).count() == 1

    def test_student_application_requires_a_class(self, api_client):
        school, _ = _school_administrator()

        response = api_client.post(
            f"/api/v1/admissions/apply/{school.slug}/",
            {"kind": "student", "first_name": "Ama", "last_name": "Koroma", "email": "ama2@example.test"},
            format="multipart",
        )
        assert response.status_code == 400

    def test_submits_a_staff_application(self, api_client):
        school, _ = _school_administrator()
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")

        response = api_client.post(
            f"/api/v1/admissions/apply/{school.slug}/",
            {
                "kind": "staff",
                "first_name": "Kofi",
                "last_name": "Mensah",
                "email": "kofi@example.test",
                "applying_for_role": str(teacher_role.id),
                "job_title": "Mathematics Teacher",
            },
            format="multipart",
        )

        assert response.status_code == 201
        application = Application.unscoped_objects.get(school=school, email="kofi@example.test")
        assert application.kind == Application.Kind.STAFF
        assert application.applying_for_role_id == teacher_role.id

    def test_staff_application_requires_a_role(self, api_client):
        school, _ = _school_administrator()

        response = api_client.post(
            f"/api/v1/admissions/apply/{school.slug}/",
            {"kind": "staff", "first_name": "Kofi", "last_name": "Mensah", "email": "kofi2@example.test"},
            format="multipart",
        )
        assert response.status_code == 400

    def test_cannot_apply_for_another_schools_class(self, api_client):
        school, _ = _school_administrator()
        other_school = SchoolFactory()
        other_class = SchoolClassFactory(school=other_school)

        response = api_client.post(
            f"/api/v1/admissions/apply/{school.slug}/",
            {
                "kind": "student",
                "first_name": "Ama",
                "last_name": "Koroma",
                "email": "ama3@example.test",
                "applying_for_class": str(other_class.id),
            },
            format="multipart",
        )
        assert response.status_code == 400

    def test_unknown_school_slug_404s(self, api_client):
        response = api_client.post(
            "/api/v1/admissions/apply/no-such-school/",
            {"kind": "student", "first_name": "A", "last_name": "B", "email": "a@example.test"},
            format="multipart",
        )
        assert response.status_code == 404


class TestApplicationAdminList:
    def test_school_administrator_can_list_applications(self, api_client):
        school, admin = _school_administrator()
        Application.objects.create(school=school, kind="student", first_name="A", last_name="B", email="a@b.test")
        _login(api_client, admin)

        response = api_client.get("/api/v1/admissions/applications/")

        assert response.status_code == 200
        assert response.data["count"] == 1

    def test_teacher_without_permission_cannot_list(self, api_client):
        school, _ = _school_administrator()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/admissions/applications/")
        assert response.status_code == 403

    def test_cannot_list_another_schools_applications(self, api_client):
        school, admin = _school_administrator()
        other_school = SchoolFactory()
        Application.objects.create(
            school=other_school, kind="student", first_name="X", last_name="Y", email="x@y.test"
        )
        _login(api_client, admin)

        response = api_client.get("/api/v1/admissions/applications/")
        assert response.data["count"] == 0


class TestBulkShortlist:
    def test_shortlists_selected_applications(self, api_client):
        school, admin = _school_administrator()
        application = Application.objects.create(
            school=school, kind="student", first_name="A", last_name="B", email="a@b.test"
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/bulk-shortlist/",
            {"application_ids": [str(application.id)]},
            format="json",
        )

        assert response.status_code == 200
        application.refresh_from_db()
        assert application.status == Application.Status.SHORTLISTED


class TestInviteInterview:
    def test_sets_interview_details_and_status(self, api_client):
        school, admin = _school_administrator()
        application = Application.objects.create(
            school=school, kind="student", first_name="A", last_name="B", email="a@b.test"
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/invite-interview/",
            {
                "application_ids": [str(application.id)],
                "interview_datetime": "2026-02-01T10:00:00Z",
                "interview_location": "Main office",
                "interview_notes": "Bring your certificates.",
            },
            format="json",
        )

        assert response.status_code == 200
        application.refresh_from_db()
        assert application.status == Application.Status.INTERVIEW_SCHEDULED
        assert application.interview_location == "Main office"

    def test_requires_a_datetime(self, api_client):
        school, admin = _school_administrator()
        application = Application.objects.create(
            school=school, kind="student", first_name="A", last_name="B", email="a@b.test"
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/invite-interview/",
            {"application_ids": [str(application.id)]},
            format="json",
        )
        assert response.status_code == 400


class TestBulkAccept:
    def test_accepts_a_student_application(self, api_client):
        school, admin = _school_administrator()
        school_class = SchoolClassFactory(school=school)
        application = Application.objects.create(
            school=school,
            kind="student",
            first_name="Ama",
            last_name="Koroma",
            email="ama@example.test",
            applying_for_class=school_class,
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/bulk-accept/",
            {"application_ids": [str(application.id)], "numbers": {str(application.id): "ADM-100"}},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["accepted"] == 1
        assert response.data["skipped"] == []
        application.refresh_from_db()
        assert application.status == Application.Status.ACCEPTED
        student = Student.unscoped_objects.get(school=school, first_name="Ama", last_name="Koroma")
        assert student.status == Student.Status.ADMITTED
        assert student.current_class_id == school_class.id
        assert student.user_id is not None
        assert application.created_student_id == student.id
        assert student.admission_number == "ADM-100"
        # the sign-in email follows the school's usual student format, built from that admission number
        assert student.user.email == "ak" + "adm100" + "@" + "".join(w[0] for w in school.name.split()).lower() + ".edu.sl"

    def test_accepts_a_staff_application(self, api_client):
        school, admin = _school_administrator()
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")
        application = Application.objects.create(
            school=school,
            kind="staff",
            first_name="Kofi",
            last_name="Mensah",
            email="kofi@example.test",
            applying_for_role=teacher_role,
            job_title="Mathematics Teacher",
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/bulk-accept/",
            {"application_ids": [str(application.id)], "numbers": {str(application.id): "T-007"}},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["accepted"] == 1
        application.refresh_from_db()
        assert application.status == Application.Status.ACCEPTED
        user = User.objects.get(school=school, email="kofi@example.test")
        staff = Staff.unscoped_objects.get(school=school, user=user)
        assert staff.employment_status == Staff.EmploymentStatus.ACTIVE
        assert staff.job_title == "Mathematics Teacher"
        assert staff.staff_id == "T-007"
        assert UserRole.unscoped_objects.filter(user=user, role=teacher_role).exists()

    def test_skips_a_student_application_with_no_class_specified(self, api_client):
        school, admin = _school_administrator()
        application = Application.objects.create(
            school=school, kind="student", first_name="A", last_name="B", email="a@b.test"
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/bulk-accept/",
            {"application_ids": [str(application.id)]},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["accepted"] == 0
        assert len(response.data["skipped"]) == 1
        application.refresh_from_db()
        assert application.status == Application.Status.SUBMITTED

    def test_skips_a_staff_application_whose_email_already_has_an_account(self, api_client):
        school, admin = _school_administrator()
        teacher_role = Role.unscoped_objects.get(school=school, slug="teacher")
        UserFactory(school=school, email="taken@example.test")
        application = Application.objects.create(
            school=school,
            kind="staff",
            first_name="Kofi",
            last_name="Mensah",
            email="taken@example.test",
            applying_for_role=teacher_role,
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/bulk-accept/",
            {"application_ids": [str(application.id)], "numbers": {str(application.id): "T-008"}},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["accepted"] == 0
        assert len(response.data["skipped"]) == 1
        application.refresh_from_db()
        assert application.status == Application.Status.SUBMITTED


class TestBulkReject:
    def test_rejects_selected_applications(self, api_client):
        school, admin = _school_administrator()
        application = Application.objects.create(
            school=school, kind="student", first_name="A", last_name="B", email="a@b.test"
        )
        _login(api_client, admin)

        response = api_client.post(
            "/api/v1/admissions/applications/bulk-reject/",
            {"application_ids": [str(application.id)], "reason": "Class is full."},
            format="json",
        )

        assert response.status_code == 200
        application.refresh_from_db()
        assert application.status == Application.Status.REJECTED
        assert application.rejection_reason == "Class is full."


class TestApplicationFormBuilder:
    def _student_payload(self, school, **extra):
        school_class = SchoolClassFactory(school=school)
        return {
            "kind": "student", "first_name": "Ama", "last_name": "Koroma", "email": "ama@example.test",
            "applying_for_class": str(school_class.id), **extra,
        }

    def test_default_form_matches_what_it_always_asked_for(self, api_client):
        school, _ = _school_administrator()
        form = api_client.get(f"/api/v1/admissions/apply/{school.slug}/options/").data["form"]
        student = {f["key"]: f for f in form["student"]["fields"]}
        assert student["first_name"]["required"] and student["first_name"]["locked"]
        assert student["phone"]["enabled"] and not student["phone"]["required"]
        assert form["student"]["custom_fields"] == []

    def test_admin_can_make_a_question_mandatory_and_the_public_form_enforces_it(self, api_client):
        school, admin = _school_administrator()
        _login(api_client, admin)
        saved = api_client.put(
            "/api/v1/admissions/form-config/student/",
            {"fields": {"guardian_phone": {"enabled": True, "required": True}}, "custom_fields": []},
            format="json",
        )
        assert saved.status_code == 200, saved.data
        api_client.logout()

        missing = api_client.post(f"/api/v1/admissions/apply/{school.slug}/", self._student_payload(school), format="multipart")
        assert missing.status_code == 400
        assert "guardian_phone" in str(missing.data)
        ok = api_client.post(
            f"/api/v1/admissions/apply/{school.slug}/",
            self._student_payload(school, guardian_phone="0777"), format="multipart",
        )
        assert ok.status_code == 201, ok.data

    def test_a_question_switched_off_is_ignored_even_if_submitted(self, api_client):
        school, admin = _school_administrator()
        _login(api_client, admin)
        api_client.put("/api/v1/admissions/form-config/student/", {"fields": {"previous_school": {"enabled": False}}}, format="json")
        api_client.logout()

        response = api_client.post(
            f"/api/v1/admissions/apply/{school.slug}/",
            self._student_payload(school, previous_school="Old School"), format="multipart",
        )
        assert response.status_code == 201, response.data
        assert Application.unscoped_objects.get(school=school).previous_school == ""

    def test_locked_fields_cannot_be_switched_off(self, api_client):
        school, admin = _school_administrator()
        _login(api_client, admin)
        api_client.put("/api/v1/admissions/form-config/student/", {"fields": {"email": {"enabled": False, "required": False}}}, format="json")
        form = {f["key"]: f for f in api_client.get("/api/v1/admissions/form-config/").data["student"]["fields"]}
        assert form["email"]["enabled"] and form["email"]["required"]

    def test_custom_questions_are_asked_validated_and_stored_with_their_label(self, api_client):
        import json

        school, admin = _school_administrator()
        _login(api_client, admin)
        saved = api_client.put(
            "/api/v1/admissions/form-config/student/",
            {"custom_fields": [
                {"label": "Religion", "type": "select", "options": ["Christian", "Muslim", "Other"], "required": True},
                {"label": "Hobbies", "type": "text", "required": False},
            ]},
            format="json",
        )
        assert saved.status_code == 200, saved.data
        religion_key = saved.data["config"]["custom_fields"][0]["key"]
        api_client.logout()

        url = f"/api/v1/admissions/apply/{school.slug}/"
        assert api_client.post(url, self._student_payload(school), format="multipart").status_code == 400  # required
        bad = api_client.post(url, self._student_payload(school, custom_answers=json.dumps({religion_key: "Pastafarian"})), format="multipart")
        assert bad.status_code == 400
        good = api_client.post(url, self._student_payload(school, custom_answers=json.dumps({religion_key: "Muslim"})), format="multipart")
        assert good.status_code == 201, good.data
        stored = Application.unscoped_objects.get(school=school).custom_answers
        assert stored == {religion_key: {"label": "Religion", "value": "Muslim"}}

    def test_config_is_per_school_and_needs_the_update_permission(self, api_client):
        school_a, admin_a = _school_administrator()
        school_b, _ = _school_administrator()
        _login(api_client, admin_a)
        api_client.put("/api/v1/admissions/form-config/staff/", {"fields": {"qualification": {"enabled": True, "required": True}}}, format="json")
        api_client.logout()
        form_b = {f["key"]: f for f in api_client.get(f"/api/v1/admissions/apply/{school_b.slug}/options/").data["form"]["staff"]["fields"]}
        assert not form_b["qualification"]["required"]

        teacher = UserFactory(school=school_a)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school_a, slug="teacher"))
        _login(api_client, teacher)
        assert api_client.put("/api/v1/admissions/form-config/staff/", {}, format="json").status_code == 403

    def test_admin_gets_the_shareable_link(self, api_client):
        school, admin = _school_administrator()
        _login(api_client, admin)
        response = api_client.get("/api/v1/admissions/form-config/")
        assert response.status_code == 200
        assert response.data["apply_url"].endswith(f"/apply/{school.slug}")


class TestAcceptanceNumbersAndGuardian:
    def _student_application(self, school, **extra):
        school_class = SchoolClassFactory(school=school)
        return Application.objects.create(
            school=school, kind="student", first_name="Ama", last_name="Koroma", email="ama@example.test",
            applying_for_class=school_class, **extra,
        )

    def _accept(self, api_client, applications_and_numbers):
        return api_client.post(
            "/api/v1/admissions/applications/bulk-accept/",
            {
                "application_ids": [str(a.id) for a, _ in applications_and_numbers],
                "numbers": {str(a.id): n for a, n in applications_and_numbers},
            },
            format="json",
        )

    def test_an_admission_number_is_required_to_accept(self, api_client):
        school, admin = _school_administrator()
        application = self._student_application(school)
        _login(api_client, admin)

        response = self._accept(api_client, [(application, "")])

        assert response.data["accepted"] == 0
        assert "admission number" in response.data["skipped"][0]["reason"]
        application.refresh_from_db()
        assert application.status == Application.Status.SUBMITTED
        assert not Student.unscoped_objects.filter(school=school).exists()

    def test_a_student_and_a_staff_applicant_are_numbered_separately_in_one_batch(self, api_client):
        school, admin = _school_administrator()
        student_app = self._student_application(school)
        staff_app = Application.objects.create(
            school=school, kind="staff", first_name="Kofi", last_name="Mensah", email="kofi@example.test",
            applying_for_role=Role.unscoped_objects.get(school=school, slug="teacher"),
        )
        _login(api_client, admin)

        # the same number is fine across kinds — a student's admission number and a staff number are different series
        response = self._accept(api_client, [(student_app, "0042"), (staff_app, "0042")])

        assert response.data["accepted"] == 2, response.data
        assert Student.unscoped_objects.get(school=school).admission_number == "0042"
        assert Staff.unscoped_objects.get(school=school).staff_id == "0042"

    def test_a_number_already_in_use_is_refused(self, api_client):
        school, admin = _school_administrator()
        Student.unscoped_objects.create(school=school, admission_number="ADM-1", first_name="Old", last_name="Student")
        application = self._student_application(school)
        _login(api_client, admin)

        response = self._accept(api_client, [(application, "adm-1")])  # compared ignoring case

        assert response.data["accepted"] == 0
        assert "already belongs to Old Student" in response.data["skipped"][0]["reason"]

    def test_the_same_number_twice_in_one_batch_is_refused_for_the_second(self, api_client):
        school, admin = _school_administrator()
        first = self._student_application(school)
        second = Application.objects.create(
            school=school, kind="student", first_name="Kwame", last_name="Boateng", email="kwame@example.test",
            applying_for_class=first.applying_for_class,
        )
        _login(api_client, admin)

        response = self._accept(api_client, [(first, "A1"), (second, "A1")])

        assert response.data["accepted"] == 1
        assert len(response.data["skipped"]) == 1

    def test_guardian_is_created_and_linked_only_on_acceptance(self, api_client):
        from apps.parents.models import Guardian, StudentGuardian

        school, admin = _school_administrator()
        application = self._student_application(
            school, guardian_name="Mary Koroma", guardian_phone="0777", guardian_email="mary@example.test"
        )
        assert not Guardian.unscoped_objects.filter(school=school).exists()  # nothing at submission time
        _login(api_client, admin)

        self._accept(api_client, [(application, "ADM-5")])

        guardian = Guardian.unscoped_objects.get(school=school)
        assert (guardian.first_name, guardian.last_name, guardian.email, guardian.phone_number) == (
            "Mary", "Koroma", "mary@example.test", "0777",
        )
        student = Student.unscoped_objects.get(school=school)
        link = StudentGuardian.unscoped_objects.get(student=student, guardian=guardian)
        assert link.is_primary is True

    def test_an_existing_guardian_is_reused_for_a_sibling(self, api_client):
        from apps.parents.models import Guardian, StudentGuardian

        school, admin = _school_administrator()
        first = self._student_application(school, guardian_name="Mary Koroma", guardian_email="mary@example.test")
        second = Application.objects.create(
            school=school, kind="student", first_name="Kai", last_name="Koroma", email="kai@example.test",
            applying_for_class=first.applying_for_class, guardian_name="Mary Koroma", guardian_email="MARY@example.test",
        )
        _login(api_client, admin)

        self._accept(api_client, [(first, "S1"), (second, "S2")])

        assert Guardian.unscoped_objects.filter(school=school).count() == 1
        assert StudentGuardian.unscoped_objects.filter(guardian__school=school).count() == 2

    def test_a_rejected_application_leaves_no_guardian_behind(self, api_client):
        from apps.parents.models import Guardian

        school, admin = _school_administrator()
        application = self._student_application(school, guardian_name="Mary Koroma", guardian_email="mary@example.test")
        _login(api_client, admin)
        api_client.post(
            "/api/v1/admissions/applications/bulk-reject/", {"application_ids": [str(application.id)]}, format="json"
        )
        assert not Guardian.unscoped_objects.filter(school=school).exists()


class TestMoreQuestionTypes:
    def _configure(self, api_client, admin, custom_fields):
        _login(api_client, admin)
        saved = api_client.put("/api/v1/admissions/form-config/student/", {"custom_fields": custom_fields}, format="json")
        assert saved.status_code == 200, saved.data
        api_client.logout()
        return [q["key"] for q in saved.data["config"]["custom_fields"]]

    def _submit(self, api_client, school, answers=None, **extra):
        import json

        school_class = SchoolClassFactory(school=school)
        payload = {
            "kind": "student", "first_name": "Ama", "last_name": "Koroma", "email": "ama@example.test",
            "applying_for_class": str(school_class.id), **extra,
        }
        if answers is not None:
            payload["custom_answers"] = json.dumps(answers)
        return api_client.post(f"/api/v1/admissions/apply/{school.slug}/", payload, format="multipart")

    def test_dropdown_radio_multiselect_checkbox_email_and_phone(self, api_client):
        school, admin = _school_administrator()
        keys = self._configure(api_client, admin, [
            {"label": "House", "type": "select", "options": ["Red", "Blue"], "required": True},
            {"label": "Transport", "type": "radio", "options": ["Bus", "Walk"]},
            {"label": "Clubs", "type": "multiselect", "options": ["Chess", "Drama", "Choir"]},
            {"label": "I agree to the rules", "type": "checkbox", "required": True},
            {"label": "Parent email", "type": "email"},
            {"label": "Parent phone", "type": "phone"},
        ])
        house, transport, clubs, agree, email, phone = keys

        bad = self._submit(api_client, school, {house: "Green", agree: "true"})
        assert bad.status_code == 400
        unticked = self._submit(api_client, school, {house: "Red"})
        assert unticked.status_code == 400 and agree in str(unticked.data)
        bad_club = self._submit(api_client, school, {house: "Red", agree: "true", clubs: ["Chess", "Football"]})
        assert bad_club.status_code == 400
        bad_email = self._submit(api_client, school, {house: "Red", agree: "true", email: "nope"})
        assert bad_email.status_code == 400

        ok = self._submit(
            api_client, school,
            {house: "Red", transport: "Bus", clubs: ["Chess", "Choir"], agree: "true", email: "p@example.test", phone: "0777"},
        )
        assert ok.status_code == 201, ok.data
        stored = Application.unscoped_objects.get(school=school).custom_answers
        assert stored[house]["value"] == "Red"
        assert stored[clubs]["value"] == "Chess, Choir"
        assert stored[agree]["value"] == "Yes"

    def test_file_upload_question_stores_the_file_against_the_question(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile

        school, admin = _school_administrator()
        (key,) = self._configure(api_client, admin, [{"label": "Birth certificate", "type": "file", "required": True}])

        missing = self._submit(api_client, school, {})
        assert missing.status_code == 400 and key in str(missing.data)

        ok = self._submit(api_client, school, {}, **{f"file_{key}": SimpleUploadedFile("birth.pdf", b"%PDF-1.4 x")})
        assert ok.status_code == 201, ok.data
        application = Application.unscoped_objects.get(school=school)
        document = ApplicationDocument.unscoped_objects.get(application=application)
        assert document.question_key == key
        assert document.title.startswith("Birth certificate")

    def test_choice_questions_still_need_their_choices(self, api_client):
        school, admin = _school_administrator()
        _login(api_client, admin)
        response = api_client.put(
            "/api/v1/admissions/form-config/student/",
            {"custom_fields": [{"label": "Pick", "type": "radio", "options": ["Only one"]}]}, format="json",
        )
        assert response.status_code == 400
