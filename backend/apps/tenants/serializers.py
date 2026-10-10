from decimal import Decimal

from rest_framework import serializers

from .models import School
from .reserved import validate_school_slug


class SchoolAdminSerializer(serializers.ModelSerializer):
    """Full view for platform admins — every field, most read-only via dedicated actions."""

    class Meta:
        model = School
        fields = [
            "id", "name", "slug", "motto", "logo_url", "logo", "primary_color", "secondary_color",
            "email", "phone_number", "website",
            "country", "region", "city", "address", "school_type", "ownership_type",
            "currency", "timezone", "status", "suspended_reason", "settings",
            "promotion_threshold_percent", "grade_point_scale", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "suspended_reason", "created_at", "updated_at"]

    def validate_slug(self, value):
        return validate_school_slug(value)

    def validate_promotion_threshold_percent(self, value):
        if not 0 <= value <= 100:
            raise serializers.ValidationError("Promotion threshold must be between 0 and 100.")
        return value

    def validate_grade_point_scale(self, value):
        if value not in (Decimal("4"), Decimal("5")):
            raise serializers.ValidationError("The highest grade points must be 4.00 or 5.00.")
        return value


class SchoolCreateSerializer(serializers.ModelSerializer):
    admin_email = serializers.EmailField(write_only=True)
    admin_first_name = serializers.CharField(write_only=True, max_length=150)
    admin_last_name = serializers.CharField(write_only=True, max_length=150)

    class Meta:
        model = School
        fields = [
            "name", "slug", "motto", "logo", "primary_color", "secondary_color",
            "email", "phone_number", "website",
            "country", "region", "city", "address", "school_type", "ownership_type",
            "currency", "timezone",
            "admin_email", "admin_first_name", "admin_last_name",
        ]

    def validate_slug(self, value):
        validate_school_slug(value)
        if School.objects.filter(slug=value).exists():
            raise serializers.ValidationError("A school with this slug already exists.")
        return value


class SchoolSelfSerializer(serializers.ModelSerializer):
    """Restricted view/update for a school's own users — no slug/status/classification changes."""

    class Meta:
        model = School
        fields = [
            "id", "name", "slug", "motto", "logo_url", "logo", "primary_color", "secondary_color",
            "email", "phone_number", "website",
            "country", "region", "city", "address", "currency", "timezone", "settings",
            "status", "school_type", "ownership_type", "promotion_threshold_percent", "grade_point_scale",
        ]
        read_only_fields = ["id", "slug", "status", "school_type", "ownership_type", "primary_color", "secondary_color"]

    def validate_promotion_threshold_percent(self, value):
        if not 0 <= value <= 100:
            raise serializers.ValidationError("Promotion threshold must be between 0 and 100.")
        return value

    def validate_grade_point_scale(self, value):
        if value not in (Decimal("4"), Decimal("5")):
            raise serializers.ValidationError("The highest grade points must be 4.00 or 5.00.")
        return value


class SuspendSchoolSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")


class SchoolBrandingSerializer(serializers.ModelSerializer):
    """Deliberately the narrowest possible view of a School — this is the only serializer in the
    app served to a completely unauthenticated request (the branded-login page, before anyone has
    signed in). Must never grow beyond name/logo/slug; use SchoolSelfSerializer/SchoolAdminSerializer
    for anything that needs auth anyway. Colours are public by nature — they style the login page."""

    class Meta:
        model = School
        fields = ["name", "slug", "logo", "logo_url", "primary_color", "secondary_color"]


class SchoolSearchResultSerializer(serializers.ModelSerializer):
    """Same narrow-fields discipline as SchoolBrandingSerializer, for the "find your school"
    search on the generic login page."""

    class Meta:
        model = School
        fields = ["name", "slug", "logo", "logo_url"]
