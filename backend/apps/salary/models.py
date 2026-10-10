from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel

ZERO = Decimal("0.00")


class SalaryStructure(TenantScopedModel, TimeStampedModel):
    """A reusable named payroll template, e.g. 'Teacher Grade A'. Line items live in
    SalaryStructureItem. Mirrors apps.finance.models.FeeStructure."""

    name = models.CharField(max_length=150)

    class Meta:
        db_table = "salary_structures"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_salary_structure_name_per_school"),
        ]

    def __str__(self):
        return self.name


class SalaryStructureItem(TenantScopedModel):
    class LineType(models.TextChoices):
        BASIC = "basic", "Basic Pay"
        ALLOWANCE = "allowance", "Allowance"
        DEDUCTION = "deduction", "Deduction"

    salary_structure = models.ForeignKey(SalaryStructure, on_delete=models.CASCADE, related_name="items")
    line_type = models.CharField(max_length=20, choices=LineType.choices)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "salary_structure_items"
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="salary_structure_item_amount_positive"),
        ]

    def __str__(self):
        return f"{self.salary_structure.name} - {self.description}"

    def save(self, *args, **kwargs):
        if self.salary_structure.school_id != self.school_id:
            raise ValueError("SalaryStructureItem.salary_structure must belong to the same school")
        super().save(*args, **kwargs)


class StaffSalaryAssignment(TenantScopedModel, TimeStampedModel):
    """The standing assignment of a SalaryStructure to a staff member. Unlike a FeeStructure
    (applied fresh per invoice-generation run), payroll needs a persistent staff<->structure
    link that generate_salary_payments_for_month() reads each period."""

    staff = models.OneToOneField("staff.Staff", on_delete=models.CASCADE, related_name="salary_assignment")
    salary_structure = models.ForeignKey(SalaryStructure, on_delete=models.PROTECT, related_name="assignments")
    effective_from = models.DateField(default=timezone.now)

    class Meta:
        db_table = "staff_salary_assignments"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.staff} - {self.salary_structure.name}"

    def save(self, *args, **kwargs):
        if self.staff.school_id != self.school_id:
            raise ValueError("StaffSalaryAssignment.staff must belong to the same school")
        if self.salary_structure.school_id != self.school_id:
            raise ValueError("StaffSalaryAssignment.salary_structure must belong to the same school")
        super().save(*args, **kwargs)


class SalaryPayment(TenantScopedModel, TimeStampedModel):
    """One staff member's payroll record for one calendar month. gross_amount/deductions_total/
    net_amount are snapshotted at generation time from the assigned SalaryStructure's items at
    that moment — never recomputed live — mirroring Invoice's stored-totals approach so editing
    a structure later doesn't retroactively change an already-generated payment."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CARD = "card", "Card"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        CHEQUE = "cheque", "Cheque"
        OTHER = "other", "Other"

    staff = models.ForeignKey("staff.Staff", on_delete=models.CASCADE, related_name="salary_payments")
    salary_structure = models.ForeignKey(
        SalaryStructure, null=True, blank=True, on_delete=models.SET_NULL, related_name="payments"
    )
    period_year = models.PositiveIntegerField()
    period_month = models.PositiveSmallIntegerField()
    payment_number = models.CharField(max_length=30)

    gross_amount = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    deductions_total = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)
    net_amount = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    paid_at = models.DateTimeField(null=True, blank=True)
    method = models.CharField(max_length=20, choices=Method.choices, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    recorded_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "salary_payments"
        ordering = ["-period_year", "-period_month"]
        constraints = [
            models.UniqueConstraint(
                fields=["staff", "period_year", "period_month"], name="unique_salary_payment_per_staff_per_month"
            ),
            models.UniqueConstraint(fields=["school", "payment_number"], name="unique_salary_payment_number_per_school"),
        ]

    def __str__(self):
        return self.payment_number

    def save(self, *args, **kwargs):
        if self.staff.school_id != self.school_id:
            raise ValueError("SalaryPayment.staff must belong to the same school")
        if self.salary_structure_id and self.salary_structure.school_id != self.school_id:
            raise ValueError("SalaryPayment.salary_structure must belong to the same school")
        super().save(*args, **kwargs)
