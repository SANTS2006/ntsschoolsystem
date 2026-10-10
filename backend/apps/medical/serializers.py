from rest_framework import serializers

from .models import MedicalProfile, MedicalVisit


class MedicalProfileSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    class Meta:
        model = MedicalProfile
        fields = [
            "id", "student", "student_name", "blood_group", "allergies", "chronic_conditions",
            "emergency_contact_name", "emergency_contact_phone", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_student(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Student must belong to your own school.")
        if not self.instance and hasattr(value, "medical_profile"):
            raise serializers.ValidationError("This student already has a medical profile.")
        return value


class MedicalVisitSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    attended_by_name = serializers.CharField(source="attended_by.user.full_name", read_only=True, default=None)

    class Meta:
        model = MedicalVisit
        fields = [
            "id", "student", "student_name", "attended_by", "attended_by_name", "visit_type",
            "visited_at", "symptoms", "treatment", "notes", "parent_notified",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_student(self, value):
        return self._same_school(value, "Student")

    def validate_attended_by(self, value):
        return self._same_school(value, "Staff")
