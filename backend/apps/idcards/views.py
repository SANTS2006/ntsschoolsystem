from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import SchoolClass
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet
from apps.staff.models import Staff
from apps.students.models import Student
from apps.tenants.services import get_current_school

from . import services
from .models import IdCard
from .serializers import BulkIssueSerializer, IdCardSerializer, IssueCardSerializer, PublicVerificationSerializer


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, http_status=status.HTTP_400_BAD_REQUEST, code="VALIDATION_ERROR"):
    return Response({"success": False, "message": message, "code": code, "errors": []}, status=http_status)


_ACTION_PERMISSION = {
    "issue": "idcards.create",
    "bulk_issue": "idcards.create",
    "revoke": "idcards.update",
}


class IdCardViewSet(TenantScopedModelViewSet):
    """Admin-facing list/issue/revoke, plus `mine` — the self-service card for whoever is signed
    in (same no-permission-gate pattern as every other "My X" view: it's keyed off the caller's own
    student_profile/staff_profile, so there's nothing to leak)."""

    serializer_class = IdCardSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["holder_type", "status"]
    search_fields = ["card_number", "payload__name", "payload__number"]
    ordering_fields = ["issued_at", "card_number"]
    summary_stats = {
        "total": {},
        "active": {"status": IdCard.Status.ACTIVE},
        "students": {"status": IdCard.Status.ACTIVE, "holder_type": IdCard.HolderType.STUDENT},
        "staff": {"status": IdCard.Status.ACTIVE, "holder_type": IdCard.HolderType.STAFF},
        "revoked": {"status": IdCard.Status.REVOKED},
    }

    def get_queryset(self):
        return IdCard.objects.select_related("student", "staff__user", "school").all()

    def get_permissions(self):
        if self.action == "mine":
            return [IsAuthenticated()]
        return [require_permission(_ACTION_PERMISSION.get(self.action, "idcards.view"))()]

    def create(self, request, *args, **kwargs):
        return _error("Use the issue action.", status.HTTP_405_METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED")

    @action(detail=False, methods=["post"])
    def issue(self, request):
        serializer = IssueCardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        school = get_current_school()
        model = Student if data["holder_type"] == IdCard.HolderType.STUDENT else Staff
        holder = get_object_or_404(model, pk=data["holder_id"], school=school)
        try:
            card = services.issue_card(
                holder, issued_by=request.user, expires_at=data.get("expires_at"), request=request
            )
        except services.IdCardError as exc:
            return _error(str(exc))
        response = _ok(
            f"ID card {card.card_number} issued.", card=IdCardSerializer(card, context={"request": request}).data
        )
        response.status_code = status.HTTP_201_CREATED
        return response

    @action(detail=False, methods=["post"], url_path="bulk-issue")
    def bulk_issue(self, request):
        serializer = BulkIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        school = get_current_school()
        school_class = None
        if data.get("school_class"):
            school_class = get_object_or_404(SchoolClass, pk=data["school_class"], school=school)
        issued, skipped = services.bulk_issue(
            holder_type=data["holder_type"],
            school=school,
            school_class=school_class,
            issued_by=request.user,
            request=request,
        )
        return _ok(f"Issued {len(issued)} ID card(s).", issued=len(issued), skipped=skipped)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        card = self.get_object()
        try:
            services.revoke_card(card, actor=request.user)
        except services.IdCardError as exc:
            return _error(str(exc))
        return _ok("ID card revoked.", card=IdCardSerializer(card, context={"request": request}).data)

    @action(detail=False, methods=["get"])
    def mine(self, request):
        user = request.user
        student = getattr(user, "student_profile", None)
        staff = getattr(user, "staff_profile", None)
        qs = IdCard.objects.none()
        if student is not None:
            qs = IdCard.objects.filter(student=student)
        elif staff is not None:
            qs = IdCard.objects.filter(staff=staff)
        card = qs.filter(status=IdCard.Status.ACTIVE).select_related("school").first()
        data = IdCardSerializer(card, context={"request": request}).data if card else None
        return _ok(card=data)


class PublicVerifyCardView(APIView):
    """Public, unauthenticated: what a QR scan resolves to. Looks the card up by its random
    token across all schools (the token is the credential — 192 bits, unguessable) and returns
    only the minimal identity-check summary from services.verification_summary."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "public_application"

    def get(self, request, token):
        card = IdCard.unscoped_objects.select_related("school", "student", "staff__user").filter(
            verify_token=token
        ).first()
        if card is None:
            return _error("This card could not be found.", status.HTTP_404_NOT_FOUND, "NOT_FOUND")
        return _ok(card=PublicVerificationSerializer(services.verification_summary(card)).data)
