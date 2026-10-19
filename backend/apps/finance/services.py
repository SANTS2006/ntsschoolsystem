from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.notifications.services import notify
from apps.parents.services import notify_student_guardians

from .models import FeeStructureItem, Invoice, Payment, Refund

DUPLICATE_PAYMENT_WINDOW_SECONDS = 10


def notify_student_and_guardians(student, *, category, title, message, link="", email_subject=None, email_html=None):
    """Notifies the student's own account (when they have one) AND every guardian with an account. Link points at the student's
    own fees page; guardians open the same title from their notification. Returns how many people were notified."""
    count = notify_student_guardians(student, category=category, title=title, message=message, link=link, email_subject=email_subject, email_html=email_html)
    if student.user_id:
        notify(recipient=student.user, category=category, title=title, message=message, link=link, email_subject=email_subject, email_html=email_html)
        count += 1
    return count


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
        notify_student_and_guardians(
            student,
            category="finance",
            title="New invoice issued",
            message=f"Invoice {invoice.invoice_number} for {invoice.total} has been issued.",
            link="/my-fees",
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
    notify_student_and_guardians(
        invoice.student,
        category="finance",
        title="Payment received",
        message=f"Payment of {amount} received for invoice {invoice.invoice_number} (receipt {payment.receipt_number}).",
        link="/my-fees",
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



def recalculate_and_notify(invoice, *, change: str) -> None:
    """Recomputes an invoice after its line items changed and, if the amount the student owes actually changed, tells the student
    and their guardians what changed and the new figures. (Increments, discounts, waivers and corrections all arrive here.)"""
    before_total, before_balance = invoice.total, invoice.balance
    invoice.recalculate_amounts()
    if invoice.total == before_total:
        return
    direction = "increased" if invoice.total > before_total else "reduced"
    notify_student_and_guardians(
        invoice.student,
        category="finance",
        title="Your fees were updated" if invoice.total > before_total else "Your fees were reduced",
        message=(
            f"Invoice {invoice.invoice_number} {direction} from {before_total} to {invoice.total} ({change}). "
            f"Amount still to pay: {invoice.balance}."
        ),
        link="/my-fees",
        email_subject=f"Invoice {invoice.invoice_number} updated",
        email_html=(
            f"<p>Invoice <strong>{invoice.invoice_number}</strong> {direction} from {before_total} to <strong>{invoice.total}</strong> ({change}).</p>"
            f"<p>Paid so far: {invoice.amount_paid}. Still to pay: <strong>{invoice.balance}</strong>.</p>"
        ),
    )


REMINDER_COOLDOWN = timedelta(hours=24)
REMINDABLE = (Invoice.Status.UNPAID, Invoice.Status.PARTIALLY_PAID)


def send_fee_reminders(*, invoices, actor=None, note: str = "", force: bool = False) -> dict:
    """Sends a payment reminder (in-app + e-mail, to the student and guardians) for each invoice that still has a balance.
    An invoice reminded within the last 24 hours is skipped unless `force` (stops accidental repeat sends and double clicks).
    Returns counts: sent, skipped_recent, skipped_paid, no_recipient."""
    sent = skipped_recent = skipped_paid = no_recipient = 0
    now = timezone.now()
    note = (note or "").strip()[:500]
    for invoice in invoices.select_related("student__user", "academic_year", "term"):
        if invoice.status not in REMINDABLE or invoice.balance <= 0:
            skipped_paid += 1
            continue
        if not force and invoice.last_reminder_at and now - invoice.last_reminder_at < REMINDER_COOLDOWN:
            skipped_recent += 1
            continue
        due = f", due {invoice.due_date:%d %b %Y}" if invoice.due_date else ""
        overdue = " It is now overdue." if invoice.is_overdue else ""
        where = f"{invoice.academic_year.name}" + (f" · {invoice.term.name}" if invoice.term_id else "")
        message = f"Reminder: {invoice.balance} is still unpaid on invoice {invoice.invoice_number} ({where}){due}.{overdue}" + (f" {note}" if note else "")
        reached = notify_student_and_guardians(
            invoice.student,
            category="finance",
            title="Fee payment reminder",
            message=message,
            link="/my-fees",
            email_subject=f"Fee payment reminder: {invoice.invoice_number}",
            email_html=(
                f"<p>This is a reminder that <strong>{invoice.balance}</strong> is still unpaid on invoice {invoice.invoice_number} "
                f"for {invoice.student.full_name} ({where}){due}.{overdue}</p>"
                + (f"<p>{note}</p>" if note else "")
                + "<p>You can see the full breakdown under <em>Fees</em> in the app.</p>"
            ),
        )
        if reached == 0:
            no_recipient += 1
            continue
        Invoice.unscoped_objects.filter(pk=invoice.pk).update(last_reminder_at=now, reminder_count=invoice.reminder_count + 1)
        sent += 1
    return {"sent": sent, "skipped_recent": skipped_recent, "skipped_paid": skipped_paid, "no_recipient": no_recipient}


def student_fee_statement(student) -> dict:
    """A student's own fees, grouped by academic year then term, with each invoice's line items and payments (receipts), and
    overall totals. Cancelled invoices are left out of the totals and the lists."""
    from collections import OrderedDict

    from .models import InvoiceLineItem

    invoices = list(
        Invoice.unscoped_objects.filter(student=student)
        .exclude(status=Invoice.Status.CANCELLED)
        .select_related("academic_year", "term")
        .order_by("-academic_year__start_date", "term__sequence", "created_at")
    )
    lines_by_invoice, payments_by_invoice = {}, {}
    for line in InvoiceLineItem.unscoped_objects.filter(invoice__in=invoices).order_by("id"):
        lines_by_invoice.setdefault(line.invoice_id, []).append(
            {"description": line.description or line.get_line_type_display(), "line_type": line.line_type, "amount": line.amount}
        )
    for payment in Payment.unscoped_objects.filter(invoice__in=invoices).order_by("paid_at"):
        payments_by_invoice.setdefault(payment.invoice_id, []).append(
            {"id": str(payment.pk), "receipt_number": payment.receipt_number, "amount": payment.amount, "method": payment.method,
             "paid_at": payment.paid_at, "status": payment.status}
        )

    zero = Decimal("0.00")
    years: "OrderedDict" = OrderedDict()
    totals = {"billed": zero, "paid": zero, "outstanding": zero, "overdue": zero}
    for invoice in invoices:
        year = years.setdefault(
            invoice.academic_year_id,
            {"academic_year_id": str(invoice.academic_year_id), "academic_year": invoice.academic_year.name, "status": invoice.academic_year.status,
             "totals": {"billed": zero, "paid": zero, "outstanding": zero}, "terms": OrderedDict()},
        )
        term_key = invoice.term_id or "none"
        term = year["terms"].setdefault(
            term_key,
            {"term_id": str(invoice.term_id) if invoice.term_id else None, "term": invoice.term.name if invoice.term_id else "Whole year",
             "totals": {"billed": zero, "paid": zero, "outstanding": zero}, "invoices": []},
        )
        term["invoices"].append(
            {
                "id": str(invoice.pk), "invoice_number": invoice.invoice_number, "status": invoice.status, "due_date": invoice.due_date,
                "is_overdue": invoice.is_overdue, "subtotal": invoice.subtotal, "discount_total": invoice.discount_total, "total": invoice.total,
                "amount_paid": invoice.amount_paid, "balance": invoice.balance,
                "line_items": lines_by_invoice.get(invoice.pk, []), "payments": payments_by_invoice.get(invoice.pk, []),
            }
        )
        for bucket in (year["totals"], term["totals"]):
            bucket["billed"] += invoice.total
            bucket["paid"] += invoice.amount_paid
            bucket["outstanding"] += invoice.balance
        totals["billed"] += invoice.total
        totals["paid"] += invoice.amount_paid
        totals["outstanding"] += invoice.balance
        if invoice.is_overdue:
            totals["overdue"] += invoice.balance
    if not invoices:
        overall = "none"
    elif totals["outstanding"] <= 0:
        overall = "paid"
    elif totals["overdue"] > 0:
        overall = "overdue"
    else:
        overall = "outstanding"
    return {
        "summary": {**totals, "status": overall, "invoice_count": len(invoices)},
        "years": [{**year, "terms": list(year["terms"].values())} for year in years.values()],
    }
