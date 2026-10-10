from rest_framework import serializers

from apps.academics.services import assert_year_not_archived

from .models import FeeCategory, FeeStructure, FeeStructureItem, Invoice, InvoiceLineItem, Payment, Refund


class FeeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeCategory
        fields = ["id", "name", "code", "is_recurring", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        # `school` is never a serializer field (set server-side in perform_create), so DRF's
        # automatic unique-together validator never fires for `unique_fee_category_name_per_school`
        # — it only auto-generates when every field in the constraint is present on the
        # serializer. Checked explicitly here instead (see the identical gap fixed for
        # Timetable's Room/Period in Phase 20 — this is the same bug class, now in Finance).
        school = self.context["request"].user.school
        qs = FeeCategory.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A fee category with this name already exists.")
        return value


class FeeStructureSerializer(serializers.ModelSerializer):
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    term_name = serializers.CharField(source="term.name", read_only=True, default=None)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True, default=None)

    class Meta:
        model = FeeStructure
        fields = [
            "id", "name", "academic_year", "academic_year_name", "term", "term_name",
            "school_class", "school_class_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_academic_year(self, value):
        return self._same_school(value, "Academic year")

    def validate_term(self, value):
        return self._same_school(value, "Term")

    def validate_school_class(self, value):
        return self._same_school(value, "Class")

    def validate(self, attrs):
        academic_year = attrs.get("academic_year", getattr(self.instance, "academic_year", None))
        try:
            assert_year_not_archived(academic_year)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return attrs

    def validate_name(self, value):
        # Same gap as FeeCategorySerializer.validate_name — `unique_fee_structure_name_per_school`
        # never gets an automatic validator since `school` isn't a serializer field.
        school = self.context["request"].user.school
        qs = FeeStructure.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A fee structure with this name already exists.")
        return value


class FeeStructureItemSerializer(serializers.ModelSerializer):
    fee_category_name = serializers.CharField(source="fee_category.name", read_only=True)

    class Meta:
        model = FeeStructureItem
        fields = ["id", "fee_structure", "fee_category", "fee_category_name", "amount"]
        read_only_fields = ["id"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_fee_structure(self, value):
        return self._same_school(value, "Fee structure")

    def validate_fee_category(self, value):
        return self._same_school(value, "Fee category")


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    fee_category_name = serializers.CharField(source="fee_category.name", read_only=True, default=None)

    class Meta:
        model = InvoiceLineItem
        fields = ["id", "invoice", "fee_category", "fee_category_name", "line_type", "description", "amount"]
        read_only_fields = ["id"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_invoice(self, value):
        return self._same_school(value, "Invoice")

    def validate_fee_category(self, value):
        return self._same_school(value, "Fee category")

    def validate_amount(self, value):
        if value == 0:
            raise serializers.ValidationError("Amount cannot be zero.")
        return value

    def validate(self, attrs):
        """
        Object-level, not validate_invoice(), so this still fires on a plain
        PATCH that only changes `amount`/`description` and never mentions
        `invoice` at all — a field-level validate_invoice() would only run
        when "invoice" is actually present in the request payload.
        """
        invoice = attrs.get("invoice") or (self.instance.invoice if self.instance else None)
        if invoice is not None and invoice.payments.exists():
            raise serializers.ValidationError(
                "Cannot add or change line items once a payment has been recorded against this invoice."
            )
        return attrs
        return value


class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "student", "student_name", "fee_structure", "invoice_number", "academic_year",
            "term", "due_date", "status", "subtotal", "discount_total", "total", "amount_paid",
            "balance", "is_overdue", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "invoice_number", "status", "subtotal", "discount_total", "total",
            "amount_paid", "balance", "created_at", "updated_at",
        ]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_student(self, value):
        return self._same_school(value, "Student")

    def validate_academic_year(self, value):
        return self._same_school(value, "Academic year")

    def validate_term(self, value):
        return self._same_school(value, "Term")

    def validate(self, attrs):
        academic_year = attrs.get("academic_year", getattr(self.instance, "academic_year", None))
        try:
            assert_year_not_archived(academic_year)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return attrs


class InvoiceLineItemInputSerializer(serializers.Serializer):
    """Used only inside InvoiceCreateSerializer — a plain line item to seed a new invoice with."""

    fee_category = serializers.UUIDField(required=False, allow_null=True)
    line_type = serializers.ChoiceField(choices=InvoiceLineItem.LineType.choices, default=InvoiceLineItem.LineType.CHARGE)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def validate_amount(self, value):
        if value == 0:
            raise serializers.ValidationError("Amount cannot be zero.")
        return value


class InvoiceCreateSerializer(serializers.Serializer):
    student = serializers.UUIDField()
    academic_year = serializers.UUIDField()
    term = serializers.UUIDField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    line_items = InvoiceLineItemInputSerializer(many=True)


class GenerateInvoicesSerializer(serializers.Serializer):
    fee_structure = serializers.UUIDField()
    school_class = serializers.UUIDField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)


class PaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)
    student_name = serializers.CharField(source="invoice.student.full_name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = [
            "id", "invoice", "invoice_number", "student_name", "receipt_number", "amount", "method",
            "reference", "paid_at", "recorded_by", "recorded_by_name", "status", "notes",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "receipt_number", "recorded_by", "status", "created_at", "updated_at",
        ]

    def validate_invoice(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Invoice must belong to your own school.")
        return value

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be positive.")
        return value


class RefundSerializer(serializers.ModelSerializer):
    refunded_by_name = serializers.CharField(source="refunded_by.full_name", read_only=True, default=None)

    class Meta:
        model = Refund
        fields = ["id", "payment", "amount", "reason", "refunded_by", "refunded_by_name", "refunded_at"]
        read_only_fields = ["id", "refunded_by", "refunded_at"]


class RecordRefundSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    reason = serializers.CharField(max_length=500)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be positive.")
        return value
