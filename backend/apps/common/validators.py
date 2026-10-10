import os

from django.core.exceptions import ValidationError

# Deliberately excludes executables/scripts (.exe, .sh, .js, .php, ...) — spec
# section 29: "restrict dangerous file types", "never trust a client-supplied
# extension" (this is a whitelist, not a blacklist, for exactly that reason).
ALLOWED_UPLOAD_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".txt", ".csv", ".jpg", ".jpeg", ".png", ".gif", ".zip",
}
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

# Narrower allowlist for fields that are always a photo (student/staff portraits, ...) —
# a document allowlist would let someone attach a PDF where an <img> is about to render it.
IMAGE_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

# For lesson materials and event media that are video — a much larger cap than any other
# upload in this app, since a short lesson recording or event clip is naturally much bigger
# than a document or photo. Named generically (not "lesson_video") since Event media reuses it.
VIDEO_UPLOAD_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi"}
MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024  # 200 MB


# The extension allowlist alone can be defeated by renaming: an attacker uploads a script or
# executable called "report.pdf". These are the first bytes of the file types that must never be
# accepted no matter what the file is called — Windows/Linux/macOS executables, shell scripts,
# and HTML/SVG/PHP that a browser or server could execute or render as a page.
_FORBIDDEN_SIGNATURES = (
    b"MZ",  # Windows PE (.exe/.dll)
    bytes.fromhex("7f454c46"),  # ELF (Linux executable)
    bytes.fromhex("cafebabe"),  # Mach-O universal / Java class
    bytes.fromhex("feedfa"),  # Mach-O
    bytes.fromhex("cffaedfe"),  # Mach-O 64
    b"#!",  # shell/interpreter script
    b"<?php",
    b"<%",  # ASP/JSP
)
_FORBIDDEN_MARKUP = (b"<script", b"<html", b"<!doctype html", b"<svg", b"<iframe", b"<?xml")


def _reject_disguised_content(file):
    """Sniff the leading bytes (not the filename) and refuse executables/scripts/markup."""
    position = file.tell() if hasattr(file, "tell") else 0
    head = file.read(1024)
    file.seek(position)
    if not isinstance(head, (bytes, bytearray)):
        return
    lowered = bytes(head).lstrip().lower()
    if any(bytes(head).startswith(sig) for sig in _FORBIDDEN_SIGNATURES) or any(
        lowered.startswith(marker) for marker in _FORBIDDEN_MARKUP
    ):
        raise ValidationError("This file's contents are not allowed.")


def validate_upload_file(file):
    """
    Extension allowlist + size cap for any user-uploaded attachment.
    Deliberately checks only the extension, not content-sniffing the MIME
    type byte-for-byte — Cloudinary itself re-validates and transforms
    anything it stores, so this is a first line of defense against the
    obviously-wrong case, not the only one.
    """
    _reject_disguised_content(file)
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValidationError(f"File type '{ext}' is not allowed.")
    if file.size > MAX_UPLOAD_SIZE_BYTES:
        raise ValidationError(
            f"File exceeds the maximum allowed size of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB."
        )


def validate_image_file(file):
    """Same shape as validate_upload_file, narrowed to actual image extensions and a
    smaller size cap — for fields that are always rendered as a photo, never a document."""
    _reject_disguised_content(file)
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in IMAGE_UPLOAD_EXTENSIONS:
        raise ValidationError(f"File type '{ext}' is not allowed. Upload an image (jpg, png, gif, webp).")
    if file.size > MAX_IMAGE_SIZE_BYTES:
        raise ValidationError(
            f"Image exceeds the maximum allowed size of {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB."
        )


def validate_video_file(file):
    """Same shape as validate_upload_file, narrowed to video extensions with a much larger
    size cap. Storage is Cloudinary's raw resource type (no transcoding/thumbnailing) — a
    plain <video> tag pointed at the stored URL plays it as-is."""
    _reject_disguised_content(file)
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in VIDEO_UPLOAD_EXTENSIONS:
        raise ValidationError(f"File type '{ext}' is not allowed. Upload a video (mp4, mov, webm, avi).")
    if file.size > MAX_VIDEO_SIZE_BYTES:
        raise ValidationError(
            f"Video exceeds the maximum allowed size of {MAX_VIDEO_SIZE_BYTES // (1024 * 1024)}MB."
        )
