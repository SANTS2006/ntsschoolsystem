from rest_framework import serializers

from .models import Student


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    current_academic_year_name = serializers.CharField(
        source="current_academic_year.name", read_only=True, default=None
    )
    current_class_name = serializers.CharField(source="current_class.name", read_only=True, default=None)
    current_section_name = serializers.CharField(source="current_section.name", read_only=True, default=None)

    class Meta:
        model = Student
        fields = [
            "id", "user", "admission_number", "first_name", "middle_name", "last_name", "full_name",
            "date_of_birth", "gender", "photo", "address", "previous_school",
            "admission_date", "status",
            "current_academic_year", "current_academic_year_name",
            "current_class", "current_class_name",
            "current_section", "current_section_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _validate_same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_current_academic_year(self, value):
        return self._validate_same_school(value, "Academic year")

    def validate_current_class(self, value):
        return self._validate_same_school(value, "Class")

    def validate_current_section(self, value):
        return self._validate_same_school(value, "Section")

    def validate_user(self, value):
        request = self.context["request"]
        if value is not None:
            if value.school_id != request.user.school_id:
                raise serializers.ValidationError("User must belong to your own school.")
            if hasattr(value, "student_profile"):
                raise serializers.ValidationError("This user already has a student profile.")
        return value
