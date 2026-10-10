from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.views import TenantScopedAPIView
from apps.tenants.services import get_current_school

from . import services
from .registry import FIELDS


class _AddOptionSerializer(serializers.Serializer):
    field = serializers.ChoiceField(choices=sorted(FIELDS))
    label = serializers.CharField(max_length=100)


class FormOptionsView(TenantScopedAPIView):
    """The school's own additions to a dropdown (GET) and adding one (POST). Open to any signed-in
    user: the dropdowns involved (complaint category, ...) are ones every kind of user fills in, and
    an added choice is just a label — the field it belongs to is checked against a fixed registry."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        field_key = request.query_params.get("field", "")
        if field_key not in FIELDS:
            return Response({"success": False, "message": "Unknown field.", "code": "VALIDATION_ERROR", "errors": []},
                            status=status.HTTP_400_BAD_REQUEST)
        options = services.custom_options(get_current_school(), field_key)
        return Response({"success": True, "message": "", "code": "OK", "errors": [],
                         "options": [{"value": o.value, "label": o.label} for o in options]})

    def post(self, request):
        serializer = _AddOptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            value, label = services.add_option(
                school=get_current_school(), field_key=serializer.validated_data["field"],
                label=serializer.validated_data["label"], user=request.user,
            )
        except services.FormOptionError as exc:
            return Response({"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": [str(exc)]},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({"success": True, "message": "", "code": "OK", "errors": [],
                         "option": {"value": value, "label": label}}, status=status.HTTP_201_CREATED)
