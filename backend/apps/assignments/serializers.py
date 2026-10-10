from decimal import Decimal

from rest_framework import serializers

from .models import Assignment, AssignmentSubmission


class AssignmentSerializer(serializers.ModelSerializer):
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    section_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.user.full_name", read_only=True)
    submission_count = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id", "title", "description", "school_class", "school_class_name", "section", "section_name",
            "subject", "subject_name", "teacher", "teacher_name", "due_date", "max_score", "attachment",
            "is_active", "submission_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "teacher", "created_at", "updated_at"]

    def get_section_name(self, obj):
        return str(obj.section) if obj.section_id else None

    def get_submission_count(self, obj):
        return obj.submissions.count()

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_school_class(self, value):
        return self._same_school(value, "Class")

    def validate_section(self, value):
        return self._same_school(value, "Section")

    def validate_subject(self, value):
        return self._same_school(value, "Subject")

    def validate(self, attrs):
        school_class = attrs.get("school_class", getattr(self.instance, "school_class", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        if section is not None and school_class is not None and section.school_class_id != school_class.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected class."})
        return attrs


class AssignmentSubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    graded_by_name = serializers.CharField(source="graded_by.user.full_name", read_only=True, default=None)

    class Meta:
        model = AssignmentSubmission
        fields = [
            "id", "assignment", "assignment_title", "student", "student_name", "submitted_at", "attachment",
            "status", "score", "feedback", "graded_by", "graded_by_name", "graded_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "submitted_at", "status", "score", "feedback", "graded_by", "graded_at",
            "created_at", "updated_at",
        ]

    def validate_assignment(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Assignment must belong to your own school.")
        return value

    def validate_student(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Student must belong to your own school.")
        return value


class GradeSubmissionSerializer(serializers.Serializer):
    score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal("0"))
    feedback = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_score(self, value):
        assignment = self.context["submission"].assignment
        if value > assignment.max_score:
            raise serializers.ValidationError(f"Score cannot exceed the assignment's max score of {assignment.max_score}.")
        return value
