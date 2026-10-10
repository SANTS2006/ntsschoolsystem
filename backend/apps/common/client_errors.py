"""Where the web app reports crashes that happen in people's browsers (a page that threw, a script that failed to
load). They go to the server log with the request id, so a "blank page" report from a phone can be found and fixed.
Unauthenticated on purpose (the app may be too broken to send credentials), strictly size-limited and throttled, and
it only ever writes to the log — nothing is stored or executed."""

import logging

from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("apps.client")

KINDS = ["render", "chunk", "unhandled-rejection", "window-error", "api"]


class ClientErrorSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=KINDS)
    message = serializers.CharField(max_length=500, allow_blank=True)
    stack = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    component_stack = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    url = serializers.CharField(max_length=300, required=False, allow_blank=True)
    user_agent = serializers.CharField(max_length=300, required=False, allow_blank=True)


def _one_line(value: str) -> str:
    # Never let a report forge extra log lines.
    return " ".join((value or "").split())


class ClientErrorView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "client_errors"

    def post(self, request):
        serializer = ClientErrorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        logger.warning(
            "browser error kind=%s url=%s message=%s agent=%s stack=%s components=%s",
            data["kind"],
            _one_line(data.get("url", "")),
            _one_line(data["message"]),
            _one_line(data.get("user_agent", "")),
            _one_line(data.get("stack", ""))[:600],
            _one_line(data.get("component_stack", ""))[:600],
        )
        return Response({"success": True, "message": "Thanks.", "code": "OK", "errors": []}, status=status.HTTP_202_ACCEPTED)
