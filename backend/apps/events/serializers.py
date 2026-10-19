from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.common.audience import AudienceSerializerMixin
from apps.common.validators import validate_image_file, validate_video_file
from apps.formoptions.fields import OptionLabelField, OptionValueField

from .models import Event, EventMedia, EventRecipient, EventRegistration


class EventSerializer(AudienceSerializerMixin, serializers.ModelSerializer):
    category = OptionValueField("events.category", required=False, default="other")
    category_label = OptionLabelField("events.category", "category", read_only=True)
    target_class_name = serializers.CharField(source="target_class.name", read_only=True, default=None)
    target_section_name = serializers.SerializerMethodField()
    target_department_name = serializers.CharField(source="target_department.name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    registered_count = serializers.IntegerField(read_only=True)
    registration_state = serializers.CharField(read_only=True)
    registration_open = serializers.BooleanField(read_only=True)
    # True when the viewer created it — the only person offered Edit / Publish / Cancel / Delete.
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id", "title", "description", "image", "category", "category_label", "start_datetime", "end_datetime", "location",
            "capacity", "registered_count", "registration_closes_at", "registration_closed", "registration_state",
            "registration_open", "status", "target_type", "target_class", "target_class_name",
            "target_section", "target_section_name", "target_department", "target_department_name",
            "created_by", "created_by_name", "is_mine", "created_at", "updated_at",
            *AudienceSerializerMixin.AUDIENCE_FIELDS,
        ]
        read_only_fields = ["id", "status", "registration_closed", "created_by", "created_at", "updated_at"]

    def get_is_mine(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and (obj.created_by_id is None or obj.created_by_id == user.id))

    def get_target_section_name(self, obj):
        return str(obj.target_section) if obj.target_section_id else None

    def validate(self, attrs):
        attrs = self.validate_audience(attrs)
        # An event needs a cover image when it is created; an edit may keep the one it has.
        if self.instance is None and not attrs.get("image"):
            raise serializers.ValidationError({"image": "An image is required."})
        start = attrs.get("start_datetime", getattr(self.instance, "start_datetime", None))
        end = attrs.get("end_datetime", getattr(self.instance, "end_datetime", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_datetime": "Must be on or after the start date/time."})
        closes = attrs.get("registration_closes_at", getattr(self.instance, "registration_closes_at", None))
        if closes and end and closes > end:
            raise serializers.ValidationError({"registration_closes_at": "Registration must close on or before the event ends."})
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


class EventRecipientSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = EventRecipient
        fields = ["id", "event", "user", "user_name"]
        read_only_fields = ["id"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_event(self, value):
        return self._same_school(value, "Event")

    def validate_user(self, value):
        return self._same_school(value, "User")


class EventRegistrationSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)

    class Meta:
        model = EventRegistration
        fields = ["id", "event", "event_title", "user", "user_name", "status", "registered_at"]
        read_only_fields = fields


class EventMediaSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)

    class Meta:
        model = EventMedia
        fields = [
            "id", "event", "event_title", "media_type", "file", "caption",
            "uploaded_by", "uploaded_by_name", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at", "updated_at"]

    def validate_event(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Event must belong to your own school.")
        return value

    def validate(self, attrs):
        media_type = attrs.get("media_type", getattr(self.instance, "media_type", None))
        file = attrs.get("file", getattr(self.instance, "file", None))
        if file:
            validator = validate_video_file if media_type == EventMedia.MediaType.VIDEO else validate_image_file
            try:
                validator(file)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"file": exc.messages})
        return attrs
