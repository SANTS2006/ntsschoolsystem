from rest_framework import serializers

from apps.academics.services import assert_year_not_archived

from .models import StaffAttendance, StudentAttendance


class StudentAttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    # See apps.timetable.serializers.TimetableEntrySerializer for why this is a
    # SerializerMethodField rather than `source="section.__str__"` — the latter
    # breaks (leaks a method-wrapper repr) specifically when section is null,
    # which is the common case here (most attendance is daily, not per-section).
    section_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True, default=None)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default=None)

    def get_section_name(self, obj):
        return str(obj.section) if obj.section_id else None

    class Meta:
        model = StudentAttendance
        fields = [
            "id", "student", "student_name", "date", "status", "section", "section_name",
            "subject", "subject_name", "period", "notes", "recorded_by", "recorded_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "recorded_by", "created_at", "updated_at"]
        # See TimetableEntrySerializer's Meta.validators comment: DRF's
        # auto-generated UniqueTogetherValidator for the (student, date, period)
        # partial constraint incorrectly forces the nullable `period` field to
        # required=True, which would break plain daily attendance (period=None)
        # entirely. The explicit validate() below is the correct, tenant-aware
        # replacement.
        validators = []

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_student(self, value):
        return self._same_school(value, "Student")

    def validate_section(self, value):
        return self._same_school(value, "Section")

    def validate_subject(self, value):
        return self._same_school(value, "Subject")

    def validate_period(self, value):
        return self._same_school(value, "Period")

    def validate(self, attrs):
        """
        Pre-checks the same duplicate the DB partial-unique constraints
        enforce (one daily record per student/date, one per student/date/
        period), so a duplicate POST gets a clean 400 instead of an
        unhandled IntegrityError. Use `bulk-mark` (upserts) to correct an
        existing entry rather than POSTing again.
        """
        student = attrs.get("student", getattr(self.instance, "student", None))
        attendance_date = attrs.get("date", getattr(self.instance, "date", None))
        period = attrs.get("period", getattr(self.instance, "period", None))
        section = attrs.get("section", getattr(self.instance, "section", None))

        if section is not None:
            try:
                assert_year_not_archived(section.academic_year)
            except ValueError as exc:
                raise serializers.ValidationError({"section": str(exc)}) from exc

        qs = StudentAttendance.objects.filter(student=student, date=attendance_date, period=period)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "Attendance for this student/date/period already exists. Update it, or use "
                "the bulk-mark endpoint, instead of creating a new one."
            )
        return attrs


class BulkMarkEntrySerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=[c[0] for c in StudentAttendance._meta.get_field("status").choices])
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class BulkMarkStudentAttendanceSerializer(serializers.Serializer):
    date = serializers.DateField()
    section = serializers.UUIDField()
    subject = serializers.UUIDField()
    entries = BulkMarkEntrySerializer(many=True)


class StaffAttendanceSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.user.full_name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default=None)

    class Meta:
        model = StaffAttendance
        fields = [
            "id", "staff", "staff_name", "date", "status", "check_in_time", "check_out_time",
            "notes", "recorded_by", "recorded_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "recorded_by", "created_at", "updated_at"]
        validators = []  # redundant with the explicit validate() below — see TimetableEntrySerializer.

    def validate_staff(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Staff must belong to your own school.")
        return value

    def validate(self, attrs):
        staff = attrs.get("staff", getattr(self.instance, "staff", None))
        attendance_date = attrs.get("date", getattr(self.instance, "date", None))

        qs = StaffAttendance.objects.filter(staff=staff, date=attendance_date)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "Attendance for this staff member/date already exists. Update it instead."
            )
        return attrs
