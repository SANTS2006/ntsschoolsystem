from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.common.validators import validate_upload_file, validate_video_file

from .models import Lesson, LessonEnrollment, LessonMaterial


class LessonSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    section_name = serializers.SerializerMethodField()
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True)
    material_count = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            "id", "title", "description", "subject", "subject_name", "school_class", "school_class_name",
            "section", "section_name", "teacher", "teacher_name", "is_active", "target_type", "material_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "teacher", "created_at", "updated_at"]

    def get_section_name(self, obj):
        return str(obj.section) if obj.section_id else None

    def get_material_count(self, obj):
        return obj.materials.count()

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

    def validate(self, attrs):
        school_class = attrs.get("school_class", getattr(self.instance, "school_class", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        if section is not None and school_class is not None and section.school_class_id != school_class.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected class."})
        return attrs


class LessonMaterialSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)
    lesson_title = serializers.CharField(source="lesson.title", read_only=True)

    class Meta:
        model = LessonMaterial
        fields = [
            "id", "lesson", "lesson_title", "material_type", "title", "file",
            "uploaded_by", "uploaded_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at", "updated_at"]

    def validate_lesson(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Lesson must belong to your own school.")
        return value

    def validate(self, attrs):
        material_type = attrs.get("material_type", getattr(self.instance, "material_type", None))
        file = attrs.get("file", getattr(self.instance, "file", None))
        if file:
            validator = validate_video_file if material_type == LessonMaterial.MaterialType.VIDEO else validate_upload_file
            try:
                validator(file)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"file": exc.messages})
        return attrs


class LessonEnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    lesson_title = serializers.CharField(source="lesson.title", read_only=True)

    class Meta:
        model = LessonEnrollment
        fields = ["id", "lesson", "lesson_title", "student", "student_name"]
        read_only_fields = ["id"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_lesson(self, value):
        return self._same_school(value, "Lesson")

    def validate_student(self, value):
        return self._same_school(value, "Student")
