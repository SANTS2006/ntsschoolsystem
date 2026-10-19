import calendar
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.common.background import run_in_background
from apps.finance.services import _next_sequence_number
from apps.notifications.services import notify

from .models import SalaryAdjustment, SalaryPayment, SalaryPaymentLine, StaffSalaryAssignment

ZERO = Decimal("0.00")
DEDUCTION = "deduction"


class SalaryError(Exception):
    """Raised for salary business-rule violations — callers should turn this into a 400/409."""


def month_label(year: int, month: int) -> str:
    return f"{calendar.month_name[month]} {year}"


def _money(value) -> str:
    return f"{Decimal(value):,.2f}"


# ---------------------------------------------------------------------------------------------------------------------
# Breakdown and totals
# ---------------------------------------------------------------------------------------------------------------------

LINE_ORDER = {"basic": 0, "allowance": 1, "deduction": 2}


def sort_lines(lines, type_of=lambda line: line.line_type, text_of=lambda line: line.description):
    """Pay lines read the way a payslip does: basic pay, then allowances/additions, then deductions (stable within each)."""
    return sorted(lines, key=lambda line: (LINE_ORDER.get(type_of(line), 1), text_of(line).lower()))


def _plan_lines(salary_structure):
    """The pay plan's lines as (line_type, description, amount) tuples, in payslip order."""
    items = sort_lines(list(salary_structure.items.all()))
    return [(item.line_type, item.description, item.amount) for item in items]


def _totals_for_structure(salary_structure):
    """Gross/deductions/net of a pay plan on its own (kept for callers that only want the plan's numbers)."""
    gross = ZERO
    deductions = ZERO
    for line_type, _description, amount in _plan_lines(salary_structure):
        if line_type == DEDUCTION:
            deductions += amount
        else:
            gross += amount
    return gross, deductions, gross - deductions


def recompute_payment_totals(payment: SalaryPayment) -> SalaryPayment:
    """Totals follow the lines: gross = basic + allowances + additions, deductions = deduction lines, net = gross - deductions."""
    gross = ZERO
    deductions = ZERO
    for line in SalaryPaymentLine.unscoped_objects.filter(salary_payment=payment):
        if line.line_type == DEDUCTION:
            deductions += line.amount
        else:
            gross += line.amount
    payment.gross_amount, payment.deductions_total, payment.net_amount = gross, deductions, gross - deductions
    payment.save(update_fields=["gross_amount", "deductions_total", "net_amount", "updated_at"])
    return payment


def _adjustment_line_type(adjustment: SalaryAdjustment) -> str:
    return DEDUCTION if adjustment.kind == SalaryAdjustment.Kind.DEDUCTION else "allowance"


def _ensure_plan_lines(payment: SalaryPayment) -> None:
    """Payments made before line-by-line breakdowns existed have totals but no lines. Before changing one that is still pending,
    give it its plan lines (from its pay plan) so recomputing the totals cannot drop the basic pay."""
    if not SalaryPaymentLine.unscoped_objects.filter(salary_payment=payment).exists() and payment.salary_structure_id:
        _rebuild_plan_lines(payment)


def _add_adjustment_line(payment: SalaryPayment, adjustment: SalaryAdjustment) -> None:
    prefix = "Deduction" if adjustment.kind == SalaryAdjustment.Kind.DEDUCTION else "Addition"
    SalaryPaymentLine.unscoped_objects.create(
        school=payment.school,
        salary_payment=payment,
        line_type=_adjustment_line_type(adjustment),
        description=f"{prefix}: {adjustment.reason}",
        amount=adjustment.amount,
        source=SalaryPaymentLine.Source.ADJUSTMENT,
        adjustment=adjustment,
    )
    SalaryAdjustment.unscoped_objects.filter(pk=adjustment.pk).update(salary_payment=payment)


def _rebuild_plan_lines(payment: SalaryPayment) -> None:
    """Replace a payment's plan lines with the plan's current lines (adjustment lines stay)."""
    SalaryPaymentLine.unscoped_objects.filter(salary_payment=payment, source=SalaryPaymentLine.Source.PLAN).delete()
    if payment.salary_structure_id:
        for line_type, description, amount in _plan_lines(payment.salary_structure):
            SalaryPaymentLine.unscoped_objects.create(
                school=payment.school, salary_payment=payment, line_type=line_type, description=description, amount=amount,
                source=SalaryPaymentLine.Source.PLAN,
            )
    recompute_payment_totals(payment)


# ---------------------------------------------------------------------------------------------------------------------
# Monthly generation (+ notification of every staff member)
# ---------------------------------------------------------------------------------------------------------------------

def _notify_payment_generated(payment_ids: list, period_year: int, period_month: int) -> None:
    """In-app + e-mail to each staff member that their salary for the month is ready. Runs in the background so a big school's
    e-mails never hold up the request."""
    label = month_label(period_year, period_month)
    for payment in SalaryPayment.unscoped_objects.filter(pk__in=payment_ids).select_related("staff__user"):
        notify(
            recipient=payment.staff.user,
            category="salary",
            title=f"Your {label} salary is ready",
            message=f"Your pay for {label} has been prepared: gross {_money(payment.gross_amount)}, deductions {_money(payment.deductions_total)}, net {_money(payment.net_amount)}.",
            link="/my-salary",
            email_subject=f"Your salary for {label}",
            email_html=(
                f"<p>Your salary for <strong>{label}</strong> has been prepared.</p>"
                f"<table style='border-collapse:collapse'>"
                f"<tr><td style='padding:4px 16px 4px 0'>Gross pay</td><td><strong>{_money(payment.gross_amount)}</strong></td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0'>Deductions</td><td><strong>{_money(payment.deductions_total)}</strong></td></tr>"
                f"<tr><td style='padding:4px 16px 4px 0'>Net pay</td><td><strong>{_money(payment.net_amount)}</strong></td></tr></table>"
                f"<p>Reference: {payment.payment_number}. Open <em>My salary</em> in the app for the full breakdown.</p>"
            ),
        )


def generate_salary_payments_for_month(*, school, period_year: int, period_month: int, created_by=None):
    """Bulk-creates one SalaryPayment per staff member with an assigned SalaryStructure, with its line-by-line breakdown (plan
    lines + any one-off adjustments set for that month), and notifies each of them (in-app and e-mail). Skips anyone who already
    has a payment for that (staff, period_year, period_month) — idempotent re-run, mirroring generate_invoices_from_structure."""
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
            payment = SalaryPayment.objects.create(
                school=school,
                staff=assignment.staff,
                salary_structure=assignment.salary_structure,
                period_year=period_year,
                period_month=period_month,
                payment_number=_next_sequence_number(school=school, model=SalaryPayment, prefix="SAL"),
            )
            for line_type, description, amount in _plan_lines(assignment.salary_structure):
                SalaryPaymentLine.unscoped_objects.create(
                    school=school, salary_payment=payment, line_type=line_type, description=description, amount=amount,
                    source=SalaryPaymentLine.Source.PLAN,
                )
            for adjustment in SalaryAdjustment.unscoped_objects.filter(
                staff=assignment.staff, period_year=period_year, period_month=period_month, salary_payment__isnull=True
            ):
                _add_adjustment_line(payment, adjustment)
            recompute_payment_totals(payment)
            created.append(payment)
    if created:
        run_in_background("salary generated notifications", _notify_payment_generated, [p.pk for p in created], period_year, period_month)
    return created, skipped


# ---------------------------------------------------------------------------------------------------------------------
# One-off deductions / additions
# ---------------------------------------------------------------------------------------------------------------------

def add_adjustment(*, school, staff, kind: str, amount: Decimal, reason: str, period_year: int, period_month: int, created_by=None) -> SalaryAdjustment:
    """Records a deduction or addition for one staff member and month. If that month's payment already exists it is updated
    straight away (only while it is still pending — a paid salary is never rewritten); otherwise the adjustment waits and is
    folded in when the payment is generated. The staff member is notified either way."""
    reason = (reason or "").strip()
    if not reason:
        raise SalaryError("State the reason.")
    if amount is None or amount <= 0:
        raise SalaryError("The amount must be more than zero.")
    with transaction.atomic():
        payment = SalaryPayment.unscoped_objects.select_for_update().filter(staff=staff, period_year=period_year, period_month=period_month).first()
        if payment is not None and payment.status != SalaryPayment.Status.PENDING:
            raise SalaryError(
                f"{month_label(period_year, period_month)} has already been {payment.status} for this staff member, so it can no longer be changed. Choose a later month."
            )
        adjustment = SalaryAdjustment.objects.create(
            school=school, staff=staff, kind=kind, amount=amount, reason=reason, period_year=period_year, period_month=period_month, created_by=created_by
        )
        if payment is not None:
            _ensure_plan_lines(payment)
            _add_adjustment_line(payment, adjustment)
            recompute_payment_totals(payment)
    _notify_adjustment(adjustment, reversed_=False)
    return adjustment


def remove_adjustment(*, adjustment: SalaryAdjustment) -> None:
    """Reverses an adjustment that has not been paid out. The staff member is told."""
    with transaction.atomic():
        adjustment = SalaryAdjustment.unscoped_objects.select_for_update().get(pk=adjustment.pk)
        payment = adjustment.salary_payment
        if payment is not None and payment.status != SalaryPayment.Status.PENDING:
            raise SalaryError("This has already been paid out and can no longer be reversed.")
        if payment is not None:
            _ensure_plan_lines(payment)
        SalaryPaymentLine.unscoped_objects.filter(adjustment=adjustment).delete()
        adjustment.delete()
        if payment is not None:
            recompute_payment_totals(payment)
    _notify_adjustment(adjustment, reversed_=True)


def _notify_adjustment(adjustment: SalaryAdjustment, *, reversed_: bool) -> None:
    label = month_label(adjustment.period_year, adjustment.period_month)
    is_deduction = adjustment.kind == SalaryAdjustment.Kind.DEDUCTION
    what = "deduction" if is_deduction else "addition"
    if reversed_:
        title = f"A salary {what} was reversed"
        message = f"The {what} of {_money(adjustment.amount)} ({adjustment.reason}) for {label} has been reversed."
    else:
        title = f"A {what} was made on your salary"
        message = f"{'A deduction of' if is_deduction else 'An addition of'} {_money(adjustment.amount)} was applied to your {label} salary. Reason: {adjustment.reason}"
    notify(
        recipient=adjustment.staff.user,
        category="salary",
        title=title,
        message=message,
        link="/my-salary",
        email_subject=title,
        email_html=f"<p>{message}</p><p>You can see it in <em>My salary</em> in the app.</p>",
    )


# ---------------------------------------------------------------------------------------------------------------------
# Pay plan changes: refresh pending payments, tell the people affected
# ---------------------------------------------------------------------------------------------------------------------

def refresh_pending_payments(*, salary_structure=None, staff=None) -> int:
    """After a pay plan (or someone's plan) changes, rebuild the plan lines of every payment that has NOT been paid yet, so the
    figures they will receive are correct. Paid salaries are history and are never touched. Returns how many were refreshed."""
    qs = SalaryPayment.unscoped_objects.filter(status=SalaryPayment.Status.PENDING).select_related("salary_structure")
    if salary_structure is not None:
        qs = qs.filter(salary_structure=salary_structure)
    if staff is not None:
        qs = qs.filter(staff=staff)
    count = 0
    for payment in qs:
        _rebuild_plan_lines(payment)
        count += 1
    return count


def notify_plan_changed(*, staff_members, summary: str) -> None:
    """Tell each affected staff member that their pay plan changed (in-app + e-mail). Uses the background runner: a plan with
    many staff must not hold the request up."""
    ids = [s.pk for s in staff_members]
    if ids:
        run_in_background("salary plan change notifications", _notify_plan_changed, ids, summary)


def _notify_plan_changed(staff_ids, summary: str) -> None:
    from apps.staff.models import Staff

    for staff in Staff.unscoped_objects.filter(pk__in=staff_ids).select_related("user"):
        notify(
            recipient=staff.user,
            category="salary",
            title="Your pay plan changed",
            message=summary,
            link="/my-salary",
            email_subject="Your pay plan changed",
            email_html=f"<p>{summary}</p><p>The full breakdown is under <em>My salary</em> in the app.</p>",
        )


def plan_summary(salary_structure) -> str:
    gross, deductions, net = _totals_for_structure(salary_structure)
    return f'"{salary_structure.name}": gross {_money(gross)}, deductions {_money(deductions)}, net {_money(net)} per month.'


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

    label = month_label(salary_payment.period_year, salary_payment.period_month)
    notify(
        recipient=salary_payment.staff.user,
        category="salary",
        title="Salary payment processed",
        message=f"Your {label} salary ({salary_payment.payment_number}) of {_money(salary_payment.net_amount)} has been paid.",
        link=f"/my-salary/receipts/{salary_payment.pk}",
        email_subject=f"Salary payment: {salary_payment.payment_number}",
        email_html=(
            f"<p>Your salary for {label} has been paid.</p><p>Net amount: <strong>{_money(salary_payment.net_amount)}</strong></p>"
            f"<p>Reference: {salary_payment.payment_number}. Your receipt is under <em>My salary</em> in the app.</p>"
        ),
    )
    return salary_payment
