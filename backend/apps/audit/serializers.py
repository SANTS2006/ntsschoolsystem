from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            "id", "school", "actor_email", "action", "entity_type", "entity_id",
            "severity", "before", "after", "metadata", "ip_address", "created_at",
        ]
        read_only_fields = fields
