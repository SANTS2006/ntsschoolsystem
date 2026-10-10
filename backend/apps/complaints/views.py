from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audit.services import log_action
from apps.authorization.permissions import require_permission
from apps.authorization.services import user_has_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.notifications.services import notify
from apps.staff.models import Staff
from apps.tenants.services import get_current_school
from apps.users.models import User

from .models import Complaint, ComplaintResponse
from .rules import can_act_on_complaint
from .serializers import (
    AssignComplaintSerializer,
    ComplaintResponseSerializer,
    ComplaintSerializer,
    ResolveComplaintSerializer,
)

_SELF_SERVICE_ACTIONS = {"list", "retrieve", "create", "summary"}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class ComplaintViewSet(TenantScopedModelViewSet):
    """Submitting and viewing your own complaints needs no permission grant at all — this system
    has no default student/parent role (see the note on `Complaint`), so gating self-service
    behind an RBAC code would lock every non-staff user out entirely. `complaints.view` staff get
    every complaint in the school; everyone else only ever sees their own, enforced in
    `get_queryset` (so `retrieve`/`update` on someone else's complaint 404s rather than 403s —
    DRF's `get_object()` filters through the same queryset, it never even sees the row exists)."""

    serializer_class = ComplaintSerializer
    filterset_fields = ["category", "status", "priority"]
    search_fields = ["subject", "description"]
    summary_stats = {
        "total": {},
        "submitted": {"status": Complaint.Status.SUBMITTED},
        "under_review": {"status": Complaint.Status.UNDER_REVIEW},
        "resolved": {"status": Complaint.Status.RESOLVED},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        if self.action in _SELF_SERVICE_ACTIONS:
            return [IsAuthenticated()]
        if self.action in ("assign", "resolve", "reject"):
            return [require_permission("complaints.manage")()]
        return [require_permission("complaints.manage")()]

    def get_queryset(self):
        base = Complaint.objects.select_related("submitted_by", "assigned_to", "addressed_to").all()
        if user_has_permission(self.request.user, "complaints.view"):
            return base
        # A complaint addressed to this user is visible to them even without complaints.manage
        # — backward compatible, since complaints.manage holders keep seeing everything
        # regardless of addressed_to, and an unassigned/unaddressed complaint is unaffected.
        return base.filter(Q(submitted_by=self.request.user) | Q(addressed_to=self.request.user))

    def perform_create(self, serializer):
        complaint = serializer.save(school=get_current_school(), submitted_by=self.request.user)
        log_action(
            action="complaints.submitted",
            actor=self.request.user,
            school=get_current_school(),
            entity_type="Complaint",
            entity_id=str(complaint.pk),
        )
        if complaint.addressed_to_id:
            notify(
                recipient=complaint.addressed_to,
                category="complaint",
                title="A complaint was addressed to you",
                message=complaint.subject,
                link=f"/complaints/{complaint.id}",
                email_subject=f"New complaint: {complaint.subject}",
                email_html=(
                    f"<p>A complaint titled \"{complaint.subject}\" has been addressed to you.</p>"
                    f"<p>Log in to view and respond.</p>"
                ),
            )

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        complaint = self.get_object()
        self._require_can_act(request, complaint)
        serializer = AssignComplaintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignee = get_object_or_404(User, pk=serializer.validated_data["assigned_to"], school=get_current_school())

        complaint.assigned_to = assignee
        if complaint.status == Complaint.Status.SUBMITTED:
            complaint.status = Complaint.Status.UNDER_REVIEW
        complaint.save(update_fields=["assigned_to", "status", "updated_at"])
        log_action(
            action="complaints.assigned",
            actor=request.user,
            school=get_current_school(),
            entity_type="Complaint",
            entity_id=str(complaint.pk),
            metadata={"assigned_to": str(assignee.pk)},
        )
        return _ok("Complaint assigned.", complaint=ComplaintSerializer(complaint, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        return self._close(request, pk, Complaint.Status.RESOLVED, "resolved")

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._close(request, pk, Complaint.Status.REJECTED, "rejected")

    @staticmethod
    def _require_can_act(request, complaint):
        if not can_act_on_complaint(request.user, complaint):
            raise PermissionDenied("Only the person this complaint was addressed to can act on it.")

    def _close(self, request, pk, new_status, past_tense):
        complaint = self.get_object()
        self._require_can_act(request, complaint)
        if complaint.status in (Complaint.Status.RESOLVED, Complaint.Status.REJECTED):
            return Response(
                {
                    "success": False,
                    "message": "This complaint is already closed.",
                    "code": "ALREADY_CLOSED",
                    "errors": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ResolveComplaintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        complaint.status = new_status
        complaint.resolution_notes = serializer.validated_data["resolution_notes"]
        complaint.resolved_at = timezone.now()
        complaint.save(update_fields=["status", "resolution_notes", "resolved_at", "updated_at"])

        notify(
            recipient=complaint.submitted_by,
            category="complaint",
            title=f"Your complaint was {past_tense}",
            message=complaint.subject,
            link=f"/complaints/{complaint.id}",
        )
        log_action(
            action=f"complaints.{past_tense}",
            actor=request.user,
            school=get_current_school(),
            entity_type="Complaint",
            entity_id=str(complaint.pk),
        )
        return _ok(
            f"Complaint {past_tense}.", complaint=ComplaintSerializer(complaint, context={"request": request}).data
        )


class ComplaintResponseViewSet(TenantScopedModelViewSet):
    """Both the submitter and staff can read/post in a complaint's response thread — an
    object-level check (not a plain permission-code gate) decides which, since "is this my own
    complaint's thread" can't be expressed as a role grant."""

    serializer_class = ComplaintResponseSerializer
    filterset_fields = ["complaint"]

    def get_permissions(self):
        return [IsAuthenticated()]

    def get_queryset(self):
        base = ComplaintResponse.objects.select_related("complaint", "author").all()
        if user_has_permission(self.request.user, "complaints.view"):
            return base
        # Same visibility grant as ComplaintViewSet.get_queryset: the submitter and anyone the
        # complaint is addressed to can both see (and, in perform_create below, post in) the
        # thread, even without complaints.manage.
        return base.filter(
            Q(complaint__submitted_by=self.request.user) | Q(complaint__addressed_to=self.request.user)
        )

    def perform_create(self, serializer):
        complaint = serializer.validated_data["complaint"]
        is_staff = user_has_permission(self.request.user, "complaints.manage")
        is_submitter = complaint.submitted_by_id == self.request.user.id
        is_addressee = complaint.addressed_to_id == self.request.user.id
        if not (is_staff or is_submitter or is_addressee):
            raise PermissionDenied("You can only respond on your own complaint.")
        response = serializer.save(school=get_current_school(), author=self.request.user)

        # Notify the other side of the conversation — staff replying notifies the submitter,
        # the submitter following up notifies whoever's assigned (if anyone yet).
        if is_submitter and complaint.assigned_to_id:
            notify(
                recipient=complaint.assigned_to,
                category="complaint",
                title="New reply on a complaint",
                message=f"{self.request.user.full_name} replied on \"{complaint.subject}\"",
                link=f"/complaints/{complaint.id}",
            )
        elif not is_submitter:
            notify(
                recipient=complaint.submitted_by,
                category="complaint",
                title="New reply on your complaint",
                message=f"\"{complaint.subject}\" has a new reply",
                link=f"/complaints/{complaint.id}",
            )
        return response


class AddressableStaffView(TenantScopedAPIView):
    """A minimal staff directory for the complaint submission form's "Address to" picker —
    deliberately NOT the full `/staff/` endpoint (gated by `staff.view`, which a plain student
    submitting a complaint would never have), just id+name for every active staff member in the
    requester's own school. No permission gate beyond authentication, same self-service
    reasoning as the rest of this module."""

    def get(self, request):
        staff = Staff.objects.filter(
            employment_status=Staff.EmploymentStatus.ACTIVE
        ).select_related("user").order_by("user__first_name", "user__last_name")
        return _ok(staff=[{"id": str(s.user_id), "name": s.user.full_name} for s in staff])
