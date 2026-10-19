from rest_framework import serializers

from .models import Student


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    current_academic_year_name = serializers.CharField(
        source="current_academic_year.name", read_only=True, default=None
    )
    current_class_name = serializers.CharField(source="current_class.name", read_only=True, default=None)
    current_section_name = serializers.CharField(source="current_section.name", read_only=True, default=None)

    class Meta:
        model = Student
        fields = [
            "id", "user", "email", "admission_number", "first_name", "middle_name", "last_name", "full_name",
            "date_of_birth", "gender", "photo", "address", "previous_school",
            "admission_date", "status", "access_revoked", "access_revoked_reason", "access_revoked_at",
            "current_academic_year", "current_academic_year_name",
            "current_class", "current_class_name",
            "current_section", "current_section_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "access_revoked", "access_revoked_reason", "access_revoked_at", "created_at", "updated_at"]

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

    def validate_email(self, value):
        from apps.users.models import User

        value = (value or "").strip().lower()
        if value:
            taken = User.objects.filter(email__iexact=value)
            if self.instance is not None and self.instance.user_id:
                taken = taken.exclude(pk=self.instance.user_id)
            if taken.exists():
                raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        # The e-mail is the student's sign-in address, so a new student must have one.
        if self.instance is None and not attrs.get("email"):
            raise serializers.ValidationError({"email": "Enter the student's email address."})
        if self.instance is not None and "email" in attrs and not attrs["email"] and self.instance.user_id:
            raise serializers.ValidationError({"email": "A student with an account must keep an email address."})
        return attrs

    def update(self, instance, validated_data):
        new_email = validated_data.get("email")
        student = super().update(instance, validated_data)
        # Keep the sign-in address in step with the student's email.
        if new_email and student.user_id and student.user.email.lower() != new_email:
            student.user.email = new_email
            student.user.save(update_fields=["email"])
        return student

    def validate_user(self, value):
        request = self.context["request"]
        if value is not None:
            if value.school_id != request.user.school_id:
                raise serializers.ValidationError("User must belong to your own school.")
            if hasattr(value, "student_profile"):
                raise serializers.ValidationError("This user already has a student profile.")
        return value
