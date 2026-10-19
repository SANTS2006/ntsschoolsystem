from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.academics.models import AcademicYear, Term
from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.notifications.models import Notification
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AcademicYearFactory,
    FeeCategoryFactory,
    InvoiceFactory,
    PaymentFactory,
    SchoolFactory,
    StudentFactory,
    TermFactory,
    UserFactory,
)

from .models import Invoice, InvoiceLineItem
from . import services

pytestmark = pytest.mark.django_db

FIN = "/api/v1/finance"


@pytest.fixture(autouse=True)
def _quiet(settings):
    settings.BACKGROUND_TASKS_ASYNC = False
    settings.BREVO_API_KEY = ""


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


def _staff(school, slug):
    user = UserFactory(school=school)
    assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug=slug))
    return user


def _notes(user, **filters):
    return Notification.unscoped_objects.filter(recipient=user, **filters)


@pytest.fixture
def world():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    accountant = _staff(school, "accountant")
    y_old = AcademicYearFactory(school=school, name="2025/2026", start_date=date(2025, 9, 1), end_date=date(2026, 7, 31), is_current=False)
    y_now = AcademicYearFactory(school=school, name="2026/2027", start_date=date(2026, 9, 1), end_date=date(2027, 7, 31), is_current=True)
    t1 = TermFactory(school=school, academic_year=y_now, name="Term 1", sequence=1)
    t2 = TermFactory(school=school, academic_year=y_now, name="Term 2", sequence=2)
    t_old = TermFactory(school=school, academic_year=y_old, name="Term 1", sequence=1)
    student_user = _staff(school, "student")
    student = StudentFactory(school=school, first_name="Ama", user=student_user, status="active")
    other_user = _staff(school, "student")
    other = StudentFactory(school=school, first_name="Kofi", user=other_user, status="active")
    return dict(school=school, accountant=accountant, y_old=y_old, y_now=y_now, t1=t1, t2=t2, t_old=t_old, student=student, student_user=student_user, other=other, other_user=other_user)


def _invoice(world, student=None, year=None, term=None, total="500.00", paid="0.00", due=None, **extra):
    total, paid = Decimal(total), Decimal(paid)
    status = "paid" if paid >= total else "partially_paid" if paid > 0 else "unpaid"
    return InvoiceFactory(
        school=world["school"], student=student or world["student"], academic_year=year or world["y_now"], term=term, subtotal=total, total=total,
        amount_paid=paid, balance=total - paid, status=status, due_date=due, **extra,
    )


class TestMyFees:
    def test_the_statement_is_grouped_by_year_and_term_with_totals_and_receipts(self, api_client, world):
        paid_inv = _invoice(world, term=world["t1"], total="500.00", paid="500.00")
        PaymentFactory(school=world["school"], invoice=paid_inv, amount=Decimal("500.00"))
        _invoice(world, term=world["t2"], total="300.00", paid="100.00", due=date(2020, 1, 1))  # overdue and part paid
        _invoice(world, year=world["y_old"], term=world["t_old"], total="200.00")
        InvoiceLineItem.objects.create(school=world["school"], invoice=paid_inv, line_type="charge", description="Tuition", amount=Decimal("500.00"))

        _login(api_client, world["student_user"])
        body = api_client.get(f"{FIN}/my-fees/").data
        assert body["is_student"] is True
        summary = body["summary"]
        assert (Decimal(str(summary["billed"])), Decimal(str(summary["paid"])), Decimal(str(summary["outstanding"])), Decimal(str(summary["overdue"]))) == (
            Decimal("1000.00"), Decimal("600.00"), Decimal("400.00"), Decimal("200.00"),
        )
        assert summary["status"] == "overdue"
        assert [y["academic_year"] for y in body["years"]] == ["2026/2027", "2025/2026"]
        current = body["years"][0]
        assert [t["term"] for t in current["terms"]] == ["Term 1", "Term 2"]
        assert Decimal(str(current["totals"]["outstanding"])) == Decimal("200.00")
        first = current["terms"][0]["invoices"][0]
        assert first["status"] == "paid" and first["line_items"][0]["description"] == "Tuition" and first["payments"][0]["receipt_number"]

    def test_cancelled_invoices_are_left_out(self, api_client, world):
        _invoice(world, term=world["t1"], total="100.00")
        Invoice.unscoped_objects.filter(student=world["student"]).update(status="cancelled")
        _login(api_client, world["student_user"])
        body = api_client.get(f"{FIN}/my-fees/").data
        assert body["summary"]["invoice_count"] == 0 and body["summary"]["status"] == "none" and body["years"] == []

    def test_everything_paid_says_so(self, api_client, world):
        _invoice(world, term=world["t1"], total="100.00", paid="100.00")
        _login(api_client, world["student_user"])
        assert api_client.get(f"{FIN}/my-fees/").data["summary"]["status"] == "paid"

    def test_a_student_never_sees_another_students_fees(self, api_client, world):
        _invoice(world, student=world["other"], term=world["t1"], total="800.00")
        _login(api_client, world["student_user"])
        body = api_client.get(f"{FIN}/my-fees/").data
        assert body["summary"]["invoice_count"] == 0

    def test_staff_get_an_empty_answer(self, api_client, world):
        _login(api_client, world["accountant"])
        assert api_client.get(f"{FIN}/my-fees/").data["is_student"] is False

    def test_a_receipt_is_only_visible_to_the_student_it_belongs_to(self, api_client, world):
        invoice = _invoice(world, term=world["t1"], total="500.00", paid="500.00")
        payment = PaymentFactory(school=world["school"], invoice=invoice, amount=Decimal("500.00"))
        _login(api_client, world["student_user"])
        receipt = api_client.get(f"{FIN}/my-fees/receipts/{payment.pk}/").data["receipt"]
        assert receipt["receipt_number"] == payment.receipt_number and receipt["student_name"].startswith("Ama")
        api_client.post("/api/v1/auth/logout/")
        _login(api_client, world["other_user"])
        assert api_client.get(f"{FIN}/my-fees/receipts/{payment.pk}/").status_code == 404


class TestFeeChangesNotifyTheStudent:
    def test_raising_a_line_item_notifies_with_the_old_and_new_figures(self, api_client, world):
        invoice = _invoice(world, term=world["t1"], total="500.00")
        item = InvoiceLineItem.objects.create(school=world["school"], invoice=invoice, line_type="charge", description="Tuition", amount=Decimal("500.00"))
        _login(api_client, world["accountant"])
        response = api_client.patch(f"{FIN}/invoice-line-items/{item.pk}/", {"amount": "650.00"}, format="json")
        assert response.status_code == 200
        invoice.refresh_from_db()
        assert invoice.total == Decimal("650.00")
        note = _notes(world["student_user"], title="Your fees were updated").get()
        assert "from 500.00 to 650.00" in note.message and note.link == "/my-fees"
        assert not _notes(world["other_user"]).exists()

    def test_a_discount_notifies_as_a_reduction(self, api_client, world):
        invoice = _invoice(world, term=world["t1"], total="500.00")
        InvoiceLineItem.objects.create(school=world["school"], invoice=invoice, line_type="charge", description="Tuition", amount=Decimal("500.00"))
        category = FeeCategoryFactory(school=world["school"])
        _login(api_client, world["accountant"])
        response = api_client.post(
            f"{FIN}/invoice-line-items/",
            {"invoice": str(invoice.pk), "fee_category": str(category.pk), "line_type": "discount", "description": "Sibling discount", "amount": "-100.00"},
            format="json",
        )
        assert response.status_code == 201, response.data
        assert _notes(world["student_user"], title="Your fees were reduced").exists()

    def test_a_change_that_leaves_the_total_alone_notifies_nobody(self, api_client, world):
        invoice = _invoice(world, term=world["t1"], total="500.00")
        item = InvoiceLineItem.objects.create(school=world["school"], invoice=invoice, line_type="charge", description="Tuition", amount=Decimal("500.00"))
        _login(api_client, world["accountant"])
        api_client.patch(f"{FIN}/invoice-line-items/{item.pk}/", {"description": "Tuition fee"}, format="json")
        assert not _notes(world["student_user"]).exists()

    def test_a_new_invoice_and_a_payment_reach_the_student_not_only_guardians(self, world):
        invoice = services.create_invoice_with_line_items(
            school=world["school"], student=world["student"], academic_year=world["y_now"], term=world["t1"],
            line_items=[{"line_type": "charge", "description": "Tuition", "amount": Decimal("400.00")}],
        )
        assert _notes(world["student_user"], title="New invoice issued").exists()
        services.record_payment(invoice=invoice, amount=Decimal("100.00"), method="cash")
        assert _notes(world["student_user"], title="Payment received").exists()


class TestReminders:
    def test_the_accountant_reminds_everyone_who_still_owes_and_nobody_else(self, api_client, world):
        _invoice(world, term=world["t1"], total="500.00", paid="200.00")  # owes
        _invoice(world, student=world["other"], term=world["t1"], total="400.00", paid="400.00")  # settled
        _login(api_client, world["accountant"])
        response = api_client.post(f"{FIN}/invoices/send-reminders/", {"academic_year": str(world["y_now"].pk)}, format="json")
        assert response.status_code == 200, response.data
        assert response.data["sent"] == 1
        note = _notes(world["student_user"], title="Fee payment reminder").get()
        assert "300.00" in note.message and note.link == "/my-fees"
        assert not _notes(world["other_user"]).exists()
        invoice = Invoice.unscoped_objects.get(student=world["student"])
        assert invoice.reminder_count == 1 and invoice.last_reminder_at is not None

    def test_a_second_send_within_a_day_is_skipped_unless_forced(self, api_client, world):
        _invoice(world, term=world["t1"], total="500.00")
        _login(api_client, world["accountant"])
        first = api_client.post(f"{FIN}/invoices/send-reminders/", {}, format="json").data
        again = api_client.post(f"{FIN}/invoices/send-reminders/", {}, format="json").data
        forced = api_client.post(f"{FIN}/invoices/send-reminders/", {"force": True}, format="json").data
        assert (first["sent"], again["sent"], again["skipped_recent"], forced["sent"]) == (1, 0, 1, 1)
        assert _notes(world["student_user"], title="Fee payment reminder").count() == 2

    def test_only_overdue_filters_and_an_optional_note_is_included(self, api_client, world):
        _invoice(world, term=world["t1"], total="500.00", due=date(2020, 1, 1))
        _invoice(world, student=world["other"], term=world["t1"], total="500.00", due=timezone.now().date() + timedelta(days=30))
        _login(api_client, world["accountant"])
        response = api_client.post(f"{FIN}/invoices/send-reminders/", {"only_overdue": True, "note": "Please clear this week."}, format="json")
        assert response.data["sent"] == 1
        assert "Please clear this week." in _notes(world["student_user"], title="Fee payment reminder").get().message
        assert not _notes(world["other_user"]).exists()

    def test_one_invoice_can_be_reminded_and_a_paid_one_cannot(self, api_client, world):
        owing = _invoice(world, term=world["t1"], total="500.00")
        settled = _invoice(world, student=world["other"], term=world["t2"], total="100.00", paid="100.00")
        _login(api_client, world["accountant"])
        assert api_client.post(f"{FIN}/invoices/{owing.pk}/remind/", {}, format="json").status_code == 200
        assert api_client.post(f"{FIN}/invoices/{owing.pk}/remind/", {}, format="json").status_code == 400  # already reminded today
        assert api_client.post(f"{FIN}/invoices/{settled.pk}/remind/", {}, format="json").status_code == 400

    def test_a_student_without_any_account_to_reach_is_reported_not_marked_reminded(self, api_client, world):
        ghost = StudentFactory(school=world["school"], status="active")  # no portal account, no guardians
        invoice = _invoice(world, student=ghost, term=world["t1"], total="500.00")
        _login(api_client, world["accountant"])
        data = api_client.post(f"{FIN}/invoices/send-reminders/", {"invoice_ids": [str(invoice.pk)]}, format="json").data
        assert data["sent"] == 0 and data["no_recipient"] == 1
        assert Invoice.unscoped_objects.get(pk=invoice.pk).reminder_count == 0

    def test_only_people_who_manage_fees_can_send_reminders(self, api_client, world):
        _invoice(world, term=world["t1"], total="500.00")
        _login(api_client, world["student_user"])
        assert api_client.post(f"{FIN}/invoices/send-reminders/", {}, format="json").status_code == 403
        api_client.post("/api/v1/auth/logout/")
        _login(api_client, _staff(world["school"], "teacher"))
        assert api_client.post(f"{FIN}/invoices/send-reminders/", {}, format="json").status_code == 403
        assert not _notes(world["student_user"]).exists()
