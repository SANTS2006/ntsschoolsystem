from rest_framework import serializers

from .models import Record


class RecordSerializer(serializers.ModelSerializer):
    is_mine = serializers.SerializerMethodField()

    def get_is_mine(self, obj):
        from apps.common.ownership import is_mine_flag

        return is_mine_flag(self, obj, "created_by")

    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    class Meta:
        model = Record
        fields = [
            "id", "title", "category", "body", "file", "created_by", "created_by_name", "is_mine",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        body = attrs.get("body", getattr(self.instance, "body", ""))
        file = attrs.get("file", getattr(self.instance, "file", None))
        if not body and not file:
            raise serializers.ValidationError("Enter some text, attach a file, or both.")
        return attrs
