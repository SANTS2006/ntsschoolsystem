from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

from apps.audit.services import log_action
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import SalaryPayment, SalaryStructure, SalaryStructureItem, StaffSalaryAssignment
from .serializers import (
    GenerateSalaryPaymentsSerializer,
    RecordSalaryPaymentSerializer,
    SalaryPaymentSerializer,
    SalaryStructureItemSerializer,
    SalaryStructureSerializer,
    StaffSalaryAssignmentSerializer,
)

_SALARY_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class SalaryModelViewSet(TenantScopedModelViewSet):
    """Shared permission wiring for the salary.* codes across every viewset in this app."""

    def get_permissions(self):
        code = f"salary.{_SALARY_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]


class SalaryStructureViewSet(SalaryModelViewSet):
    serializer_class = SalaryStructureSerializer
    search_fields = ["name"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return SalaryStructure.objects.all()


class SalaryStructureItemViewSet(SalaryModelViewSet):
    serializer_class = SalaryStructureItemSerializer
    filterset_fields = ["salary_structure", "line_type"]
    summary_stats = {
        "total": {},
        "by_line_type": {"groupby": "line_type"},
    }

    def get_queryset(self):
        return SalaryStructureItem.objects.select_related("salary_structure").all()


class StaffSalaryAssignmentViewSet(SalaryModelViewSet):
    serializer_class = StaffSalaryAssignmentSerializer
    filterset_fields = ["staff", "salary_structure"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return StaffSalaryAssignment.objects.select_related("staff__user", "salary_structure").all()


class SalaryPaymentViewSet(SalaryModelViewSet):
    serializer_class = SalaryPaymentSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["staff", "salary_structure", "status", "period_year", "period_month"]
    search_fields = ["payment_number"]
    summary_stats = {
        "total": {},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        action_map = {**_SALARY_ACTION_SUFFIX, "generate": "create", "pay": "update"}
        code = f"salary.{action_map.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return SalaryPayment.objects.select_related("staff__user", "salary_structure", "recorded_by").all()

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Bulk-generates this month's salary payments for every staff member with an assigned
        salary structure. Idempotent — re-running for the same period skips anyone already paid."""
        serializer = GenerateSalaryPaymentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        school = get_current_school()

        created, skipped = services.generate_salary_payments_for_month(
            school=school, period_year=data["period_year"], period_month=data["period_month"]
        )
        log_action(
            action="salary.payments_generated",
            actor=request.user,
            school=school,
            entity_type="SalaryPayment",
            entity_id="",
            metadata={
                "period_year": data["period_year"], "period_month": data["period_month"],
                "created": len(created), "skipped": len(skipped),
            },
        )
        return _ok(
            f"Generated {len(created)} salary payment(s).",
            payments=SalaryPaymentSerializer(created, many=True).data,
            skipped_staff_ids=[str(s) for s in skipped],
        )

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        salary_payment = self.get_object()
        serializer = RecordSalaryPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            salary_payment = services.record_salary_payment(
                salary_payment=salary_payment,
                method=data["method"],
                reference=data.get("reference", ""),
                recorded_by=request.user,
            )
        except services.SalaryError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_action(
            action="salary.payment_paid",
            actor=request.user,
            school=get_current_school(),
            entity_type="SalaryPayment",
            entity_id=str(salary_payment.pk),
            after={"net_amount": str(salary_payment.net_amount), "method": salary_payment.method},
        )
        return _ok("Salary payment recorded.", payment=SalaryPaymentSerializer(salary_payment).data)
