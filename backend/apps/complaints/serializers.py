from rest_framework import serializers

from .models import Complaint, ComplaintResponse
from apps.formoptions.fields import OptionLabelField, OptionValueField

from .rules import can_act_on_complaint


class ComplaintSerializer(serializers.ModelSerializer):
    category = OptionValueField("complaints.category", required=False, default="other")
    category_label = OptionLabelField("complaints.category", "category", read_only=True)
    submitted_by = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default=None)
    addressed_to_name = serializers.CharField(source="addressed_to.full_name", read_only=True, default=None)
    # Computed per viewer (see rules.can_act_on_complaint) — the client can't work this out itself
    # for an anonymous complaint, where the submitter's identity is masked.
    can_act = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = [
            "id", "submitted_by", "submitted_by_name", "category", "category_label", "subject", "description", "image",
            "priority", "status", "is_anonymous", "addressed_to", "addressed_to_name",
            "assigned_to", "assigned_to_name", "resolution_notes", "resolved_at",
            "created_at", "updated_at", "can_act",
        ]
        read_only_fields = [
            "id", "status", "assigned_to", "resolution_notes", "resolved_at", "created_at", "updated_at",
            "can_act",
        ]

    def validate_addressed_to(self, value):
        if value is None:
            return value
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Must belong to your own school.")
        return value

    def get_can_act(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and can_act_on_complaint(user, obj))

    def _identity_hidden(self, obj) -> bool:
        if not obj.is_anonymous:
            return False
        request = self.context.get("request")
        viewer = getattr(request, "user", None)
        # The submitter always sees their own identity on their own complaint; anyone else
        # (including staff) sees it masked — that's what "anonymous" means here.
        return not (viewer and viewer.id == obj.submitted_by_id)

    def get_submitted_by(self, obj):
        if self._identity_hidden(obj):
            return None
        return str(obj.submitted_by_id) if obj.submitted_by_id else None

    def get_submitted_by_name(self, obj):
        if self._identity_hidden(obj):
            return None
        return obj.submitted_by.full_name if obj.submitted_by_id else None


class ComplaintResponseSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)

    class Meta:
        model = ComplaintResponse
        fields = ["id", "complaint", "author", "author_name", "message", "created_at"]
        read_only_fields = ["id", "author", "created_at"]


class AssignComplaintSerializer(serializers.Serializer):
    assigned_to = serializers.UUIDField()


class ResolveComplaintSerializer(serializers.Serializer):
    resolution_notes = serializers.CharField(max_length=2000, allow_blank=True, required=False, default="")
