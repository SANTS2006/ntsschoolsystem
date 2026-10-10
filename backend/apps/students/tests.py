import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, GuardianFactory, SchoolFactory, StudentFactory, UserFactory

from .models import Student

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _school_admin():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    school_admin = UserFactory(school=school)
    assign_role(user=school_admin, role=Role.unscoped_objects.get(school=school, slug="school-administrator"))
    return school, school_admin


class TestStudentCreate:
    def test_school_admin_can_create_student(self, api_client):
        school, school_admin = _school_admin()
        _login(api_client, school_admin)

        response = api_client.post(
            "/api/v1/students/",
            {"admission_number": "ADM-0001", "first_name": "Ada", "last_name": "Lovelace"},
            format="json",
        )
        assert response.status_code == 201
        student = Student.unscoped_objects.get(school=school, admission_number="ADM-0001")
        assert student.status == Student.Status.ADMITTED

    def test_accountant_cannot_create_student(self, api_client):
        school, _school_admin_user = _school_admin()
        accountant = UserFactory(school=school)
        assign_role(user=accountant, role=Role.unscoped_objects.get(school=school, slug="accountant"))
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/students/",
            {"admission_number": "ADM-0002", "first_name": "X", "last_name": "Y"},
            format="json",
        )
        assert response.status_code == 403

    def test_accountant_can_view_students(self, api_client):
        school, _ = _school_admin()
        student = StudentFactory(school=school)
        accountant = UserFactory(school=school)
        assign_role(user=accountant, role=Role.unscoped_objects.get(school=school, slug="accountant"))
        _login(api_client, accountant)

        response = api_client.get("/api/v1/students/")
        assert response.status_code == 200
        assert any(row["id"] == str(student.id) for row in response.data["results"])


class TestStudentTenantIsolation:
    def test_cannot_list_another_schools_students(self, api_client):
        school_a, school_admin_a = _school_admin()
        school_b, _ = _school_admin()
        StudentFactory(school=school_b)
        student_a = StudentFactory(school=school_a)

        _login(api_client, school_admin_a)
        response = api_client.get("/api/v1/students/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(student_a.id) in ids_seen
        assert len(ids_seen) == 1

    def test_cannot_retrieve_another_schools_student_by_id(self, api_client):
        school_a, school_admin_a = _school_admin()
        school_b, _ = _school_admin()
        student_b = StudentFactory(school=school_b)

        _login(api_client, school_admin_a)
        response = api_client.get(f"/api/v1/students/{student_b.id}/")
        assert response.status_code == 404


class TestStudentArchive:
    def test_delete_archives_rather_than_hard_deletes(self, api_client):
        school, school_admin = _school_admin()
        student = StudentFactory(school=school, status=Student.Status.ACTIVE)
        _login(api_client, school_admin)

        response = api_client.delete(f"/api/v1/students/{student.id}/")
        assert response.status_code == 204
        student.refresh_from_db()
        assert student.status == Student.Status.ARCHIVED


class TestStudentPhoto:
    def test_school_admin_can_upload_photo(self, api_client):
        school, school_admin = _school_admin()
        student = StudentFactory(school=school)
        _login(api_client, school_admin)

        photo = SimpleUploadedFile("portrait.jpg", b"fake jpg bytes", content_type="image/jpeg")
        response = api_client.patch(f"/api/v1/students/{student.id}/", {"photo": photo}, format="multipart")

        assert response.status_code == 200
        assert response.data["photo"]
        student.refresh_from_db()
        assert student.photo.name

    def test_rejects_non_image_file(self, api_client):
        school, school_admin = _school_admin()
        student = StudentFactory(school=school)
        _login(api_client, school_admin)

        not_a_photo = SimpleUploadedFile("resume.pdf", b"fake pdf bytes", content_type="application/pdf")
        response = api_client.patch(
            f"/api/v1/students/{student.id}/", {"photo": not_a_photo}, format="multipart"
        )

        assert response.status_code == 400


class TestStudentGuardianLinking:
    def test_link_and_list_guardian(self, api_client):
        school, school_admin = _school_admin()
        student = StudentFactory(school=school)
        guardian = GuardianFactory(school=school)
        _login(api_client, school_admin)

        link = api_client.post(
            f"/api/v1/students/{student.id}/guardians/",
            {"guardian_id": str(guardian.id), "relationship": "mother", "is_primary": True},
            format="json",
        )
        assert link.status_code == 200

        listing = api_client.get(f"/api/v1/students/{student.id}/guardians/")
        assert listing.status_code == 200
        assert len(listing.data["guardians"]) == 1
        assert listing.data["guardians"][0]["relationship"] == "mother"

    def test_cannot_link_another_schools_guardian(self, api_client):
        school_a, school_admin_a = _school_admin()
        school_b, _ = _school_admin()
        student_a = StudentFactory(school=school_a)
        guardian_b = GuardianFactory(school=school_b)

        _login(api_client, school_admin_a)
        response = api_client.post(
            f"/api/v1/students/{student_a.id}/guardians/",
            {"guardian_id": str(guardian_b.id)},
            format="json",
        )
        assert response.status_code == 404

    def test_unlink_guardian(self, api_client):
        school, school_admin = _school_admin()
        student = StudentFactory(school=school)
        guardian = GuardianFactory(school=school)
        _login(api_client, school_admin)
        api_client.post(
            f"/api/v1/students/{student.id}/guardians/", {"guardian_id": str(guardian.id)}, format="json"
        )

        response = api_client.delete(f"/api/v1/students/{student.id}/guardians/?guardian_id={guardian.id}")
        assert response.status_code == 200

        listing = api_client.get(f"/api/v1/students/{student.id}/guardians/")
        assert listing.data["guardians"] == []


class TestStudentDefaultAccount:
    def test_new_student_gets_initials_admission_number_email_and_school_default_password(self, api_client):
        from apps.authorization.models import Role, UserRole
        from apps.tenants.services import generate_default_password

        school, school_admin = _school_admin()
        school.name = "Government Secondary School Kenema"
        school.save(update_fields=["name"])
        _login(api_client, school_admin)

        payload = {"admission_number": "A1", "first_name": "Fatmata", "middle_name": "Sia", "last_name": "Kamara"}
        response = api_client.post("/api/v1/students/", payload, format="json")
        assert response.status_code == 201, response.data
        student = Student.unscoped_objects.get(admission_number="A1")
        assert student.user.email == "fska1@gssk.edu.sl"
        assert student.user.check_password(generate_default_password(school))
        assert UserRole.unscoped_objects.filter(
            user=student.user, role=Role.unscoped_objects.get(school=school, slug="student")
        ).exists()

        # Same initials, different admission number: no collision, since the admission number
        # (already unique per school) disambiguates instead of a name-based counter.
        payload.update(admission_number="A2", first_name="Fatu", middle_name="Sam", last_name="Koroma")
        api_client.post("/api/v1/students/", payload, format="json")
        assert Student.unscoped_objects.get(admission_number="A2").user.email == "fska2@gssk.edu.sl"
