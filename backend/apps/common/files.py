"""Authenticated file proxy for stored uploads that Cloudinary won't hand out publicly.

Cloudinary refuses to deliver PDF and ZIP files from their normal public URL (HTTP 401) unless the
account's "allow delivery of PDF and ZIP files" security setting is on. The same file *can* be fetched
with a signed API download link, so this view does that server-side and streams the bytes back to a
signed-in user. The in-app file viewer and the Download buttons use it for those file types."""

import mimetypes
import re
from urllib.parse import unquote

import cloudinary
import cloudinary.utils
import requests
from django.conf import settings
from django.http import StreamingHttpResponse
from django.utils.http import content_disposition_header
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

_CLOUDINARY_URL = re.compile(
    r"^https://res\.cloudinary\.com/(?P<cloud>[^/]+)/(?P<rtype>raw|image|video)/upload/(?:v\d+/)?(?P<public_id>[^?#]+)"
)
_CHUNK = 64 * 1024


def _error(message: str, code: str, http_status: int) -> Response:
    return Response(
        {"success": False, "message": message, "code": code, "errors": [{"field": None, "message": message}]},
        status=http_status,
    )


class StoredFileView(APIView):
    """GET /api/v1/files/?url=<stored file url>[&download=1][&name=<file name>]"""

    def get(self, request):
        match = _CLOUDINARY_URL.match(request.query_params.get("url", ""))
        configured = settings.CLOUDINARY_STORAGE.get("CLOUD_NAME")
        # Only this project's own Cloudinary uploads — never an arbitrary address (that would make
        # this endpoint a way to make the server fetch anything).
        if not match or not configured or match.group("cloud") != configured:
            return _error("That isn't a file stored by this system.", "INVALID_FILE_URL", status.HTTP_400_BAD_REQUEST)

        resource_type = match.group("rtype")
        public_id = unquote(match.group("public_id"))
        file_format = ""
        if resource_type != "raw" and "." in public_id:
            public_id, file_format = public_id.rsplit(".", 1)

        cloudinary.config(
            cloud_name=configured,
            api_key=settings.CLOUDINARY_STORAGE["API_KEY"],
            api_secret=settings.CLOUDINARY_STORAGE["API_SECRET"],
            secure=True,
        )
        link = cloudinary.utils.private_download_url(
            public_id, file_format, resource_type=resource_type, type="upload"
        )
        try:
            upstream = requests.get(link, stream=True, timeout=30)
        except requests.RequestException:
            return _error("The file could not be fetched right now.", "FILE_UNAVAILABLE", status.HTTP_502_BAD_GATEWAY)
        if upstream.status_code != 200:
            upstream.close()
            code = status.HTTP_404_NOT_FOUND if upstream.status_code == 404 else status.HTTP_502_BAD_GATEWAY
            return _error("That file could not be found.", "FILE_UNAVAILABLE", code)

        stored_name = public_id.rsplit("/", 1)[-1] + (f".{file_format}" if file_format else "")
        name = (request.query_params.get("name") or stored_name).replace("/", "_").replace("\\", "_")[:150]
        content_type = (
            mimetypes.guess_type(stored_name)[0] or upstream.headers.get("Content-Type") or "application/octet-stream"
        )
        response = StreamingHttpResponse(upstream.iter_content(_CHUNK), content_type=content_type)
        as_attachment = request.query_params.get("download") in {"1", "true"}
        response["Content-Disposition"] = content_disposition_header(as_attachment, name)
        if upstream.headers.get("Content-Length"):
            response["Content-Length"] = upstream.headers["Content-Length"]
        response["Cache-Control"] = "private, max-age=300"
        response["X-Content-Type-Options"] = "nosniff"
        return response
