from django.utils import timezone
from rest_framework import serializers

from .models import Meeting, MeetingInvitee
from .services import audience_label


class InviteeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeetingInvitee
        fields = ["id", "kind", "name", "email", "email_status", "emailed_at"]
        read_only_fields = fields


class MeetingSerializer(serializers.ModelSerializer):
    is_mine = serializers.SerializerMethodField()

    def get_is_mine(self, obj):
        from apps.common.ownership import is_mine_flag

        return is_mine_flag(self, obj, "host")

    host_name = serializers.SerializerMethodField()
    audience = serializers.SerializerMethodField()
    invitee_counts = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id", "title", "agenda", "scheduled_start", "duration_minutes", "host_name", "status",
            "include_all_staff", "include_all_parents", "include_all_students", "audience",
            "invitee_counts", "started_at", "ended_at", "created_at", "is_mine",
        ]
        read_only_fields = fields

    def get_host_name(self, obj):
        return obj.host.full_name if obj.host else ""

    def get_audience(self, obj):
        return audience_label(obj)

    def get_invitee_counts(self, obj):
        counts = {"total": 0, "sent": 0, "pending": 0, "failed": 0, "no_email": 0}
        for invitee in obj.invitees.all():
            counts["total"] += 1
            counts[invitee.email_status] += 1
        return counts


class MeetingDetailSerializer(MeetingSerializer):
    invitees = InviteeSerializer(many=True, read_only=True)

    class Meta(MeetingSerializer.Meta):
        fields = MeetingSerializer.Meta.fields + ["invitees"]
        read_only_fields = fields


class MeetingCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    agenda = serializers.CharField(required=False, allow_blank=True, default="")
    scheduled_start = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=5, max_value=480, default=60)
    include_all_staff = serializers.BooleanField(default=False)
    include_all_parents = serializers.BooleanField(default=False)
    include_all_students = serializers.BooleanField(default=False)
    staff_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    guardian_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    student_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)

    def validate_scheduled_start(self, value):
        if value < timezone.now() - timezone.timedelta(minutes=5):
            raise serializers.ValidationError("The meeting can't start in the past.")
        return value


class AudiencePreviewSerializer(serializers.Serializer):
    include_all_staff = serializers.BooleanField(default=False)
    include_all_parents = serializers.BooleanField(default=False)
    include_all_students = serializers.BooleanField(default=False)
    staff_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    guardian_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    student_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
