from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.academics.models import AcademicYear, SchoolClass, Term
from apps.audit.services import log_action
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet
from apps.students.models import Student
from apps.tenants.services import get_current_school

from . import services
from .models import FeeCategory, FeeStructure, FeeStructureItem, Invoice, InvoiceLineItem, Payment
from .serializers import (
    FeeCategorySerializer,
    FeeStructureItemSerializer,
    FeeStructureSerializer,
    GenerateInvoicesSerializer,
    InvoiceCreateSerializer,
    InvoiceLineItemSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    RecordRefundSerializer,
    RefundSerializer,
)

_FEES_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class FeesModelViewSet(TenantScopedModelViewSet):
    """Shared permission wiring for the fees.* codes across category/structure/item config."""

    def get_permissions(self):
        code = f"fees.{_FEES_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]


class FeeCategoryViewSet(FeesModelViewSet):
    serializer_class = FeeCategorySerializer
    search_fields = ["name", "code"]
    summary_stats = {
        "total": {},
        "recurring": {"is_recurring": True},
    }

    def get_queryset(self):
        return FeeCategory.objects.all()


class FeeStructureViewSet(FeesModelViewSet):
    serializer_class = FeeStructureSerializer
    filterset_fields = ["academic_year", "term", "school_class"]
    search_fields = ["name"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return FeeStructure.objects.select_related("academic_year", "term", "school_class").all()


class FeeStructureItemViewSet(FeesModelViewSet):
    serializer_class = FeeStructureItemSerializer
    filterset_fields = ["fee_structure"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return FeeStructureItem.objects.select_related("fee_structure", "fee_category").all()


class InvoiceViewSet(TenantScopedModelViewSet):
    """
    `create()` is bespoke (via InvoiceCreateSerializer + services) rather
    than the default ModelSerializer flow, since an invoice is always
    created together with its line items and its totals must be computed
    once, atomically, right after — never partially.
    """

    serializer_class = InvoiceSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["student", "academic_year", "term", "status", "fee_structure"]
    search_fields = ["invoice_number"]
    summary_stats = {
        "total": {},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        action_map = {**_FEES_ACTION_SUFFIX, "generate": "create", "cancel": "update", "outstanding": "view", "stats": "view"}
        code = f"fees.{action_map.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return Invoice.objects.select_related("student", "academic_year", "term", "fee_structure").all()

    def create(self, request, *args, **kwargs):
        serializer = InvoiceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        school = get_current_school()

        student = get_object_or_404(Student, pk=data["student"], school=school)
        academic_year = get_object_or_404(AcademicYear, pk=data["academic_year"], school=school)
        if academic_year.is_archived:
            raise ValidationError(f'"{academic_year.name}" is archived; new invoices cannot be created against it.')
        term = None
        if data.get("term"):
            term = get_object_or_404(Term, pk=data["term"], school=school)

        line_items = []
        for item in data["line_items"]:
            fee_category = None
            if item.get("fee_category"):
                fee_category = get_object_or_404(FeeCategory, pk=item["fee_category"], school=school)
            line_items.append(
                {
                    "fee_category": fee_category,
                    "line_type": item["line_type"],
                    "description": item.get("description", ""),
                    "amount": item["amount"],
                }
            )

        invoice = services.create_invoice_with_line_items(
            school=school,
            student=student,
            academic_year=academic_year,
            term=term,
            due_date=data.get("due_date"),
            line_items=line_items,
        )
        log_action(
            action="fees.invoice_created",
            actor=request.user,
            school=school,
            entity_type="Invoice",
            entity_id=str(invoice.pk),
            after={"invoice_number": invoice.invoice_number, "total": str(invoice.total)},
        )
        return Response(
            {"success": True, "message": "Invoice created.", "code": "OK", "errors": [], "invoice": InvoiceSerializer(invoice).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """Bulk-generates one invoice per student from a FeeStructure, optionally filtered to one class."""
        serializer = GenerateInvoicesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        school = get_current_school()

        fee_structure = get_object_or_404(FeeStructure, pk=data["fee_structure"], school=school)
        if fee_structure.academic_year.is_archived:
            raise ValidationError(
                f'"{fee_structure.academic_year.name}" is archived; invoices cannot be generated against it.'
            )
        students_qs = Student.objects.filter(status=Student.Status.ACTIVE)
        school_class_id = data.get("school_class") or fee_structure.school_class_id
        if school_class_id:
            get_object_or_404(SchoolClass, pk=school_class_id, school=school)
            students_qs = students_qs.filter(current_class_id=school_class_id)

        created, skipped = services.generate_invoices_from_structure(
            fee_structure=fee_structure,
            students=list(students_qs),
            due_date=data.get("due_date"),
        )
        log_action(
            action="fees.invoices_generated",
            actor=request.user,
            school=school,
            entity_type="FeeStructure",
            entity_id=str(fee_structure.pk),
            metadata={"created": len(created), "skipped": len(skipped)},
        )
        return _ok(
            f"Generated {len(created)} invoice(s).",
            invoices=InvoiceSerializer(created, many=True).data,
            skipped_student_ids=[str(s) for s in skipped],
        )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        if invoice.amount_paid > 0:
            return Response(
                {
                    "success": False,
                    "message": "Cannot cancel an invoice that already has payments recorded against it.",
                    "code": "INVALID_OPERATION",
                    "errors": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])
        log_action(
            action="fees.invoice_cancelled",
            actor=request.user,
            school=get_current_school(),
            entity_type="Invoice",
            entity_id=str(invoice.pk),
            severity="warning",
        )
        return _ok("Invoice cancelled.", invoice=InvoiceSerializer(invoice).data)

    @action(detail=False, methods=["get"])
    def outstanding(self, request):
        qs = self.filter_queryset(self.get_queryset()).filter(
            status__in=[Invoice.Status.UNPAID, Invoice.Status.PARTIALLY_PAID]
        )
        page = self.paginate_queryset(qs)
        serializer = InvoiceSerializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return _ok(results=serializer.data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        from django.db.models import Sum

        qs = self.filter_queryset(self.get_queryset()).exclude(status=Invoice.Status.CANCELLED)
        totals = qs.aggregate(total_invoiced=Sum("total"), total_collected=Sum("amount_paid"), total_outstanding=Sum("balance"))
        return _ok(
            stats={
                "total_invoiced": totals["total_invoiced"] or 0,
                "total_collected": totals["total_collected"] or 0,
                "total_outstanding": totals["total_outstanding"] or 0,
            }
        )


class InvoiceLineItemViewSet(FeesModelViewSet):
    serializer_class = InvoiceLineItemSerializer
    filterset_fields = ["invoice"]
    summary_stats = {
        "total": {},
        "by_line_type": {"groupby": "line_type"},
    }

    def get_queryset(self):
        return InvoiceLineItem.objects.select_related("invoice", "fee_category").all()

    def perform_update(self, serializer):
        serializer.save()
        serializer.instance.invoice.recalculate_amounts()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school())
        serializer.instance.invoice.recalculate_amounts()

    def perform_destroy(self, instance):
        # ValidationError, not FinanceError — this runs inside DRF's normal
        # dispatch, and only a DRF-recognized exception gets turned into a
        # clean 400 by custom_exception_handler; anything else surfaces as
        # an unhandled 500.
        invoice = instance.invoice
        if invoice.payments.exists():
            raise ValidationError(
                "Cannot remove a line item once a payment has been recorded against this invoice."
            )
        instance.delete()
        invoice.recalculate_amounts()


_PAYMENT_ACTION_PERMISSION = {
    "list": "payments.view",
    "retrieve": "payments.view",
    "create": "payments.record",
    "refund": "payments.refund",
}


class PaymentViewSet(TenantScopedModelViewSet):
    serializer_class = PaymentSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["invoice", "method", "status"]
    summary_stats = {
        "total": {},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        code = _PAYMENT_ACTION_PERMISSION.get(self.action, "payments.view")
        return [require_permission(code)()]

    def get_queryset(self):
        return Payment.objects.select_related("invoice__student", "recorded_by").all()

    def create(self, request, *args, **kwargs):
        serializer = PaymentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            payment = services.record_payment(
                invoice=data["invoice"],
                amount=data["amount"],
                method=data["method"],
                reference=data.get("reference", ""),
                notes=data.get("notes", ""),
                recorded_by=request.user,
            )
        except services.DuplicatePaymentError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "DUPLICATE_PAYMENT", "errors": []},
                status=status.HTTP_409_CONFLICT,
            )
        except services.FinanceError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_action(
            action="payments.recorded",
            actor=request.user,
            school=get_current_school(),
            entity_type="Payment",
            entity_id=str(payment.pk),
            after={"amount": str(payment.amount), "method": payment.method, "invoice": payment.invoice.invoice_number},
        )
        return Response(
            {"success": True, "message": "Payment recorded.", "code": "OK", "errors": [], "payment": PaymentSerializer(payment).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def refund(self, request, pk=None):
        payment = self.get_object()
        serializer = RecordRefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            refund = services.record_refund(
                payment=payment, amount=data["amount"], reason=data["reason"], refunded_by=request.user
            )
        except services.FinanceError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_action(
            action="payments.refunded",
            actor=request.user,
            school=get_current_school(),
            entity_type="Payment",
            entity_id=str(payment.pk),
            severity="warning",
            after={"refund_amount": str(refund.amount), "reason": refund.reason},
        )
        return _ok("Refund recorded.", refund=RefundSerializer(refund).data)
