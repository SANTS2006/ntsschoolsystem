from rest_framework import serializers

from apps.common.audience import AudienceSerializerMixin

from .models import Announcement, AnnouncementRecipient


class AnnouncementSerializer(AudienceSerializerMixin, serializers.ModelSerializer):
    target_class_name = serializers.CharField(source="target_class.name", read_only=True, default=None)
    target_section_name = serializers.SerializerMethodField()
    target_department_name = serializers.CharField(source="target_department.name", read_only=True, default=None)
    published_by_name = serializers.CharField(source="published_by.full_name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    # True when the viewer created it — the only person offered Edit / Delete / Publish.
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            "id", "title", "body", "image", "target_type", "target_class", "target_class_name",
            "target_section", "target_section_name", "target_department", "target_department_name",
            "send_email", "created_by", "created_by_name", "is_mine", "published_by", "published_by_name",
            "published_at", "is_active",
            "created_at", "updated_at",
            *AudienceSerializerMixin.AUDIENCE_FIELDS,
        ]
        read_only_fields = ["id", "created_by", "published_by", "published_at", "created_at", "updated_at"]

    def get_target_section_name(self, obj):
        return str(obj.target_section) if obj.target_section_id else None

    def get_is_mine(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        # No recorded creator = legacy row, open to anyone with the permission (see CreatorOnlyActionsMixin).
        return bool(user and user.is_authenticated and (obj.created_by_id is None or obj.created_by_id == user.id))

    def validate(self, attrs):
        attrs = self.validate_audience(attrs)
        # An announcement needs an image when it is created; an edit may keep the one it has.
        if self.instance is None and not attrs.get("image"):
            raise serializers.ValidationError({"image": "An image is required."})
        return attrs

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_target_class(self, value):
        return self._same_school(value, "Class")

    def validate_target_section(self, value):
        return self._same_school(value, "Section")

    def validate_target_department(self, value):
        return self._same_school(value, "Department")


class AnnouncementRecipientSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = AnnouncementRecipient
        fields = ["id", "announcement", "user", "user_name"]
        read_only_fields = ["id"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_announcement(self, value):
        return self._same_school(value, "Announcement")

    def validate_user(self, value):
        return self._same_school(value, "User")
