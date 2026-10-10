from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.finance.services import _next_sequence_number
from apps.notifications.services import notify

from .models import SalaryPayment, StaffSalaryAssignment

ZERO = Decimal("0.00")


class SalaryError(Exception):
    """Raised for salary business-rule violations — callers should turn this into a 400/409."""


def _totals_for_structure(salary_structure):
    """Snapshot gross/deductions/net from a SalaryStructure's current items. See
    SalaryPayment's own docstring for why this is only ever read once, at generation time."""
    gross = ZERO
    deductions = ZERO
    for item in salary_structure.items.all():
        if item.line_type == item.LineType.DEDUCTION:
            deductions += item.amount
        else:
            gross += item.amount
    return gross, deductions, gross - deductions


def generate_salary_payments_for_month(*, school, period_year: int, period_month: int, created_by=None):
    """Bulk-creates one SalaryPayment per staff member with an assigned SalaryStructure. Skips
    anyone who already has a payment for that (staff, period_year, period_month) — idempotent
    re-run, mirroring generate_invoices_from_structure."""
    created = []
    skipped = []
    assignments = list(
        StaffSalaryAssignment.unscoped_objects.filter(school=school).select_related("staff", "salary_structure")
    )
    with transaction.atomic():
        for assignment in assignments:
            if SalaryPayment.unscoped_objects.filter(
                staff=assignment.staff, period_year=period_year, period_month=period_month
            ).exists():
                skipped.append(assignment.staff_id)
                continue
            gross, deductions, net = _totals_for_structure(assignment.salary_structure)
            payment = SalaryPayment.objects.create(
                school=school,
                staff=assignment.staff,
                salary_structure=assignment.salary_structure,
                period_year=period_year,
                period_month=period_month,
                payment_number=_next_sequence_number(school=school, model=SalaryPayment, prefix="SAL"),
                gross_amount=gross,
                deductions_total=deductions,
                net_amount=net,
            )
            created.append(payment)
    return created, skipped


@transaction.atomic
def record_salary_payment(*, salary_payment, method: str, reference: str = "", paid_at=None, recorded_by=None) -> SalaryPayment:
    """Marks a pending SalaryPayment paid and notifies the staff member. See
    apps.finance.services.record_payment for why unscoped_objects + select_for_update is used."""
    salary_payment = SalaryPayment.unscoped_objects.select_for_update().get(pk=salary_payment.pk)

    if salary_payment.status != SalaryPayment.Status.PENDING:
        raise SalaryError(f"Cannot pay a salary payment that is already {salary_payment.status}.")

    salary_payment.status = SalaryPayment.Status.PAID
    salary_payment.method = method
    salary_payment.reference = reference
    salary_payment.paid_at = paid_at or timezone.now()
    salary_payment.recorded_by = recorded_by
    salary_payment.save(update_fields=["status", "method", "reference", "paid_at", "recorded_by", "updated_at"])

    notify(
        recipient=salary_payment.staff.user,
        category="salary",
        title="Salary payment processed",
        message=f"Your salary payment {salary_payment.payment_number} of {salary_payment.net_amount} has been paid.",
        link="/salary/payments",
        email_subject=f"Salary payment: {salary_payment.payment_number}",
        email_html=(
            f"<p>Your salary payment for {salary_payment.period_month}/{salary_payment.period_year} has been "
            f"processed.</p><p>Net amount: {salary_payment.net_amount}</p>"
            f"<p>Reference: {salary_payment.payment_number}</p>"
        ),
    )
    return salary_payment
