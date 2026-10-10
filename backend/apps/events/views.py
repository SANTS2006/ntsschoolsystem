from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audit.services import log_action
from apps.authorization.permissions import require_permission
from apps.authorization.services import user_has_permission
from apps.common.audience import visible_filter
from apps.common.views import CreatorOnlyActionsMixin, TenantScopedModelViewSet
from apps.tenants.services import get_current_school

from . import services
from .models import Event, EventMedia, EventRecipient, EventRegistration
from .serializers import (
    EventMediaSerializer,
    EventRecipientSerializer,
    EventRegistrationSerializer,
    EventSerializer,
)

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "publish": "update",
    "cancel": "update",
    "attendees": "view",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class EventViewSet(CreatorOnlyActionsMixin, TenantScopedModelViewSet):
    # Anyone with the right permission can see an event and register for it, but only its creator
    # edits, publishes, cancels or deletes it.
    creator_only_actions = {"update", "partial_update", "destroy", "publish", "cancel"}
    creator_only_message = "You can only edit, publish, cancel or delete events you created."
    serializer_class = EventSerializer
    filterset_fields = ["category", "status", "target_type"]
    search_fields = ["title", "description", "location"]
    ordering_fields = ["start_datetime", "created_at"]
    summary_stats = {
        "total": {},
        "published": {"status": Event.Status.PUBLISHED},
        "upcoming": {"status": Event.Status.PUBLISHED, "start_datetime__gte": timezone.now},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            # Anyone signed in may ask; get_queryset narrows it to what they are allowed to see.
            return [IsAuthenticated()]
        if self.action in ("register", "cancel_registration"):
            return [require_permission("events.register")()]
        code = f"events.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        qs = Event.objects.select_related("target_class", "target_section", "target_department").all()
        user = self.request.user
        if not user_has_permission(user, "events.view"):
            # No view access to the module: only published events that reached this person.
            return qs.filter(status=Event.Status.PUBLISHED, specific_recipients__user=user).distinct()
        # With view access: everything except events restricted to an audience this person isn't part of.
        return qs.filter(visible_filter(user, "specific_recipients")).distinct()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school(), created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        event = self.get_object()
        if event.status != Event.Status.DRAFT:
            return Response(
                {
                    "success": False,
                    "message": "Only a draft event can be published.",
                    "code": "INVALID_TRANSITION",
                    "errors": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        recipient_count = services.publish_event(event)
        log_action(
            action="events.published",
            actor=request.user,
            school=get_current_school(),
            entity_type="Event",
            entity_id=str(event.pk),
        )
        return _ok(f"Published to {recipient_count} recipient(s).", event=EventSerializer(event).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        event = self.get_object()
        event.status = Event.Status.CANCELLED
        event.save(update_fields=["status", "updated_at"])
        log_action(
            action="events.cancelled",
            actor=request.user,
            school=get_current_school(),
            entity_type="Event",
            entity_id=str(event.pk),
            severity="warning",
        )
        return _ok("Event cancelled.", event=EventSerializer(event).data)

    @action(detail=True, methods=["get"])
    def attendees(self, request, pk=None):
        event = self.get_object()
        registrations = event.registrations.select_related("user").exclude(status=EventRegistration.Status.CANCELLED)
        return _ok(attendees=EventRegistrationSerializer(registrations, many=True).data)

    @action(detail=True, methods=["post"])
    def register(self, request, pk=None):
        event = self.get_object()
        if event.status != Event.Status.PUBLISHED:
            return Response(
                {
                    "success": False,
                    "message": "This event is not open for registration.",
                    "code": "NOT_PUBLISHED",
                    "errors": [],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Locks the event row for the transaction's duration so two concurrent registration
        # requests for the last remaining spot can't both pass the capacity check — the second
        # blocks until the first commits, then re-reads `registered_count` including that new
        # row. Same select_for_update()-then-recheck template as
        # apps.finance.services.record_payment/apps.library.services.checkout_book/
        # apps.hostel.services.allocate_bed. `unscoped_objects`: `self.get_object()` above already
        # established this event belongs to the right school, so re-fetching it by its own PK
        # needs no fresh tenant-filtering decision.
        with transaction.atomic():
            event = Event.unscoped_objects.select_for_update().get(pk=event.pk)
            existing = EventRegistration.objects.filter(event=event, user=request.user).first()
            if existing is not None and existing.status == EventRegistration.Status.REGISTERED:
                return Response(
                    {
                        "success": False,
                        "message": "You're already registered for this event.",
                        "code": "ALREADY_REGISTERED",
                        "errors": [],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if event.capacity is not None and event.registered_count >= event.capacity:
                return Response(
                    {
                        "success": False,
                        "message": "This event is full.",
                        "code": "EVENT_FULL",
                        "errors": [],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if existing is not None:
                existing.status = EventRegistration.Status.REGISTERED
                existing.save(update_fields=["status"])
                registration = existing
            else:
                registration = EventRegistration.objects.create(
                    school=get_current_school(), event=event, user=request.user
                )
        return _ok("Registered.", registration=EventRegistrationSerializer(registration).data)

    @action(detail=True, methods=["post"], url_path="cancel-registration")
    def cancel_registration(self, request, pk=None):
        event = self.get_object()
        registration = get_object_or_404(EventRegistration, event=event, user=request.user)
        registration.status = EventRegistration.Status.CANCELLED
        registration.save(update_fields=["status"])
        return _ok("Registration cancelled.", registration=EventRegistrationSerializer(registration).data)


class EventRecipientViewSet(TenantScopedModelViewSet):
    """Manages the explicit audience list for events with target_type=specific_users — same
    shape as `apps.communications.AnnouncementRecipientViewSet`."""

    serializer_class = EventRecipientSerializer
    filterset_fields = ["event"]

    def get_permissions(self):
        code = f"events.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return EventRecipient.objects.select_related("event", "user").all()


class EventMediaViewSet(TenantScopedModelViewSet):
    """A small photo/video gallery per event. Upload/delete gated by `events.update` (no new
    permission code needed — the same code that already lets someone edit the event lets them
    curate its gallery); view gated by `events.view` like the parent Event itself, so visibility
    never diverges from whatever the Event's own read access already grants."""

    serializer_class = EventMediaSerializer
    filterset_fields = ["event", "media_type"]

    def get_permissions(self):
        suffix = "update" if self.action in ("create", "update", "partial_update", "destroy") else "view"
        return [require_permission(f"events.{suffix}")()]

    def get_queryset(self):
        return EventMedia.objects.select_related("event", "uploaded_by").all()

    def perform_create(self, serializer):
        serializer.save(school=get_current_school(), uploaded_by=self.request.user)
