from rest_framework import serializers

from .models import Guardian, StudentGuardian


class GuardianSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Guardian
        fields = [
            "id", "user", "first_name", "last_name", "full_name", "email", "phone_number",
            "address", "occupation", "photo", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_user(self, value):
        request = self.context["request"]
        if value is not None:
            if value.school_id != request.user.school_id:
                raise serializers.ValidationError("User must belong to your own school.")
            if hasattr(value, "guardian_profile"):
                raise serializers.ValidationError("This user already has a guardian profile.")
        return value


class StudentGuardianSerializer(serializers.ModelSerializer):
    guardian = GuardianSerializer(read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    class Meta:
        model = StudentGuardian
        fields = [
            "id", "student", "student_name", "guardian", "relationship",
            "is_primary", "is_emergency_contact",
        ]
        read_only_fields = fields
