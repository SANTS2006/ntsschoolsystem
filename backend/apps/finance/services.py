from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.parents.services import notify_student_guardians

from .models import FeeStructureItem, Invoice, Payment, Refund

DUPLICATE_PAYMENT_WINDOW_SECONDS = 10


class FinanceError(Exception):
    """Raised for finance business-rule violations — callers should turn this into a 400/409."""


class DuplicatePaymentError(FinanceError):
    pass


def _next_sequence_number(*, school, model, prefix: str) -> str:
    """
    Simple per-school incrementing identifier (e.g. "INV-000123"). Not
    perfectly race-proof under heavy concurrent creation (two requests could
    both read the same count before either commits) — the DB unique
    constraint on (school, field) is the actual correctness guarantee; a
    collision here fails the request cleanly rather than silently
    corrupting numbering. Acceptable for the volume this system handles;
    revisit with a dedicated sequence table if that changes.
    """
    count = model.unscoped_objects.filter(school=school).count()
    return f"{prefix}-{count + 1:06d}"


def create_invoice_with_line_items(*, school, student, academic_year, line_items, term=None, fee_structure=None, due_date=None):
    """
    line_items: list of dicts with keys fee_category (optional), line_type,
    description, amount. Creates the Invoice then its line items, then
    computes totals once — all in one transaction.
    """
    with transaction.atomic():
        invoice = Invoice.objects.create(
            school=school,
            student=student,
            academic_year=academic_year,
            term=term,
            fee_structure=fee_structure,
            due_date=due_date,
            invoice_number=_next_sequence_number(school=school, model=Invoice, prefix="INV"),
        )
        for item in line_items:
            invoice.line_items.create(
                school=school,
                fee_category=item.get("fee_category"),
                line_type=item.get("line_type", "charge"),
                description=item.get("description", ""),
                amount=item["amount"],
            )
        invoice.recalculate_amounts()
        notify_student_guardians(
            student,
            category="finance",
            title="New invoice issued",
            message=f"Invoice {invoice.invoice_number} for {invoice.total} has been issued.",
            link="/finance/invoices",
            email_subject=f"New invoice: {invoice.invoice_number}",
            email_html=(
                f"<p>A new invoice ({invoice.invoice_number}) for {invoice.total} has been issued "
                f"for {student.full_name}"
                + (f", due {invoice.due_date:%Y-%m-%d}" if invoice.due_date else "")
                + ".</p>"
            ),
        )
        return invoice


def generate_invoices_from_structure(*, fee_structure, students, due_date=None, created_by=None):
    """Bulk-creates one invoice per student from a FeeStructure's items. Skips a student who
    already has an invoice from this exact fee_structure (idempotent re-run)."""
    created = []
    skipped = []
    # unscoped_objects: this is called from request-scoped views *and*
    # directly (services/tests/future management commands) with no ambient
    # tenant context — see the note on record_payment() below for why the
    # tenant-scoped `objects` manager can't be relied on here.
    structure_items = list(
        FeeStructureItem.unscoped_objects.filter(fee_structure=fee_structure).select_related("fee_category")
    )
    with transaction.atomic():
        for student in students:
            if Invoice.unscoped_objects.filter(student=student, fee_structure=fee_structure).exists():
                skipped.append(student.id)
                continue
            invoice = create_invoice_with_line_items(
                school=fee_structure.school,
                student=student,
                academic_year=fee_structure.academic_year,
                term=fee_structure.term,
                fee_structure=fee_structure,
                due_date=due_date,
                line_items=[
                    {
                        "fee_category": si.fee_category,
                        "line_type": "charge",
                        "description": si.fee_category.name,
                        "amount": si.amount,
                    }
                    for si in structure_items
                ],
            )
            created.append(invoice)
    return created, skipped


def _is_likely_duplicate(*, invoice, amount, method, reference) -> bool:
    cutoff = timezone.now() - timedelta(seconds=DUPLICATE_PAYMENT_WINDOW_SECONDS)
    return Payment.unscoped_objects.filter(
        invoice=invoice, amount=amount, method=method, reference=reference, created_at__gte=cutoff
    ).exists()


@transaction.atomic
def record_payment(*, invoice, amount: Decimal, method: str, reference: str = "", notes: str = "", recorded_by=None, paid_at=None) -> Payment:
    """
    Locks the invoice row for the duration of the transaction
    (select_for_update) so two concurrent payment requests against the same
    invoice can never both read the same amount_paid and both apply their
    delta — the second one blocks until the first commits, then sees the
    updated balance.

    Uses `unscoped_objects` throughout, not the tenant-scoped `objects`
    manager: this function is called from request-scoped views (tenant
    context set) *and* directly from tests/services/future management
    commands with no ambient context at all. Outside request context,
    `objects.select_for_update().get(...)` would see `TenantManager`'s
    no-context `.none()` and raise `DoesNotExist` — the exact bug class
    documented for `apps.authorization.services.assign_role()` back in
    Phase 4. It's safe here because we're re-fetching an *already-identified*
    row by its own primary key (a UUID, not client-guessable), not making a
    new tenant-filtering decision — the caller (a view's `get_object_or_404`
    or a school-scoped queryset lookup) already established that this
    invoice belongs to the right school before calling in.
    """
    invoice = Invoice.unscoped_objects.select_for_update().get(pk=invoice.pk)

    if invoice.status == Invoice.Status.CANCELLED:
        raise FinanceError("Cannot record a payment against a cancelled invoice.")
    if amount <= 0:
        raise FinanceError("Payment amount must be positive.")
    if _is_likely_duplicate(invoice=invoice, amount=amount, method=method, reference=reference):
        raise DuplicatePaymentError(
            "An identical payment was just recorded for this invoice — possible duplicate submission."
        )
    if amount > invoice.balance:
        raise FinanceError(f"Payment amount ({amount}) exceeds the outstanding balance ({invoice.balance}).")

    payment = Payment.objects.create(
        school=invoice.school,
        invoice=invoice,
        receipt_number=_next_sequence_number(school=invoice.school, model=Payment, prefix="RCT"),
        amount=amount,
        method=method,
        reference=reference,
        notes=notes,
        recorded_by=recorded_by,
        paid_at=paid_at or timezone.now(),
    )
    invoice.amount_paid = invoice.amount_paid + amount
    invoice.balance = invoice.total - invoice.amount_paid
    if invoice.amount_paid >= invoice.total:
        invoice.status = Invoice.Status.PAID
    else:
        invoice.status = Invoice.Status.PARTIALLY_PAID
    invoice.save(update_fields=["amount_paid", "balance", "status", "updated_at"])
    notify_student_guardians(
        invoice.student,
        category="finance",
        title="Payment received",
        message=f"Payment of {amount} received for invoice {invoice.invoice_number} (receipt {payment.receipt_number}).",
        link="/finance/payments",
        email_subject=f"Payment received: {payment.receipt_number}",
        email_html=(
            f"<p>We've received a payment of {amount} against invoice {invoice.invoice_number}.</p>"
            f"<p>Receipt number: {payment.receipt_number}</p>"
        ),
    )
    return payment


@transaction.atomic
def record_refund(*, payment, amount: Decimal, reason: str, refunded_by=None) -> Refund:
    """See record_payment() for why `unscoped_objects` is used throughout."""
    payment = Payment.unscoped_objects.select_for_update().get(pk=payment.pk)
    invoice = Invoice.unscoped_objects.select_for_update().get(pk=payment.invoice_id)

    if amount <= 0:
        raise FinanceError("Refund amount must be positive.")
    already_refunded = Refund.unscoped_objects.filter(payment=payment).aggregate(total=Sum("amount"))[
        "total"
    ] or Decimal("0.00")
    refundable = payment.amount - already_refunded
    if amount > refundable:
        raise FinanceError(f"Refund amount ({amount}) exceeds the refundable balance ({refundable}).")

    refund = Refund.objects.create(
        school=invoice.school, payment=payment, amount=amount, reason=reason, refunded_by=refunded_by
    )

    invoice.amount_paid = invoice.amount_paid - amount
    invoice.balance = invoice.total - invoice.amount_paid
    invoice.status = (
        Invoice.Status.PAID
        if invoice.amount_paid >= invoice.total and invoice.total > 0
        else Invoice.Status.PARTIALLY_PAID
        if invoice.amount_paid > 0
        else Invoice.Status.UNPAID
    )
    invoice.save(update_fields=["amount_paid", "balance", "status", "updated_at"])

    new_total_refunded = already_refunded + amount
    payment.status = (
        Payment.Status.REFUNDED if new_total_refunded >= payment.amount else Payment.Status.PARTIALLY_REFUNDED
    )
    payment.save(update_fields=["status", "updated_at"])
    return refund
