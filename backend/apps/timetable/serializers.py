from rest_framework import serializers

from apps.academics.services import assert_year_not_archived

from .models import Period, Room, TimetableEntry


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "name", "capacity", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        # `school` is never a serializer field (it's set server-side in perform_create), and
        # DRF only auto-generates a unique-together validator for a Meta.constraints entry when
        # every field in that constraint is present on the serializer — so
        # `unique_room_name_per_school` silently gets no validator at all, leaving the DB
        # constraint as the only enforcement (a raw 500 IntegrityError instead of a clean 400).
        # Checked explicitly here instead; see TimetableEntrySerializer.validate() for the
        # sibling case of a DRF-generated validator existing but being *wrong*, not missing.
        school = self.context["request"].user.school
        qs = Room.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A room with this name already exists.")
        return value


class PeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = Period
        fields = ["id", "name", "start_time", "end_time", "order", "is_break", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _unique_school_field(self, field, value, message):
        # Same gap as RoomSerializer.validate_name — `school` isn't a serializer field, so
        # neither `unique_period_name_per_school` nor `unique_period_order_per_school` ever gets
        # an automatic validator.
        school = self.context["request"].user.school
        qs = Period.objects.filter(school=school, **{field: value})
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(message)
        return value

    def validate_name(self, value):
        return self._unique_school_field("name", value, "A period with this name already exists.")

    def validate_order(self, value):
        return self._unique_school_field("order", value, "A period with this order value already exists.")


class TimetableEntrySerializer(serializers.ModelSerializer):
    # A plain `source="section.__str__"` CharField looks tempting but is broken: DRF's
    # attribute-traversal only auto-calls "simple" (pure-Python) callables, not C-level
    # method-wrappers — so on a *null* relation, `None.__str__` resolves to an
    # uncalled method-wrapper object whose repr leaks into the response instead of
    # being treated as the string it should be. A SerializerMethodField sidesteps the
    # whole issue and reads correctly whether or not the relation is null.
    section_name = serializers.SerializerMethodField()
    period_name = serializers.CharField(source="period.name", read_only=True)
    period_start_time = serializers.TimeField(source="period.start_time", read_only=True, format="%H:%M")
    period_end_time = serializers.TimeField(source="period.end_time", read_only=True, format="%H:%M")
    period_order = serializers.IntegerField(source="period.order", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True, default=None)
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True, default=None)
    room_name = serializers.CharField(source="room.name", read_only=True, default=None)

    def get_section_name(self, obj):
        return str(obj.section) if obj.section_id else None

    class Meta:
        model = TimetableEntry
        fields = [
            "id", "section", "section_name", "day_of_week", "period", "period_name",
            "period_start_time", "period_end_time", "period_order", "subject", "subject_name", "teacher", "teacher_name", "room", "room_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        # DRF auto-generates a UniqueTogetherValidator per unique constraint in
        # Meta.constraints — for `unique_teacher_day_period`/`unique_room_day_period`
        # (partial constraints on nullable teacher/room), that auto-validator
        # incorrectly forces `teacher`/`room` to `required=True`, breaking a lesson
        # with no assigned teacher/room (e.g. private study). The explicit
        # `validate()` above already checks the same conflicts correctly
        # (tenant-scoped, aware of nullability) — DB constraints remain the
        # real safety net regardless.
        validators = []

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_section(self, value):
        return self._same_school(value, "Section")

    def validate_period(self, value):
        return self._same_school(value, "Period")

    def validate_subject(self, value):
        return self._same_school(value, "Subject")

    def validate_teacher(self, value):
        return self._same_school(value, "Teacher")

    def validate_room(self, value):
        return self._same_school(value, "Room")

    def validate(self, attrs):
        """
        Pre-checks the same conflicts the DB unique constraints enforce, so a
        double-booking attempt gets a clean 400 with a specific message
        instead of a raw IntegrityError. The constraints remain the actual
        source of truth (defense against races / any path that bypasses
        this serializer).
        """
        section = attrs.get("section", getattr(self.instance, "section", None))
        day = attrs.get("day_of_week", getattr(self.instance, "day_of_week", None))
        period = attrs.get("period", getattr(self.instance, "period", None))
        teacher = attrs.get("teacher", getattr(self.instance, "teacher", None))
        room = attrs.get("room", getattr(self.instance, "room", None))

        if section is not None:
            try:
                assert_year_not_archived(section.academic_year)
            except ValueError as exc:
                raise serializers.ValidationError({"section": str(exc)}) from exc

        qs = TimetableEntry.objects.filter(day_of_week=day, period=period)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.filter(section=section).exists():
            raise serializers.ValidationError(
                {"section": "This class already has a lesson scheduled in this period."}
            )
        if teacher is not None and qs.filter(teacher=teacher).exists():
            raise serializers.ValidationError(
                {"teacher": "This teacher is already scheduled elsewhere in this period."}
            )
        if room is not None and qs.filter(room=room).exists():
            raise serializers.ValidationError(
                {"room": "This room is already booked in this period."}
            )
        return attrs
