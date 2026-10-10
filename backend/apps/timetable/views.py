from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.academics.models import Section
from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView, TenantScopedModelViewSet
from apps.tenants.context import get_current_school_id

from .models import Period, Room, TimetableEntry
from .serializers import PeriodSerializer, RoomSerializer, TimetableEntrySerializer

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    # Both custom bulk actions below create entries, same as a plain POST — no separate
    # permission code exists (or is needed) for "build a timetable in bulk" vs. one at a time.
    "bulk_create": "create",
    "copy_section": "create",
}


def _error(message):
    # Matches apps.common.exceptions.custom_exception_handler's envelope — these two custom
    # actions return plain Response objects (not raised DRF exceptions), which bypass that
    # handler entirely, so the shape has to be built by hand to keep the frontend's shared
    # ApiError parsing (which keys off a "success" field) working the same way here too.
    return Response({"success": False, "message": message, "code": "VALIDATION_ERROR", "errors": []}, status=400)


class TimetableModelViewSet(TenantScopedModelViewSet):
    """Shared permission wiring for the timetable.* codes across Room/Period/TimetableEntry."""

    def get_permissions(self):
        code = f"timetable.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]


class RoomViewSet(TimetableModelViewSet):
    serializer_class = RoomSerializer
    search_fields = ["name"]
    ordering_fields = ["name"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return Room.objects.all()


class PeriodViewSet(TimetableModelViewSet):
    serializer_class = PeriodSerializer
    search_fields = ["name"]
    ordering_fields = ["order", "start_time"]
    summary_stats = {
        "total": {},
        "class_periods": {"is_break": False},
        "breaks": {"is_break": True},
    }

    def get_queryset(self):
        return Period.objects.all()


class TimetableEntryViewSet(TimetableModelViewSet):
    serializer_class = TimetableEntrySerializer
    filterset_fields = ["section", "day_of_week", "teacher", "room"]

    def get_queryset(self):
        return TimetableEntry.objects.select_related(
            "section", "period", "subject", "teacher__user", "room"
        ).all()

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """
        Saves a whole draft grid (the timetable-builder page) in one request instead of one
        POST per cell. `TimetableEntrySerializer.validate()` already checks each item against
        rows already in the DB, but two cells in the *same* batch — not yet saved, so invisible
        to each other's DB query — could still double-book a teacher/room/section; the
        `seen_*` sets below catch that before anything is written. Nothing is saved unless every
        item passes, so a partial failure never leaves a half-built timetable.
        """
        items = request.data.get("entries")
        if not isinstance(items, list) or not items:
            return _error("entries must be a non-empty list.")

        errors = {}
        validated = []
        seen_section_period = set()
        seen_teacher_period = set()
        seen_room_period = set()

        for index, item in enumerate(items):
            serializer = TimetableEntrySerializer(data=item, context={"request": request})
            if not serializer.is_valid():
                errors[index] = serializer.errors
                continue
            data = serializer.validated_data
            slot = (data["day_of_week"], data["period"].id)

            section_key = (*slot, data["section"].id)
            if section_key in seen_section_period:
                errors[index] = {"section": "This class already has a lesson scheduled in this period."}
                continue

            teacher = data.get("teacher")
            teacher_key = (*slot, teacher.id) if teacher else None
            if teacher_key and teacher_key in seen_teacher_period:
                errors[index] = {"teacher": "This teacher is already scheduled elsewhere in this period."}
                continue

            room = data.get("room")
            room_key = (*slot, room.id) if room else None
            if room_key and room_key in seen_room_period:
                errors[index] = {"room": "This room is already booked in this period."}
                continue

            seen_section_period.add(section_key)
            if teacher_key:
                seen_teacher_period.add(teacher_key)
            if room_key:
                seen_room_period.add(room_key)
            validated.append(data)

        if errors:
            flat_errors = []
            for index, item_errors in errors.items():
                for field, messages in item_errors.items():
                    values = messages if isinstance(messages, list) else [messages]
                    for message in values:
                        flat_errors.append({"field": f"entries[{index}].{field}", "message": str(message)})
            return Response(
                {
                    "success": False,
                    "message": "Some rows could not be scheduled — nothing was saved.",
                    "code": "VALIDATION_ERROR",
                    "errors": flat_errors,
                },
                status=400,
            )

        school_id = get_current_school_id()
        with transaction.atomic():
            created = [TimetableEntry.objects.create(school_id=school_id, **data) for data in validated]

        return Response(TimetableEntrySerializer(created, many=True).data, status=201)

    @action(detail=False, methods=["post"], url_path="copy")
    def copy_section(self, request):
        """
        Copies one section's weekly subject grid to another section — the fast path for schools
        where parallel sections of the same class share the same day/period/subject layout.
        Teacher and room are deliberately NOT copied: they're a `unique_*_day_period` constraint
        away from a guaranteed conflict, since the source section's own row still occupies that
        exact teacher/room at that exact day and period — a parallel section's lesson happens at
        the same time as the original, so it can never share the same teacher or room, only the
        same subject and slot. The target's teacher/room are left unset for the admin to assign
        per section (via the builder or a single-entry edit). A day/period the target section
        already has filled is reported as skipped rather than overwritten, unless `replace`.
        """
        from_section_id = request.data.get("from_section")
        to_section_id = request.data.get("to_section")
        replace = bool(request.data.get("replace"))

        school_id = get_current_school_id()
        try:
            from_section = Section.objects.get(pk=from_section_id, school_id=school_id)
            to_section = Section.objects.get(pk=to_section_id, school_id=school_id)
        except (Section.DoesNotExist, ValueError, TypeError, ValidationError):
            return _error("from_section and to_section must be valid sections in your school.")

        if from_section.id == to_section.id:
            return _error("from_section and to_section must be different.")

        source_entries = list(TimetableEntry.objects.filter(section=from_section))
        created = []
        skipped = []

        with transaction.atomic():
            if replace:
                TimetableEntry.objects.filter(section=to_section).delete()

            for entry in source_entries:
                serializer = TimetableEntrySerializer(
                    data={
                        "section": to_section.id,
                        "day_of_week": entry.day_of_week,
                        "period": entry.period_id,
                        "subject": entry.subject_id,
                    },
                    context={"request": request},
                )
                if serializer.is_valid():
                    serializer.save(school_id=school_id)
                    created.append(serializer.data)
                else:
                    skipped.append(
                        {
                            "day_of_week": entry.day_of_week,
                            "period_name": entry.period.name,
                            "subject_name": entry.subject.name if entry.subject_id else None,
                            "errors": serializer.errors,
                        }
                    )

        return Response({"created": created, "skipped": skipped}, status=201)


class MyTimetableView(TenantScopedAPIView):
    """
    Convenience read: the authenticated user's own timetable — a teacher's
    assigned lessons, or a student's section's lessons. Anyone with a
    profile can view their own; no separate permission check beyond being
    a school member, since this is inherently scoped to "your own".
    """

    def get(self, request):
        entries = TimetableEntry.objects.none()

        staff_profile = getattr(request.user, "staff_profile", None)
        student_profile = getattr(request.user, "student_profile", None)

        if staff_profile is not None:
            entries = TimetableEntry.objects.filter(teacher=staff_profile)
        elif student_profile is not None and student_profile.current_section_id:
            entries = TimetableEntry.objects.filter(section_id=student_profile.current_section_id)

        entries = entries.select_related("section", "period", "subject", "teacher__user", "room")
        return Response(
            {
                "success": True,
                "message": "",
                "code": "OK",
                "errors": [],
                "results": TimetableEntrySerializer(entries, many=True).data,
            }
        )
