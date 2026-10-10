from rest_framework import serializers

from .models import IdCard
from .services import verify_url


class IdCardSerializer(serializers.ModelSerializer):
    holder_id = serializers.SerializerMethodField()
    holder_name = serializers.CharField(source="payload.name", read_only=True)
    photo = serializers.SerializerMethodField()
    verify_url = serializers.SerializerMethodField()
    is_valid = serializers.BooleanField(read_only=True)
    school_name = serializers.CharField(source="school.name", read_only=True)
    school_logo = serializers.SerializerMethodField()

    class Meta:
        model = IdCard
        fields = [
            "id", "holder_type", "holder_id", "holder_name", "card_number", "status", "is_valid",
            "issued_at", "expires_at", "payload", "qr_svg", "photo", "verify_url",
            "school_name", "school_logo",
        ]
        read_only_fields = fields

    def get_holder_id(self, obj):
        return str(obj.student_id or obj.staff_id)

    def get_photo(self, obj):
        holder = obj.holder
        try:
            return holder.photo.url if holder is not None and holder.photo else ""
        except Exception:  # noqa: BLE001 - a missing file shouldn't 500 the whole list
            return ""

    def get_verify_url(self, obj):
        return verify_url(obj.verify_token, self.context.get("request"))

    def get_school_logo(self, obj):
        school = obj.school
        if school.logo_url:
            return school.logo_url
        try:
            return school.logo.url if school.logo else ""
        except Exception:  # noqa: BLE001
            return ""


class IssueCardSerializer(serializers.Serializer):
    holder_type = serializers.ChoiceField(choices=IdCard.HolderType.choices)
    holder_id = serializers.UUIDField()
    expires_at = serializers.DateField(required=False, allow_null=True)


class BulkIssueSerializer(serializers.Serializer):
    holder_type = serializers.ChoiceField(choices=IdCard.HolderType.choices)
    school_class = serializers.UUIDField(required=False, allow_null=True)


class PublicVerificationSerializer(serializers.Serializer):
    valid = serializers.BooleanField()
    status = serializers.CharField()
    reason = serializers.CharField(allow_blank=True)
    holder_type = serializers.CharField()
    name = serializers.CharField()
    role = serializers.CharField(allow_blank=True)
    number = serializers.CharField(allow_blank=True)
    card_number = serializers.CharField()
    school_name = serializers.CharField()
    expires_at = serializers.DateField(allow_null=True)
    photo = serializers.CharField(allow_blank=True)
