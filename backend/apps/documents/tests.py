import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    DocumentFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    UserFactory,
)

from .models import Document

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


class TestDocumentPermissions:
    def test_principal_can_upload_a_document(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/documents/",
            {"title": "School Policy", "owner_type": "school", "file": _fake_file()},
            format="multipart",
        )
        assert response.status_code == 201
        assert response.data["uploaded_by"] == principal.id

    def test_teacher_cannot_view_documents(self, api_client):
        """documents.* is deliberately absent from every seeded role's default prefix
        list except principal/school-administrator, same stricter treatment as medical
        and discipline — documents can hold confidential records."""
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/documents/")
        assert response.status_code == 403


class TestDocumentOwnerValidation:
    def test_school_document_cannot_set_student(self, api_client):
        school, principal = _principal()
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/documents/",
            {"title": "x", "owner_type": "school", "student": str(student.id), "file": _fake_file()},
            format="multipart",
        )
        assert response.status_code == 400

    def test_student_document_requires_student(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/documents/",
            {"title": "x", "owner_type": "student", "file": _fake_file()},
            format="multipart",
        )
        assert response.status_code == 400

    def test_student_document_with_matching_student_succeeds(self, api_client):
        school, principal = _principal()
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/documents/",
            {"title": "Birth Certificate", "owner_type": "student", "student": str(student.id), "file": _fake_file()},
            format="multipart",
        )
        assert response.status_code == 201

    def test_cannot_reference_another_schools_student(self, api_client):
        school, principal = _principal()
        other_school = SchoolFactory()
        foreign_student = StudentFactory(school=other_school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/documents/",
            {
                "title": "x",
                "owner_type": "student",
                "student": str(foreign_student.id),
                "file": _fake_file(),
            },
            format="multipart",
        )
        assert response.status_code == 400


class TestMyDocuments:
    def test_student_sees_own_document_and_public_school_document(self, api_client):
        school, _ = _principal()
        student = StudentFactory(school=school)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])

        own_doc = DocumentFactory(school=school, owner_type=Document.OwnerType.STUDENT, student=student)
        DocumentFactory(school=school, owner_type=Document.OwnerType.SCHOOL, is_confidential=False)
        DocumentFactory(school=school, owner_type=Document.OwnerType.SCHOOL, is_confidential=True)
        other_student = StudentFactory(school=school)
        DocumentFactory(school=school, owner_type=Document.OwnerType.STUDENT, student=other_student)

        _login(api_client, student.user)
        response = api_client.get("/api/v1/documents/me/")

        assert response.status_code == 200
        titles = {d["id"] for d in response.data["documents"]}
        assert str(own_doc.id) in titles
        assert len(titles) == 2  # own document + the one public school-wide document

    def test_staff_sees_own_document_and_public_school_document(self, api_client):
        school, _ = _principal()
        staff = StaffFactory(school=school)

        own_doc = DocumentFactory(school=school, owner_type=Document.OwnerType.STAFF, staff=staff)
        DocumentFactory(school=school, owner_type=Document.OwnerType.SCHOOL, is_confidential=False)
        other_staff = StaffFactory(school=school)
        DocumentFactory(school=school, owner_type=Document.OwnerType.STAFF, staff=other_staff)

        _login(api_client, staff.user)
        response = api_client.get("/api/v1/documents/me/")

        assert response.status_code == 200
        ids_seen = {d["id"] for d in response.data["documents"]}
        assert str(own_doc.id) in ids_seen
        assert len(ids_seen) == 2


class TestDocumentTenantIsolation:
    def test_cannot_list_another_schools_documents(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        DocumentFactory(school=school_b)
        document_a = DocumentFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/documents/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(document_a.id) in ids_seen
        assert len(ids_seen) == 1


def _fake_file():
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("test.pdf", b"fake pdf content", content_type="application/pdf")
