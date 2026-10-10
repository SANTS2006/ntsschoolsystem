from rest_framework import serializers

from .models import LiveSession, LiveSessionRecipient


class LiveSessionSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    section_name = serializers.SerializerMethodField()
    lesson_title = serializers.CharField(source="lesson.title", read_only=True, default=None)
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True)

    class Meta:
        model = LiveSession
        fields = [
            "id", "title", "subject", "subject_name", "school_class", "school_class_name",
            "section", "section_name", "lesson", "lesson_title", "teacher", "teacher_name",
            "scheduled_start", "status", "target_type", "daily_room_url", "started_at", "ended_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "teacher", "status", "daily_room_url", "started_at", "ended_at",
            "created_at", "updated_at",
        ]

    def get_section_name(self, obj):
        return str(obj.section) if obj.section_id else None

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_subject(self, value):
        return self._same_school(value, "Subject")

    def validate_school_class(self, value):
        return self._same_school(value, "Class")

    def validate_section(self, value):
        return self._same_school(value, "Section")

    def validate_lesson(self, value):
        return self._same_school(value, "Lesson")

    def validate(self, attrs):
        from . import services

        request = self.context["request"]
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        school_class = attrs.get("school_class", getattr(self.instance, "school_class", None))
        if services.works_as_teacher(request.user) and subject is not None and school_class is not None:
            if (subject.id, school_class.id) not in services.teaching_pairs(request.user):
                raise serializers.ValidationError("You can only schedule sessions for subjects and classes you are assigned to teach.")
        school_class = attrs.get("school_class", getattr(self.instance, "school_class", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        if section is not None and school_class is not None and section.school_class_id != school_class.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected class."})
        return attrs


class LiveSessionRecipientSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    session_title = serializers.CharField(source="session.title", read_only=True)

    class Meta:
        model = LiveSessionRecipient
        fields = ["id", "session", "session_title", "student", "student_name"]
        read_only_fields = ["id"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_session(self, value):
        return self._same_school(value, "Session")

    def validate_student(self, value):
        return self._same_school(value, "Student")
