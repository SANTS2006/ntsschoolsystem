from decimal import Decimal

import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.notifications.models import Notification
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, StaffFactory, UserFactory

from .models import SalaryAdjustment, SalaryPayment, SalaryPaymentLine, SalaryStructure, SalaryStructureItem, StaffSalaryAssignment

pytestmark = pytest.mark.django_db

BASE = "/api/v1/salary"


@pytest.fixture(autouse=True)
def _sync_background(settings):
    settings.BACKGROUND_TASKS_ASYNC = False
    settings.BREVO_API_KEY = ""  # e-mail is a no-op in tests; the in-app notification is what is asserted


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def world():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    accountant = UserFactory(school=school)
    assign_role(user=accountant, role=Role.unscoped_objects.get(school=school, slug="accountant"))
    plan = SalaryStructure.objects.create(school=school, name="Teacher A")
    SalaryStructureItem.objects.create(school=school, salary_structure=plan, line_type="basic", description="Basic pay", amount=Decimal("1000.00"))
    SalaryStructureItem.objects.create(school=school, salary_structure=plan, line_type="allowance", description="Transport", amount=Decimal("200.00"))
    SalaryStructureItem.objects.create(school=school, salary_structure=plan, line_type="deduction", description="Pension", amount=Decimal("100.00"))
    staff = StaffFactory(school=school)
    other = StaffFactory(school=school)
    for member in (staff, other):
        StaffSalaryAssignment.objects.create(school=school, staff=member, salary_structure=plan)
        assign_role(user=member.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return dict(school=school, accountant=accountant, plan=plan, staff=staff, other=other)


def _generate(api_client, month=3, year=2027):
    return api_client.post(f"{BASE}/payments/generate/", {"period_year": year, "period_month": month}, format="json")


def _notes(user):
    return list(Notification.unscoped_objects.filter(recipient=user).order_by("created_at").values_list("title", flat=True))


class TestMonthlyGeneration:
    def test_every_staff_member_gets_a_breakdown_and_is_notified(self, api_client, world):
        _login(api_client, world["accountant"])
        response = _generate(api_client)
        assert response.status_code == 200
        payment = SalaryPayment.unscoped_objects.get(staff=world["staff"])
        assert (payment.gross_amount, payment.deductions_total, payment.net_amount) == (Decimal("1200.00"), Decimal("100.00"), Decimal("1100.00"))
        assert sorted(line.description for line in SalaryPaymentLine.unscoped_objects.filter(salary_payment=payment)) == ["Basic pay", "Pension", "Transport"]
        for member in (world["staff"], world["other"]):
            assert _notes(member.user) == ["Your March 2027 salary is ready"]

    def test_running_it_twice_changes_nothing_and_notifies_nobody_twice(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client)
        _generate(api_client)
        assert SalaryPayment.unscoped_objects.count() == 2
        assert len(_notes(world["staff"].user)) == 1


class TestIndividualDeductions:
    def _post(self, api_client, world, **over):
        body = {"staff": str(world["staff"].pk), "kind": "deduction", "amount": "50.00", "reason": "Salary advance recovered", "period_year": 2027, "period_month": 3, **over}
        return api_client.post(f"{BASE}/adjustments/", body, format="json")

    def test_a_deduction_on_a_pending_payment_applies_at_once_and_the_staff_member_is_told(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client)
        response = self._post(api_client, world)
        assert response.status_code == 201, response.data
        payment = SalaryPayment.unscoped_objects.get(staff=world["staff"])
        assert payment.deductions_total == Decimal("150.00") and payment.net_amount == Decimal("1050.00")
        assert any("Salary advance recovered" in line.description for line in SalaryPaymentLine.unscoped_objects.filter(salary_payment=payment))
        assert "A deduction was made on your salary" in _notes(world["staff"].user)
        note = Notification.unscoped_objects.filter(recipient=world["staff"].user, title__startswith="A deduction").get()
        assert "Salary advance recovered" in note.message and note.link == "/my-salary"
        assert "A deduction was made on your salary" not in _notes(world["other"].user)  # nobody else is told

    def test_a_deduction_for_a_month_not_yet_generated_waits_and_is_folded_in_later(self, api_client, world):
        _login(api_client, world["accountant"])
        assert self._post(api_client, world, period_month=4).status_code == 201
        adjustment = SalaryAdjustment.unscoped_objects.get()
        assert adjustment.salary_payment_id is None
        _generate(api_client, month=4)
        payment = SalaryPayment.unscoped_objects.get(staff=world["staff"], period_month=4)
        assert payment.net_amount == Decimal("1050.00")
        adjustment.refresh_from_db()
        assert adjustment.salary_payment_id == payment.pk

    def test_an_addition_raises_the_pay(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client)
        self._post(api_client, world, kind="addition", amount="300.00", reason="Exam supervision bonus")
        payment = SalaryPayment.unscoped_objects.get(staff=world["staff"])
        assert payment.gross_amount == Decimal("1500.00") and payment.net_amount == Decimal("1400.00")

    def test_a_paid_month_cannot_be_changed(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client)
        payment = SalaryPayment.unscoped_objects.get(staff=world["staff"])
        api_client.post(f"{BASE}/payments/{payment.pk}/pay/", {"method": "cash"}, format="json")
        response = self._post(api_client, world)
        assert response.status_code == 400 and "already" in response.data["message"]
        assert SalaryAdjustment.unscoped_objects.count() == 0
        payment.refresh_from_db()
        assert payment.net_amount == Decimal("1100.00")

    def test_the_reason_and_a_positive_amount_are_required(self, api_client, world):
        _login(api_client, world["accountant"])
        assert self._post(api_client, world, reason="  ").status_code == 400
        assert self._post(api_client, world, amount="0").status_code == 400
        assert self._post(api_client, world, amount="-5").status_code == 400
        assert SalaryAdjustment.unscoped_objects.count() == 0

    def test_a_deduction_can_be_reversed_before_payment_and_the_staff_member_is_told(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client)
        created = self._post(api_client, world).data["adjustment"]
        assert api_client.delete(f"{BASE}/adjustments/{created['id']}/").status_code == 204
        payment = SalaryPayment.unscoped_objects.get(staff=world["staff"])
        assert payment.net_amount == Decimal("1100.00")
        assert "A salary deduction was reversed" in _notes(world["staff"].user)

    def test_only_people_with_salary_permissions_can_make_them(self, api_client, world):
        _login(api_client, world["staff"].user)  # a teacher
        assert self._post(api_client, world).status_code == 403
        assert api_client.get(f"{BASE}/adjustments/").status_code == 403


class TestPlanChanges:
    def test_changing_a_plan_line_refreshes_unpaid_pay_leaves_paid_pay_alone_and_notifies(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client, month=3)
        paid = SalaryPayment.unscoped_objects.get(staff=world["staff"], period_month=3)
        api_client.post(f"{BASE}/payments/{paid.pk}/pay/", {"method": "cash"}, format="json")
        _generate(api_client, month=4)  # April stays pending
        transport = SalaryStructureItem.unscoped_objects.get(description="Transport")
        response = api_client.patch(f"{BASE}/salary-structure-items/{transport.pk}/", {"amount": "350.00"}, format="json")
        assert response.status_code == 200
        april = SalaryPayment.unscoped_objects.get(staff=world["staff"], period_month=4)
        assert april.gross_amount == Decimal("1350.00") and april.net_amount == Decimal("1250.00")
        paid.refresh_from_db()
        assert paid.net_amount == Decimal("1100.00")  # March was already paid: history is untouched
        note = Notification.unscoped_objects.filter(recipient=world["staff"].user, title="Your pay plan changed").get()
        assert "increased from 200.00 to 350.00" in note.message and "net 1,250.00" in note.message
        assert Notification.unscoped_objects.filter(recipient=world["other"].user, title="Your pay plan changed").exists()

    def test_adding_or_removing_a_line_notifies(self, api_client, world):
        _login(api_client, world["accountant"])
        added = api_client.post(
            f"{BASE}/salary-structure-items/",
            {"salary_structure": str(world["plan"].pk), "line_type": "allowance", "description": "Housing", "amount": "80.00"},
            format="json",
        )
        assert added.status_code == 201
        assert Notification.unscoped_objects.filter(recipient=world["staff"].user, message__contains="Housing").exists()
        assert api_client.delete(f"{BASE}/salary-structure-items/{added.data['id']}/").status_code == 204
        assert Notification.unscoped_objects.filter(recipient=world["staff"].user, message__contains="removed").exists()

    def test_putting_someone_on_a_plan_notifies_them(self, api_client, world):
        newcomer = StaffFactory(school=world["school"])
        _login(api_client, world["accountant"])
        response = api_client.post(
            f"{BASE}/staff-salary-assignments/",
            {"staff": str(newcomer.pk), "salary_structure": str(world["plan"].pk), "effective_from": "2027-01-01"},
            format="json",
        )
        assert response.status_code == 201
        assert _notes(newcomer.user) == ["Your pay plan changed"]


class TestMySalary:
    def test_staff_see_their_plan_line_by_line_and_their_payments(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client)
        api_client.post("/api/v1/auth/logout/")
        _login(api_client, world["staff"].user)
        body = api_client.get(f"{BASE}/my-salary/").data
        assert body["has_plan"] is True and body["plan"]["name"] == "Teacher A"
        assert [(line["description"], line["line_type"]) for line in body["plan"]["lines"]] == [("Basic pay", "basic"), ("Transport", "allowance"), ("Pension", "deduction")]
        assert (Decimal(str(body["plan"]["gross"])), Decimal(str(body["plan"]["net"]))) == (Decimal("1200.00"), Decimal("1100.00"))
        assert len(body["payments"]) == 1 and body["payments"][0]["status"] == "pending"

    def test_the_receipt_shows_the_breakdown_and_only_for_the_owner(self, api_client, world):
        _login(api_client, world["accountant"])
        _generate(api_client)
        mine = SalaryPayment.unscoped_objects.get(staff=world["staff"])
        theirs = SalaryPayment.unscoped_objects.get(staff=world["other"])
        api_client.post("/api/v1/auth/logout/")
        _login(api_client, world["staff"].user)
        receipt = api_client.get(f"{BASE}/my-payments/{mine.pk}/").data["payment"]
        assert receipt["has_breakdown"] is True and len(receipt["lines"]) == 3 and receipt["month_label"] == "March 2027"
        assert api_client.get(f"{BASE}/my-payments/{theirs.pk}/").status_code == 404

    def test_a_person_with_no_staff_record_gets_an_empty_page(self, api_client, world):
        outsider = UserFactory(school=world["school"])
        _login(api_client, outsider)
        body = api_client.get(f"{BASE}/my-salary/").data
        assert body["has_plan"] is False and body["payments"] == []

    def test_the_sidebar_flag_is_true_only_for_people_on_a_plan(self, api_client, world):
        _login(api_client, world["staff"].user)
        assert api_client.get("/api/v1/auth/me/").data["user"]["has_salary"] is True
        api_client.post("/api/v1/auth/logout/")
        unpaid = StaffFactory(school=world["school"])
        _login(api_client, unpaid.user)
        assert api_client.get("/api/v1/auth/me/").data["user"]["has_salary"] is False


class TestOlderPaymentsWithoutLines:
    def test_a_pending_payment_made_before_breakdowns_existed_keeps_its_basic_pay_when_adjusted(self, api_client, world):
        payment = SalaryPayment.objects.create(
            school=world["school"], staff=world["staff"], salary_structure=world["plan"], period_year=2027, period_month=5,
            payment_number="SAL-OLD", gross_amount=Decimal("1200.00"), deductions_total=Decimal("100.00"), net_amount=Decimal("1100.00"),
        )
        assert SalaryPaymentLine.unscoped_objects.filter(salary_payment=payment).count() == 0
        _login(api_client, world["accountant"])
        body = {"staff": str(world["staff"].pk), "kind": "deduction", "amount": "20.00", "reason": "Late arrival", "period_year": 2027, "period_month": 5}
        assert api_client.post(f"{BASE}/adjustments/", body, format="json").status_code == 201
        payment.refresh_from_db()
        assert payment.net_amount == Decimal("1080.00")
