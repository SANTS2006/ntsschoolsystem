from rest_framework import serializers

from apps.authorization.permissions import IsPlatformAdmin
from apps.common.views import TenantScopedModelViewSet

from .models import Enquiry


class EnquiryAdminSerializer(serializers.ModelSerializer):
    """What the platform console shows. Only `handled` can be changed; everything else is exactly what was submitted."""

    class Meta:
        model = Enquiry
        fields = [
            "id", "kind", "name", "email", "phone", "organization", "school_type", "student_count", "interests",
            "preferred_contact", "topic", "message", "handled", "email_status", "created_at",
        ]
        read_only_fields = [f for f in fields if f != "handled"]


class EnquiryAdminViewSet(TenantScopedModelViewSet):
    """GET /api/v1/platform/enquiries/ and PATCH /<id>/ {"handled": true} — platform administrators only. The Django
    admin is not exposed in production, so this is how the NTS team reads what the website collected."""

    permission_classes = [IsPlatformAdmin]
    serializer_class = EnquiryAdminSerializer
    http_method_names = ["get", "patch", "head", "options"]
    search_fields = ["name", "email", "organization", "message"]
    filterset_fields = ["kind", "handled"]
    ordering_fields = ["created_at"]
    summary_stats = {
        "total": {},
        "waiting": {"handled": False},
        "demos": {"kind": "demo"},
    }

    def get_queryset(self):
        return Enquiry.objects.all().order_by("-created_at")
