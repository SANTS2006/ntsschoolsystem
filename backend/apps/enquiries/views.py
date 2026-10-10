import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.email import send_email
from apps.common.net import get_client_ip

from .email_template import enquiry_subject, render_enquiry_email
from .models import Enquiry
from .serializers import EnquirySerializer

logger = logging.getLogger("apps")


def _email_team(enquiry: Enquiry) -> str:
    """Tells the NTS team about the enquiry. Returns the resulting EmailStatus; never raises."""
    if not settings.BREVO_API_KEY or not settings.ENQUIRY_NOTIFY_EMAIL:
        return Enquiry.EmailStatus.NOT_CONFIGURED
    try:
        ok = send_email(
            to_email=settings.ENQUIRY_NOTIFY_EMAIL,
            to_name="NTS Digital Solutions",
            subject=enquiry_subject(enquiry),
            html_content=render_enquiry_email(enquiry),
            branded=False,
        )
    except Exception:  # noqa: BLE001 - the enquiry is already saved; a mail failure must not lose or hide it
        logger.exception("Could not e-mail website enquiry %s", enquiry.pk)
        return Enquiry.EmailStatus.FAILED
    return Enquiry.EmailStatus.SENT if ok else Enquiry.EmailStatus.FAILED


class PublicEnquiryView(APIView):
    """POST /api/v1/public/enquiries/ — a demo request or contact message from the public website.

    Anyone may call it (so it is rate limited and has a honeypot), nothing it returns depends on who asks, and the
    enquiry is saved *before* anything else happens: the success answer means "we have it", never merely "we tried"."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_scope = "public_enquiry"

    def post(self, request):
        serializer = EnquirySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if data.pop("website", ""):
            # A bot filled the hidden field. Answer as if it worked, store nothing.
            return Response(
                {"success": True, "message": "Thank you — we have your message.", "code": "OK", "errors": []},
                status=status.HTTP_201_CREATED,
            )
        enquiry = Enquiry.objects.create(**data, source_ip=get_client_ip(request)[:64])
        Enquiry.objects.filter(pk=enquiry.pk).update(email_status=_email_team(enquiry))
        return Response(
            {
                "success": True,
                "message": "Thank you — we have your message and will reply by e-mail or phone.",
                "code": "OK",
                "errors": [],
                "reference": str(enquiry.pk)[:8].upper(),
            },
            status=status.HTTP_201_CREATED,
        )
