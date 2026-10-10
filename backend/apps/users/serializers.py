from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "first_name", "last_name", "full_name", "phone_number", "photo",
            "user_type", "is_active", "email_verified_at", "created_at", "roles",
        ]
        read_only_fields = ["id", "user_type", "is_active", "email_verified_at", "created_at"]

    def get_roles(self, user):
        return [
            {"id": ur.role_id, "name": ur.role.name, "slug": ur.role.slug}
            for ur in user.user_roles.select_related("role")
        ]


class InviteUserSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    role_id = serializers.UUIDField(required=False)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value
