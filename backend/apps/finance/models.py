from decimal import Decimal

from django.db import models
from django.db.models import Sum
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel

ZERO = Decimal("0.00")


class FeeCategory(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)  # "Tuition", "Transport Fee", "Registration Fee"
    code = models.CharField(max_length=20, blank=True)
    is_recurring = models.BooleanField(default=True)  # tuition recurs each term; registration doesn't

    class Meta:
        db_table = "fee_categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_fee_category_name_per_school"),
        ]

    def __str__(self):
        return self.name


class FeeStructure(TenantScopedModel, TimeStampedModel):
    """A named fee plan, e.g. 'Grade 10 - Term 1 Fees'. Line items live in FeeStructureItem."""

    name = models.CharField(max_length=150)
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.CASCADE, related_name="fee_structures")
    term = models.ForeignKey(
        "academics.Term", null=True, blank=True, on_delete=models.CASCADE, related_name="fee_structures"
    )
    school_class = models.ForeignKey(
        "academics.SchoolClass", null=True, blank=True, on_delete=models.CASCADE, related_name="fee_structures"
    )

    class Meta:
        db_table = "fee_structures"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_fee_structure_name_per_school"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.academic_year.school_id != self.school_id:
            raise ValueError("FeeStructure.academic_year must belong to the same school")
        if self.term_id and self.term.school_id != self.school_id:
            raise ValueError("FeeStructure.term must belong to the same school")
        if self.school_class_id and self.school_class.school_id != self.school_id:
            raise ValueError("FeeStructure.school_class must belong to the same school")
        super().save(*args, **kwargs)


class FeeStructureItem(TenantScopedModel):
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.CASCADE, related_name="items")
    fee_category = models.ForeignKey(FeeCategory, on_delete=models.PROTECT, related_name="+")
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "fee_structure_items"
        constraints = [
            models.UniqueConstraint(
                fields=["fee_structure", "fee_category"], name="unique_category_per_fee_structure"
            ),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="fee_structure_item_amount_positive"),
        ]

    def __str__(self):
        return f"{self.fee_structure.name} - {self.fee_category.name}"

    def save(self, *args, **kwargs):
        if self.fee_structure.school_id != self.school_id:
            raise ValueError("FeeStructureItem.fee_structure must belong to the same school")
        if self.fee_category.school_id != self.school_id:
            raise ValueError("FeeStructureItem.fee_category must belong to the same school")
        super().save(*args, **kwargs)


class Invoice(TenantScopedModel, TimeStampedModel):
    """
    Financial totals (subtotal/discount_total/total/balance) are stored,
    recomputed by services.recalculate_invoice_amounts() whenever line
    items change — not computed live on every read, so stats/reports can
    aggregate them at the DB level (see spec's "avoid N+1, use annotate/
    aggregate" performance guidance). `amount_paid` is the one field
    mutated directly by payment/refund, always inside
    transaction.atomic()+select_for_update() — see apps.finance.services.
    """

    class Status(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="invoices")
    fee_structure = models.ForeignKey(
        FeeStructure, null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices"
    )
    invoice_number = models.CharField(max_length=30)
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.CASCADE, related_name="invoices")
    term = models.ForeignKey(
        "academics.Term", null=True, blank=True, on_delete=models.SET_NULL, related_name="invoices"
    )
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UNPAID)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    discount_total = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)

    class Meta:
        db_table = "invoices"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "invoice_number"], name="unique_invoice_number_per_school"),
        ]

    def __str__(self):
        return self.invoice_number

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id:
            raise ValueError("Invoice.student must belong to the same school")
        if self.academic_year.school_id != self.school_id:
            raise ValueError("Invoice.academic_year must belong to the same school")
        if self.term_id and self.term.school_id != self.school_id:
            raise ValueError("Invoice.term must belong to the same school")
        if self.fee_structure_id and self.fee_structure.school_id != self.school_id:
            raise ValueError("Invoice.fee_structure must belong to the same school")
        super().save(*args, **kwargs)

    @property
    def is_overdue(self):
        return (
            self.due_date is not None
            and self.due_date < timezone.now().date()
            and self.status in (self.Status.UNPAID, self.Status.PARTIALLY_PAID)
        )

    def recalculate_amounts(self):
        """
        Recomputes subtotal/discount_total/total/balance/status from line
        items + amount_paid. Uses InvoiceLineItem.unscoped_objects rather
        than the `self.line_items` reverse-accessor: that accessor's
        default manager is the tenant-scoped `objects`, which returns
        nothing outside request context — and this method is called from
        services (create_invoice_with_line_items) that may run with no
        ambient tenant context at all. Safe here because we're filtering
        explicitly by `invoice=self`, not relying on ambient scoping for
        correctness.
        """
        aggregates = InvoiceLineItem.unscoped_objects.filter(invoice=self).aggregate(
            charges=Sum("amount", filter=models.Q(amount__gt=0)),
            discounts=Sum("amount", filter=models.Q(amount__lt=0)),
        )
        charges = aggregates["charges"] or ZERO
        discounts = aggregates["discounts"] or ZERO  # negative or zero
        self.subtotal = charges
        self.discount_total = -discounts
        self.total = charges + discounts
        self.balance = self.total - self.amount_paid
        if self.status != self.Status.CANCELLED:
            if self.amount_paid <= 0:
                self.status = self.Status.UNPAID
            elif self.amount_paid < self.total:
                self.status = self.Status.PARTIALLY_PAID
            else:
                self.status = self.Status.PAID
        self.save(
            update_fields=["subtotal", "discount_total", "total", "balance", "status", "updated_at"]
        )


class InvoiceLineItem(TenantScopedModel):
    """Positive `amount` = a charge; negative = a discount/scholarship/waiver — see `line_type`."""

    class LineType(models.TextChoices):
        CHARGE = "charge", "Charge"
        DISCOUNT = "discount", "Discount"
        SCHOLARSHIP = "scholarship", "Scholarship"
        WAIVER = "waiver", "Waiver"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    fee_category = models.ForeignKey(
        FeeCategory, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    line_type = models.CharField(max_length=20, choices=LineType.choices, default=LineType.CHARGE)
    description = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "invoice_line_items"
        constraints = [
            models.CheckConstraint(condition=~models.Q(amount=0), name="invoice_line_item_amount_not_zero"),
        ]

    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.description or self.line_type}"

    def save(self, *args, **kwargs):
        if self.invoice.school_id != self.school_id:
            raise ValueError("InvoiceLineItem.invoice must belong to the same school")
        if self.fee_category_id and self.fee_category.school_id != self.school_id:
            raise ValueError("InvoiceLineItem.fee_category must belong to the same school")
        super().save(*args, **kwargs)


class Payment(TenantScopedModel, TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CARD = "card", "Card"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        CHEQUE = "cheque", "Cheque"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        COMPLETED = "completed", "Completed"
        PARTIALLY_REFUNDED = "partially_refunded", "Partially Refunded"
        REFUNDED = "refunded", "Refunded"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    receipt_number = models.CharField(max_length=30)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=Method.choices)
    reference = models.CharField(max_length=100, blank=True)
    paid_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    notes = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "payments"
        ordering = ["-paid_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "receipt_number"], name="unique_receipt_number_per_school"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="payment_amount_positive"),
        ]

    def __str__(self):
        return self.receipt_number

    def save(self, *args, **kwargs):
        if self.invoice.school_id != self.school_id:
            raise ValueError("Payment.invoice must belong to the same school")
        super().save(*args, **kwargs)


class Refund(TenantScopedModel, TimeStampedModel):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="refunds")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=500)
    refunded_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    refunded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "refunds"
        ordering = ["-refunded_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="refund_amount_positive"),
        ]

    def __str__(self):
        return f"Refund {self.amount} - {self.payment.receipt_number}"

    def save(self, *args, **kwargs):
        if self.payment.school_id != self.school_id:
            raise ValueError("Refund.payment must belong to the same school")
        super().save(*args, **kwargs)
