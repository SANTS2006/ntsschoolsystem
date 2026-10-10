from decimal import Decimal

import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    FeeCategoryFactory,
    FeeStructureFactory,
    FeeStructureItemFactory,
    InvoiceFactory,
    InvoiceLineItemFactory,
    PaymentFactory,
    SchoolClassFactory,
    SchoolFactory,
    StudentFactory,
    UserFactory,
)

from .models import Invoice, Payment
from .services import DuplicatePaymentError, FinanceError, record_payment, record_refund

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _accountant():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    accountant = UserFactory(school=school)
    assign_role(user=accountant, role=Role.unscoped_objects.get(school=school, slug="accountant"))
    return school, accountant


class TestFeeConfigPermissions:
    def test_accountant_can_create_fee_category(self, api_client):
        school, accountant = _accountant()
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/fee-categories/", {"name": "Tuition"}, format="json"
        )
        assert response.status_code == 201

    def test_teacher_cannot_create_fee_category(self, api_client):
        school, _ = _accountant()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/finance/fee-categories/", {"name": "Tuition"}, format="json"
        )
        assert response.status_code == 403


class TestInvoiceCreate:
    def test_create_invoice_with_line_items_computes_totals(self, api_client):
        school, accountant = _accountant()
        student = StudentFactory(school=school)
        category = FeeCategoryFactory(school=school)
        from tests.factories import AcademicYearFactory

        year = AcademicYearFactory(school=school)
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/invoices/",
            {
                "student": str(student.id),
                "academic_year": str(year.id),
                "line_items": [
                    {"fee_category": str(category.id), "line_type": "charge", "amount": "500.00"},
                    {"line_type": "discount", "description": "Sibling discount", "amount": "-50.00"},
                ],
            },
            format="json",
        )
        assert response.status_code == 201
        invoice = response.data["invoice"]
        assert invoice["subtotal"] == "500.00"
        assert invoice["discount_total"] == "50.00"
        assert invoice["total"] == "450.00"
        assert invoice["balance"] == "450.00"
        assert invoice["status"] == "unpaid"

    def test_zero_amount_line_item_rejected(self, api_client):
        school, accountant = _accountant()
        student = StudentFactory(school=school)
        from tests.factories import AcademicYearFactory

        year = AcademicYearFactory(school=school)
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/invoices/",
            {
                "student": str(student.id),
                "academic_year": str(year.id),
                "line_items": [{"line_type": "charge", "amount": "0"}],
            },
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_create_an_invoice_against_an_archived_year(self, api_client):
        school, accountant = _accountant()
        student = StudentFactory(school=school)
        from tests.factories import AcademicYearFactory

        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/invoices/",
            {
                "student": str(student.id),
                "academic_year": str(year.id),
                "line_items": [{"line_type": "charge", "amount": "100.00"}],
            },
            format="json",
        )
        assert response.status_code == 400


class TestGenerateInvoices:
    def test_generate_creates_one_invoice_per_active_student(self, api_client):
        school, accountant = _accountant()
        school_class = SchoolClassFactory(school=school)
        s1 = StudentFactory(school=school, current_class=school_class, status="active")
        s2 = StudentFactory(school=school, current_class=school_class, status="active")
        StudentFactory(school=school, status="active")  # different class — excluded
        structure = FeeStructureFactory(school=school, school_class=school_class)
        FeeStructureItemFactory(school=school, fee_structure=structure, amount=Decimal("300.00"))
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/invoices/generate/", {"fee_structure": str(structure.id)}, format="json"
        )
        assert response.status_code == 200
        assert len(response.data["invoices"]) == 2
        for inv in response.data["invoices"]:
            assert inv["total"] == "300.00"

    def test_generate_is_idempotent(self, api_client):
        school, accountant = _accountant()
        school_class = SchoolClassFactory(school=school)
        StudentFactory(school=school, current_class=school_class, status="active")
        structure = FeeStructureFactory(school=school, school_class=school_class)
        FeeStructureItemFactory(school=school, fee_structure=structure, amount=Decimal("300.00"))
        _login(api_client, accountant)

        api_client.post("/api/v1/finance/invoices/generate/", {"fee_structure": str(structure.id)}, format="json")
        response = api_client.post(
            "/api/v1/finance/invoices/generate/", {"fee_structure": str(structure.id)}, format="json"
        )
        assert response.status_code == 200
        assert len(response.data["invoices"]) == 0
        assert len(response.data["skipped_student_ids"]) == 1

    def test_cannot_generate_against_an_archived_years_fee_structure(self, api_client):
        school, accountant = _accountant()
        school_class = SchoolClassFactory(school=school)
        StudentFactory(school=school, current_class=school_class, status="active")
        from tests.factories import AcademicYearFactory

        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        structure = FeeStructureFactory(school=school, school_class=school_class, academic_year=year)
        FeeStructureItemFactory(school=school, fee_structure=structure, amount=Decimal("300.00"))
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/invoices/generate/", {"fee_structure": str(structure.id)}, format="json"
        )
        assert response.status_code == 400


class TestPaymentRecording:
    def test_partial_then_full_payment_transitions_status(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"), subtotal=Decimal("100.00"))
        _login(api_client, accountant)

        r1 = api_client.post(
            "/api/v1/finance/payments/",
            {"invoice": str(invoice.id), "amount": "40.00", "method": "cash"},
            format="json",
        )
        assert r1.status_code == 201
        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.PARTIALLY_PAID
        assert invoice.balance == Decimal("60.00")

        r2 = api_client.post(
            "/api/v1/finance/payments/",
            {"invoice": str(invoice.id), "amount": "60.00", "method": "cash"},
            format="json",
        )
        assert r2.status_code == 201
        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.PAID
        assert invoice.balance == Decimal("0.00")

    def test_overpayment_rejected(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/payments/",
            {"invoice": str(invoice.id), "amount": "150.00", "method": "cash"},
            format="json",
        )
        assert response.status_code == 400

    def test_duplicate_payment_rejected(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        _login(api_client, accountant)

        payload = {"invoice": str(invoice.id), "amount": "40.00", "method": "cash", "reference": "abc"}
        first = api_client.post("/api/v1/finance/payments/", payload, format="json")
        assert first.status_code == 201

        second = api_client.post("/api/v1/finance/payments/", payload, format="json")
        assert second.status_code == 409
        assert second.data["code"] == "DUPLICATE_PAYMENT"
        invoice.refresh_from_db()
        assert invoice.amount_paid == Decimal("40.00")  # only the first one applied

    def test_cannot_pay_cancelled_invoice(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"), status=Invoice.Status.CANCELLED)
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/payments/",
            {"invoice": str(invoice.id), "amount": "10.00", "method": "cash"},
            format="json",
        )
        assert response.status_code == 400


class TestRefunds:
    def test_full_refund_reverts_invoice_to_unpaid(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        payment = PaymentFactory(school=school, invoice=invoice, amount=Decimal("100.00"))
        invoice.amount_paid = Decimal("100.00")
        invoice.balance = Decimal("0.00")
        invoice.status = Invoice.Status.PAID
        invoice.save()
        _login(api_client, accountant)

        response = api_client.post(
            f"/api/v1/finance/payments/{payment.id}/refund/",
            {"amount": "100.00", "reason": "Withdrawn from school"},
            format="json",
        )
        assert response.status_code == 200
        invoice.refresh_from_db()
        payment.refresh_from_db()
        assert invoice.status == Invoice.Status.UNPAID
        assert invoice.balance == Decimal("100.00")
        assert payment.status == Payment.Status.REFUNDED

    def test_refund_exceeding_payment_rejected(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        payment = PaymentFactory(school=school, invoice=invoice, amount=Decimal("50.00"))
        _login(api_client, accountant)

        response = api_client.post(
            f"/api/v1/finance/payments/{payment.id}/refund/",
            {"amount": "999.00", "reason": "too much"},
            format="json",
        )
        assert response.status_code == 400

    def test_teacher_cannot_issue_refund(self, api_client):
        school, _ = _accountant()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        payment = PaymentFactory(school=school, invoice=invoice, amount=Decimal("50.00"))
        _login(api_client, teacher)

        response = api_client.post(
            f"/api/v1/finance/payments/{payment.id}/refund/", {"amount": "10", "reason": "x"}, format="json"
        )
        assert response.status_code == 403


class TestServiceLayerDirectly:
    """Exercises the concurrency-relevant service functions without the HTTP layer."""

    def test_record_payment_locks_and_updates_balance(self):
        school, _ = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))

        record_payment(invoice=invoice, amount=Decimal("30.00"), method="cash")
        invoice.refresh_from_db()
        assert invoice.balance == Decimal("70.00")
        assert invoice.status == Invoice.Status.PARTIALLY_PAID

    def test_record_payment_rejects_over_balance(self):
        school, _ = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        with pytest.raises(FinanceError):
            record_payment(invoice=invoice, amount=Decimal("200.00"), method="cash")

    def test_record_payment_rejects_duplicate(self):
        school, _ = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        record_payment(invoice=invoice, amount=Decimal("10.00"), method="cash", reference="x")
        with pytest.raises(DuplicatePaymentError):
            record_payment(invoice=invoice, amount=Decimal("10.00"), method="cash", reference="x")

    def test_record_refund_rejects_over_payment_amount(self):
        school, _ = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        payment = record_payment(invoice=invoice, amount=Decimal("50.00"), method="cash")
        with pytest.raises(FinanceError):
            record_refund(payment=payment, amount=Decimal("60.00"), reason="x")


class TestLineItemLockAfterPayment:
    def test_cannot_add_line_item_after_payment(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        PaymentFactory(school=school, invoice=invoice, amount=Decimal("10.00"))
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/finance/invoice-line-items/",
            {"invoice": str(invoice.id), "line_type": "charge", "amount": "20.00"},
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_edit_amount_after_payment_even_without_invoice_in_payload(self, api_client):
        """Regression: the payment-lock check must be object-level (validate()),
        not validate_invoice(), or a plain {"amount": ...} PATCH bypasses it entirely."""
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        line_item = InvoiceLineItemFactory(school=school, invoice=invoice, amount=Decimal("100.00"))
        PaymentFactory(school=school, invoice=invoice, amount=Decimal("10.00"))
        _login(api_client, accountant)

        response = api_client.patch(
            f"/api/v1/finance/invoice-line-items/{line_item.id}/", {"amount": "999.00"}, format="json"
        )
        assert response.status_code == 400

    def test_cannot_delete_line_item_after_payment(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        line_item = InvoiceLineItemFactory(school=school, invoice=invoice, amount=Decimal("100.00"))
        PaymentFactory(school=school, invoice=invoice, amount=Decimal("10.00"))
        _login(api_client, accountant)

        response = api_client.delete(f"/api/v1/finance/invoice-line-items/{line_item.id}/")
        assert response.status_code == 400


class TestInvoiceCancel:
    def test_cancel_unpaid_invoice(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        _login(api_client, accountant)

        response = api_client.post(f"/api/v1/finance/invoices/{invoice.id}/cancel/")
        assert response.status_code == 200
        invoice.refresh_from_db()
        assert invoice.status == Invoice.Status.CANCELLED

    def test_cannot_cancel_invoice_with_payments(self, api_client):
        school, accountant = _accountant()
        invoice = InvoiceFactory(school=school, total=Decimal("100.00"))
        PaymentFactory(school=school, invoice=invoice, amount=Decimal("10.00"))
        invoice.amount_paid = Decimal("10.00")
        invoice.save()
        _login(api_client, accountant)

        response = api_client.post(f"/api/v1/finance/invoices/{invoice.id}/cancel/")
        assert response.status_code == 400


class TestOutstandingAndStats:
    def test_outstanding_only_lists_unpaid_and_partial(self, api_client):
        school, accountant = _accountant()
        InvoiceFactory(school=school, total=Decimal("100.00"), status=Invoice.Status.PAID, amount_paid=Decimal("100.00"))
        unpaid = InvoiceFactory(school=school, total=Decimal("100.00"), status=Invoice.Status.UNPAID)
        _login(api_client, accountant)

        response = api_client.get("/api/v1/finance/invoices/outstanding/")
        assert response.status_code == 200
        ids = {row["id"] for row in response.data["results"]}
        assert str(unpaid.id) in ids
        assert len(ids) == 1

    def test_stats_totals(self, api_client):
        school, accountant = _accountant()
        InvoiceFactory(school=school, total=Decimal("100.00"), amount_paid=Decimal("40.00"), balance=Decimal("60.00"))
        InvoiceFactory(school=school, total=Decimal("200.00"), amount_paid=Decimal("200.00"), balance=Decimal("0.00"))
        _login(api_client, accountant)

        response = api_client.get("/api/v1/finance/invoices/stats/")
        assert response.status_code == 200
        assert response.data["stats"]["total_invoiced"] == 300
        assert response.data["stats"]["total_collected"] == 240
        assert response.data["stats"]["total_outstanding"] == 60


class TestFinanceTenantIsolation:
    def test_cannot_list_another_schools_invoices(self, api_client):
        school_a, accountant_a = _accountant()
        school_b, _ = _accountant()
        InvoiceFactory(school=school_b)
        invoice_a = InvoiceFactory(school=school_a)

        _login(api_client, accountant_a)
        response = api_client.get("/api/v1/finance/invoices/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(invoice_a.id) in ids_seen
        assert len(ids_seen) == 1

    def test_cannot_retrieve_another_schools_payment(self, api_client):
        school_a, accountant_a = _accountant()
        school_b, _ = _accountant()
        payment_b = PaymentFactory(school=school_b)

        _login(api_client, accountant_a)
        response = api_client.get(f"/api/v1/finance/payments/{payment_b.id}/")
        assert response.status_code == 404
