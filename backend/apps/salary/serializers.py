from rest_framework import serializers

from .models import SalaryPayment, SalaryStructure, SalaryStructureItem, StaffSalaryAssignment


class SalaryStructureSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryStructure
        fields = ["id", "name", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        # `school` is never a serializer field, so DRF's automatic unique-together validator
        # never fires for unique_salary_structure_name_per_school — checked explicitly instead,
        # same gap fixed for FeeCategorySerializer/FeeStructureSerializer.
        school = self.context["request"].user.school
        qs = SalaryStructure.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A salary structure with this name already exists.")
        return value


class SalaryStructureItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryStructureItem
        fields = ["id", "salary_structure", "line_type", "description", "amount"]
        read_only_fields = ["id"]

    def validate_salary_structure(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Salary structure must belong to your own school.")
        return value


class StaffSalaryAssignmentSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True)
    salary_structure_name = serializers.CharField(source="salary_structure.name", read_only=True)

    class Meta:
        model = StaffSalaryAssignment
        fields = [
            "id", "staff", "staff_name", "salary_structure", "salary_structure_name",
            "effective_from", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_staff(self, value):
        return self._same_school(value, "Staff")

    def validate_salary_structure(self, value):
        return self._same_school(value, "Salary structure")


class SalaryPaymentSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True)
    salary_structure_name = serializers.CharField(source="salary_structure.name", read_only=True, default=None)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default=None)

    class Meta:
        model = SalaryPayment
        fields = [
            "id", "staff", "staff_name", "salary_structure", "salary_structure_name",
            "period_year", "period_month", "payment_number", "gross_amount", "deductions_total",
            "net_amount", "status", "paid_at", "method", "reference", "recorded_by",
            "recorded_by_name", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "payment_number", "gross_amount", "deductions_total", "net_amount", "status",
            "paid_at", "method", "reference", "recorded_by", "created_at", "updated_at",
        ]


class GenerateSalaryPaymentsSerializer(serializers.Serializer):
    period_year = serializers.IntegerField(min_value=2000, max_value=2100)
    period_month = serializers.IntegerField(min_value=1, max_value=12)


class RecordSalaryPaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=SalaryPayment.Method.choices)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
