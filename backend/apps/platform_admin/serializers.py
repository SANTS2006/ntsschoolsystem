from rest_framework import serializers

from apps.users.models import User


class PlatformAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "full_name", "is_active", "created_at"]
        read_only_fields = fields


class InvitePlatformAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value


class MaintenanceUpdateSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    message = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    all_pages = serializers.BooleanField(default=True)
    pages = serializers.ListField(child=serializers.CharField(max_length=100), required=False, default=list, max_length=60)
    notify = serializers.BooleanField(required=False, default=False)

    def validate_pages(self, value):
        cleaned = []
        for page in value:
            page = page.strip()
            if not page.startswith("/") or ".." in page or " " in page:
                raise serializers.ValidationError(f"“{page}” isn't a valid page address.")
            cleaned.append(page)
        return cleaned

    def validate(self, attrs):
        if attrs["enabled"] and not attrs["all_pages"] and not attrs["pages"]:
            raise serializers.ValidationError("Choose at least one page, or show the message on all pages.")
        return attrs
