from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

from django.db.models import Prefetch
from django.http import Http404
from rest_framework.views import APIView

from apps.audit.services import log_action
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import SalaryAdjustment, SalaryPayment, SalaryPaymentLine, SalaryStructure, SalaryStructureItem, StaffSalaryAssignment
from .serializers import (
    GenerateSalaryPaymentsSerializer,
    RecordSalaryPaymentSerializer,
    SalaryAdjustmentSerializer,
    SalaryPaymentDetailSerializer,
    SalaryPaymentLineSerializer,
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
    search_fields = ["description"]
    filterset_fields = ["salary_structure", "line_type"]
    summary_stats = {
        "total": {},
        "by_line_type": {"groupby": "line_type"},
    }

    def get_queryset(self):
        return SalaryStructureItem.objects.select_related("salary_structure").all()

    def _tell_staff(self, structure, change):
        """Refresh unpaid payments on this plan and tell everyone on it what changed."""
        services.refresh_pending_payments(salary_structure=structure)
        assigned = [a.staff for a in StaffSalaryAssignment.objects.filter(salary_structure=structure).select_related("staff__user")]
        services.notify_plan_changed(staff_members=assigned, summary=f"{change} Your plan is now {services.plan_summary(structure)}")

    def perform_create(self, serializer):
        item = serializer.save(school=get_current_school())
        self._tell_staff(item.salary_structure, f'{item.get_line_type_display()} "{item.description}" of {item.amount} was added to your pay plan.')

    def perform_update(self, serializer):
        before_amount = serializer.instance.amount
        item = serializer.save()
        if before_amount != item.amount:
            kind = "increased" if item.amount > before_amount and item.line_type != "deduction" else "changed"
            change = f'{item.get_line_type_display()} "{item.description}" {kind} from {before_amount} to {item.amount}.'
        else:
            change = f'{item.get_line_type_display()} "{item.description}" was updated.'
        self._tell_staff(item.salary_structure, change)

    def perform_destroy(self, instance):
        structure = instance.salary_structure
        change = f'{instance.get_line_type_display()} "{instance.description}" ({instance.amount}) was removed from your pay plan.'
        instance.delete()
        self._tell_staff(structure, change)


class StaffSalaryAssignmentViewSet(SalaryModelViewSet):
    serializer_class = StaffSalaryAssignmentSerializer
    search_fields = ["staff__user__first_name", "staff__user__last_name"]
    filterset_fields = ["staff", "salary_structure"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return StaffSalaryAssignment.objects.select_related("staff__user", "salary_structure").all()

    def perform_create(self, serializer):
        assignment = serializer.save(school=get_current_school())
        services.refresh_pending_payments(staff=assignment.staff)
        services.notify_plan_changed(staff_members=[assignment.staff], summary=f"You were placed on a pay plan. {services.plan_summary(assignment.salary_structure)}")

    def perform_update(self, serializer):
        before = serializer.instance.salary_structure.name
        assignment = serializer.save()
        services.refresh_pending_payments(staff=assignment.staff)
        services.notify_plan_changed(
            staff_members=[assignment.staff],
            summary=f'Your pay plan changed from "{before}" to {services.plan_summary(assignment.salary_structure)}',
        )


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
        qs = SalaryPayment.objects.select_related("staff__user", "salary_structure", "recorded_by").all()
        if self.action == "retrieve":
            qs = qs.prefetch_related(Prefetch("lines", queryset=SalaryPaymentLine.unscoped_objects.all()))
        return qs

    def get_serializer_class(self):
        return SalaryPaymentDetailSerializer if self.action == "retrieve" else SalaryPaymentSerializer

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
            f"Generated {len(created)} salary payment(s); each of those staff members has been notified.",
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


class SalaryAdjustmentViewSet(SalaryModelViewSet):
    """Individual deductions (and additions) for one staff member and month, each with a stated reason."""

    serializer_class = SalaryAdjustmentSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]
    filterset_fields = ["staff", "kind", "period_year", "period_month"]
    search_fields = ["reason", "staff__user__first_name", "staff__user__last_name"]
    summary_stats = {"total": {}, "by_kind": {"groupby": "kind"}}

    def get_permissions(self):
        code = {"create": "salary.create", "destroy": "salary.update"}.get(self.action, "salary.view")
        return [require_permission(code)()]

    def get_queryset(self):
        return SalaryAdjustment.objects.select_related("staff__user", "created_by", "salary_payment").all()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            adjustment = services.add_adjustment(
                school=get_current_school(), staff=data["staff"], kind=data["kind"], amount=data["amount"], reason=data["reason"],
                period_year=data["period_year"], period_month=data["period_month"], created_by=request.user,
            )
        except services.SalaryError as exc:
            return Response({"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []}, status=status.HTTP_400_BAD_REQUEST)
        log_action(
            action="salary.adjustment_added",
            actor=request.user,
            school=get_current_school(),
            entity_type="SalaryAdjustment",
            entity_id=str(adjustment.pk),
            severity="warning",
            metadata={
                "staff": str(adjustment.staff_id), "kind": adjustment.kind, "amount": str(adjustment.amount),
                "reason": adjustment.reason, "period": f"{adjustment.period_year}-{adjustment.period_month:02d}",
            },
        )
        response = _ok("Saved, and the staff member has been notified.", adjustment=SalaryAdjustmentSerializer(adjustment, context={"request": request}).data)
        response.status_code = status.HTTP_201_CREATED
        return response

    def destroy(self, request, *args, **kwargs):
        adjustment = self.get_object()
        try:
            services.remove_adjustment(adjustment=adjustment)
        except services.SalaryError as exc:
            return Response({"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []}, status=status.HTTP_400_BAD_REQUEST)
        log_action(
            action="salary.adjustment_reversed", actor=request.user, school=get_current_school(), entity_type="SalaryAdjustment",
            entity_id=str(adjustment.pk), severity="warning", metadata={"reason": adjustment.reason, "amount": str(adjustment.amount)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


def _own_staff(request):
    staff = getattr(request.user, "staff_profile", None)
    if staff is None:
        raise Http404
    return staff


class MySalaryView(TenantScopedAPIView):
    """GET /salary/my-salary/ - the signed-in staff member's own pay: their current plan line by line, one-off changes waiting
    for an upcoming month, and every salary payment with its status. Only ever the caller's own record; no id is accepted."""

    def get(self, request):
        try:
            staff = _own_staff(request)
        except Http404:
            return _ok(has_plan=False, plan=None, payments=[], pending_adjustments=[], adjustments=[])
        assignment = StaffSalaryAssignment.objects.filter(staff=staff).select_related("salary_structure").first()
        plan = None
        if assignment is not None:
            items = services.sort_lines(list(assignment.salary_structure.items.all()))
            gross = sum((i.amount for i in items if i.line_type != "deduction"), start=services.ZERO)
            deductions = sum((i.amount for i in items if i.line_type == "deduction"), start=services.ZERO)
            plan = {
                "name": assignment.salary_structure.name,
                "effective_from": assignment.effective_from,
                "lines": [{"line_type": i.line_type, "description": i.description, "amount": i.amount} for i in items],
                "gross": gross,
                "deductions": deductions,
                "net": gross - deductions,
            }
        payments = SalaryPayment.objects.filter(staff=staff).order_by("-period_year", "-period_month")
        pending = SalaryAdjustment.objects.filter(staff=staff, salary_payment__isnull=True).order_by("period_year", "period_month")
        recent = SalaryAdjustment.objects.filter(staff=staff).select_related("created_by", "salary_payment").order_by("-period_year", "-period_month", "-created_at")[:50]
        return _ok(
            has_plan=plan is not None,
            plan=plan,
            payments=[
                {
                    "id": str(p.pk), "payment_number": p.payment_number, "period_year": p.period_year, "period_month": p.period_month,
                    "gross_amount": p.gross_amount, "deductions_total": p.deductions_total, "net_amount": p.net_amount,
                    "status": p.status, "paid_at": p.paid_at, "method": p.method,
                }
                for p in payments
            ],
            pending_adjustments=SalaryAdjustmentSerializer(pending, many=True, context={"request": request}).data,
            adjustments=SalaryAdjustmentSerializer(recent, many=True, context={"request": request}).data,
        )


class MySalaryReceiptView(TenantScopedAPIView):
    """GET /salary/my-payments/<id>/ - one of the caller's own salary payments with its full breakdown (the receipt)."""

    def get(self, request, pk):
        staff = _own_staff(request)
        payment = SalaryPayment.objects.select_related("staff__user", "salary_structure", "recorded_by", "school").filter(staff=staff, pk=pk).first()
        if payment is None:
            raise Http404
        lines = services.sort_lines(list(SalaryPaymentLine.unscoped_objects.filter(salary_payment=payment)))
        return _ok(
            payment={
                **SalaryPaymentSerializer(payment).data,
                "lines": SalaryPaymentLineSerializer(lines, many=True).data,
                "has_breakdown": bool(lines),
                "school_name": payment.school.name,
                "staff_name": payment.staff.user.full_name,
                "staff_id": payment.staff.staff_id,
                "month_label": services.month_label(payment.period_year, payment.period_month),
            }
        )
