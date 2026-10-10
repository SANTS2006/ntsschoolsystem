import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    BookCopyFactory,
    BookFactory,
    BookLoanFactory,
    SchoolFactory,
    StudentFactory,
    UserFactory,
)

from .models import BookCopy, BookLoan

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


class TestLibraryPermissions:
    def test_teacher_cannot_manage_library(self, api_client):
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post("/api/v1/library/books/", {"title": "Test Book"}, format="json")
        assert response.status_code == 403


class TestCheckoutReturn:
    def test_checkout_marks_copy_borrowed(self, api_client):
        school, principal = _principal()
        copy = BookCopyFactory(school=school)
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/library/loans/", {"copy": str(copy.id), "student": str(student.id)}, format="json"
        )
        assert response.status_code == 201
        copy.refresh_from_db()
        assert copy.status == BookCopy.Status.BORROWED

    def test_cannot_checkout_already_borrowed_copy(self, api_client):
        school, principal = _principal()
        copy = BookCopyFactory(school=school, status=BookCopy.Status.BORROWED)
        student = StudentFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/library/loans/", {"copy": str(copy.id), "student": str(student.id)}, format="json"
        )
        assert response.status_code == 400

    def test_cannot_checkout_with_both_student_and_staff(self, api_client):
        school, principal = _principal()
        copy = BookCopyFactory(school=school)
        student = StudentFactory(school=school)
        from tests.factories import StaffFactory

        staff = StaffFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/library/loans/",
            {"copy": str(copy.id), "student": str(student.id), "staff": str(staff.id)},
            format="json",
        )
        assert response.status_code == 400

    def test_return_book_marks_copy_available_and_computes_fine(self, api_client):
        school, principal = _principal()
        copy = BookCopyFactory(school=school, status=BookCopy.Status.BORROWED)
        loan = BookLoanFactory(
            school=school, copy=copy, due_date="2026-01-01", borrowed_date="2025-12-18"
        )
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/library/loans/{loan.id}/return/")
        assert response.status_code == 200
        copy.refresh_from_db()
        loan.refresh_from_db()
        assert copy.status == BookCopy.Status.AVAILABLE
        assert loan.status == BookLoan.Status.RETURNED
        assert loan.fine_amount > 0  # overdue since due_date is in the past

    def test_cannot_return_already_returned_loan(self, api_client):
        school, principal = _principal()
        loan = BookLoanFactory(school=school, status=BookLoan.Status.RETURNED)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/library/loans/{loan.id}/return/")
        assert response.status_code == 400


class TestRenew:
    def test_renew_extends_due_date(self, api_client):
        school, principal = _principal()
        loan = BookLoanFactory(school=school, due_date="2026-01-15")
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/library/loans/{loan.id}/renew/")
        assert response.status_code == 200
        loan.refresh_from_db()
        assert loan.due_date.isoformat() == "2026-01-29"
        assert loan.renewal_count == 1

    def test_cannot_renew_past_max_renewals(self, api_client):
        school, principal = _principal()
        loan = BookLoanFactory(school=school, renewal_count=2)
        _login(api_client, principal)

        response = api_client.post(f"/api/v1/library/loans/{loan.id}/renew/")
        assert response.status_code == 400


class TestLibraryTenantIsolation:
    def test_cannot_list_another_schools_books(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        BookFactory(school=school_b)
        book_a = BookFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/library/books/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(book_a.id) in ids_seen
        assert len(ids_seen) == 1

    def test_cannot_checkout_another_schools_copy(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        copy_b = BookCopyFactory(school=school_b)
        student_a = StudentFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.post(
            "/api/v1/library/loans/", {"copy": str(copy_b.id), "student": str(student_a.id)}, format="json"
        )
        assert response.status_code == 400
