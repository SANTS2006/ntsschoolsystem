from django.utils.text import slugify
from rest_framework import serializers

from .models import Permission, Role


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "name", "module", "description"]
        read_only_fields = ["id"]

    def validate_code(self, value):
        qs = Permission.objects.filter(code__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A permission with this code already exists.")
        return value


class RoleSerializer(serializers.ModelSerializer):
    permission_codes = serializers.SerializerMethodField()
    user_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "name", "slug", "description", "is_system", "is_active", "permission_codes", "user_count"]
        read_only_fields = ["id", "slug", "is_system", "permission_codes", "user_count"]

    def get_user_count(self, role):
        return role.user_roles.count()

    def get_permission_codes(self, role):
        return sorted(role.permissions.values_list("code", flat=True))

    def validate_name(self, value):
        slug = slugify(value)
        qs = Role.objects.filter(slug=slug)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A role with this name already exists.")
        return value

    def create(self, validated_data):
        validated_data["slug"] = slugify(validated_data["name"])
        validated_data["is_system"] = False
        return super().create(validated_data)
