"""Students handing in files for an assessment, and everything around it: who may upload and until when, what the
teacher sees, and the in-app + email reminders as a deadline approaches."""

import logging
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape
from rest_framework import status
from rest_framework.response import Response

from apps.common.background import run_in_background
from apps.common.validators import validate_upload_file
from apps.common.views import TenantScopedAPIView
from apps.notifications.services import notify

from .models import Assessment, AssessmentFile, AssessmentUploadReminder, StudentSubjectEnrollment, SubjectOffering

logger = logging.getLogger("apps")

MAX_FILES_PER_STUDENT = 5

# How long before the deadline a reminder goes to students who haven't handed anything in. If an assessment is created
# or its deadline moved so that several are already due, only the nearest one is actually sent.
REMINDER_WINDOWS = {"48h": timedelta(hours=48), "24h": timedelta(hours=24), "6h": timedelta(hours=6), "1h": timedelta(hours=1)}


# ---- the rules -------------------------------------------------------------------------------------


def upload_state(assessment: Assessment, now=None) -> str:
    """'off' (this assessment takes no uploads), 'open' (students may upload now) or 'closed' (the deadline has passed,
    or the CA has been locked)."""
    now = now or timezone.now()
    if not assessment.allow_file_uploads or assessment.status != Assessment.Status.ACTIVE:
        return "off"
    if assessment.subject_offering.ca_status == SubjectOffering.CAStatus.CLOSED:
        return "closed"
    if assessment.upload_deadline is not None and now > assessment.upload_deadline:
        return "closed"
    return "open"


def format_deadline(assessment: Assessment) -> str:
    """The deadline in the school's own time zone, e.g. 'Fri 12 Dec 2026, 5:00 PM GMT' — for emails and notifications,
    which have no browser to localise them."""
    deadline = assessment.upload_deadline
    if deadline is None:
        return ""
    try:
        local = deadline.astimezone(ZoneInfo(assessment.school.timezone or "UTC"))
    except Exception:  # noqa: BLE001 - an unknown zone name falls back to UTC rather than failing a notification
        local = deadline.astimezone(ZoneInfo("UTC"))
    return local.strftime("%a %d %b %Y, %I:%M %p %Z").replace(" 0", " ", 1)


def _link(assessment: Assessment) -> str:
    return f"/my-subjects/{assessment.subject_offering_id}/ca"


def file_payload(file: AssessmentFile) -> dict:
    return {
        "id": str(file.id),
        "name": file.original_name,
        "url": file.file.url if file.file else "",
        "size_bytes": file.size_bytes,
        "uploaded_at": file.created_at.isoformat(),
    }


def student_view(assessment: Assessment, files) -> dict:
    """What a student sees about an assessment's upload slot."""
    state = upload_state(assessment)
    return {
        "allow_file_uploads": assessment.allow_file_uploads,
        "upload_state": state,
        "upload_deadline": assessment.upload_deadline.isoformat() if assessment.upload_deadline else None,
        "upload_deadline_text": format_deadline(assessment),
        "upload_instructions": assessment.upload_instructions,
        "max_files": MAX_FILES_PER_STUDENT,
        "my_files": [file_payload(f) for f in files],
    }


def teacher_view(assessment: Assessment) -> dict:
    """Every enrolled student's hand-in for the teacher: their files and where their marking stands."""
    from .models import AssessmentScore

    enrollments = StudentSubjectEnrollment.objects.filter(subject_offering=assessment.subject_offering).select_related("student")
    files_by_student: dict = {}
    for f in assessment.files.all():
        files_by_student.setdefault(f.student_id, []).append(f)
    scores = {s.student_id: s for s in AssessmentScore.objects.filter(assessment=assessment)}
    rows = []
    for enrollment in enrollments:
        student = enrollment.student
        files = files_by_student.get(student.id, [])
        score = scores.get(student.id)
        rows.append(
            {
                "student": str(student.id),
                "student_name": student.full_name,
                "student_admission_number": student.admission_number,
                "files": [file_payload(f) for f in files],
                "submitted_at": files[-1].created_at.isoformat() if files else None,
                "raw_score": str(score.raw_score) if score and score.raw_score is not None else None,
                "score_status": score.status if score else None,
            }
        )
    rows.sort(key=lambda r: (not r["files"], r["student_name"]))
    return {
        "assessment": str(assessment.id),
        "name": assessment.name,
        "max_score": str(assessment.max_score),
        "allow_file_uploads": assessment.allow_file_uploads,
        "upload_state": upload_state(assessment),
        "upload_deadline": assessment.upload_deadline.isoformat() if assessment.upload_deadline else None,
        "rows": rows,
        "submitted_count": sum(1 for r in rows if r["files"]),
        "student_count": len(rows),
    }


# ---- student endpoints -----------------------------------------------------------------------------


def _error(message, code, http_status):
    return Response(
        {"success": False, "message": message, "code": code, "errors": [{"field": None, "message": message}]},
        status=http_status,
    )


class MyAssessmentFilesView(TenantScopedAPIView):
    """POST /academics/my-assessment-files/ — multipart `assessment` + `file`. A student hands in one file."""

    def post(self, request):
        student = getattr(request.user, "student_profile", None)
        if student is None:
            return _error("Only students can hand in work.", "FORBIDDEN", status.HTTP_403_FORBIDDEN)
        upload = request.FILES.get("file")
        if upload is None:
            return _error("Choose a file to upload.", "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)
        try:
            validate_upload_file(upload)
        except DjangoValidationError as exc:
            return _error(" ".join(exc.messages), "VALIDATION_ERROR", status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # Locking the assessment row makes the "at most N files" check and the deadline check race-free: two
            # simultaneous uploads (or one landing at the deadline) are decided one after the other.
            assessment = (
                Assessment.unscoped_objects.select_for_update()
                .select_related("subject_offering", "school")
                .filter(pk=str(request.data.get("assessment", "")), school_id=student.school_id)
                .first()
            )
            enrolled = assessment is not None and StudentSubjectEnrollment.objects.filter(
                subject_offering=assessment.subject_offering, student=student
            ).exists()
            if not enrolled:
                return _error("Assessment not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)

            state = upload_state(assessment)
            if state == "off":
                return _error("This assessment doesn't take file uploads.", "UPLOADS_OFF", status.HTTP_403_FORBIDDEN)
            if state == "closed":
                when = format_deadline(assessment)
                message = f"Uploads for {assessment.name} closed" + (f" on {when}." if when else ".")
                return _error(message + " Ask your teacher if you need more time.", "UPLOADS_CLOSED", status.HTTP_403_FORBIDDEN)
            if AssessmentFile.objects.filter(assessment=assessment, student=student).count() >= MAX_FILES_PER_STUDENT:
                return _error(
                    f"You can upload up to {MAX_FILES_PER_STUDENT} files. Remove one to add another.",
                    "TOO_MANY_FILES",
                    status.HTTP_400_BAD_REQUEST,
                )
            record = AssessmentFile.objects.create(
                school=assessment.school,
                assessment=assessment,
                student=student,
                file=upload,
                original_name=(upload.name or "file")[:255],
                size_bytes=upload.size,
            )
        return Response(
            {"success": True, "message": "File uploaded.", "code": "OK", "errors": [], "file": file_payload(record)},
            status=status.HTTP_201_CREATED,
        )


class MyAssessmentFileDetailView(TenantScopedAPIView):
    """DELETE /academics/my-assessment-files/<id>/ — a student removes one of their own files, while uploads are open."""

    def delete(self, request, pk):
        student = getattr(request.user, "student_profile", None)
        record = (
            AssessmentFile.objects.select_related("assessment__subject_offering", "assessment__school")
            .filter(pk=pk, student=student)
            .first()
            if student is not None
            else None
        )
        if record is None:
            return _error("File not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        if upload_state(record.assessment) != "open":
            return _error("Uploads for this assessment are closed, so your files can no longer be changed.", "UPLOADS_CLOSED", status.HTTP_403_FORBIDDEN)
        record.delete()
        return Response({"success": True, "message": "File removed.", "code": "OK", "errors": []})


# ---- notifications ---------------------------------------------------------------------------------


def _students_to_notify(assessment: Assessment, *, only_without_files: bool):
    # Runs from cron / a background thread, where there is no current school: filter by school explicitly.
    enrolled = StudentSubjectEnrollment.unscoped_objects.filter(
        school_id=assessment.school_id, subject_offering=assessment.subject_offering, student__user__isnull=False
    ).select_related("student__user")
    handed_in = set(
        AssessmentFile.unscoped_objects.filter(school_id=assessment.school_id, assessment=assessment).values_list("student_id", flat=True)
    )
    for enrollment in enrolled:
        if only_without_files and enrollment.student_id in handed_in:
            continue
        yield enrollment.student.user


def _announce(assessment: Assessment, title: str, lead: str, *, only_without_files: bool) -> int:
    subject = assessment.subject_offering.subject.name
    deadline = format_deadline(assessment)
    when = f" Deadline: <strong>{escape(deadline)}</strong>." if deadline else ""
    instructions = f"<p>{escape(assessment.upload_instructions)}</p>" if assessment.upload_instructions else ""
    sent = 0
    for user in _students_to_notify(assessment, only_without_files=only_without_files):
        try:
            notify(
                recipient=user,
                category="assessment",
                title=title,
                message=f"{subject} — {assessment.name}" + (f" · by {deadline}" if deadline else ""),
                link=_link(assessment),
                email_subject=title,
                email_html=f"<p>{escape(lead)} <strong>{escape(assessment.name)}</strong> ({escape(subject)}).{when}</p>{instructions}"
                "<p>Sign in and open the subject's CA page to upload your files.</p>",
            )
            sent += 1
        except Exception:  # noqa: BLE001 - one bad address must not stop the rest
            logger.error("Could not notify student %s about %s", user.pk, assessment.pk, exc_info=True)
    return sent


def announce_upload_window(assessment_id, event: str) -> int:
    """Tells enrolled students that uploads have opened or the deadline has changed. Runs in the background."""
    assessment = Assessment.unscoped_objects.select_related("subject_offering__subject", "school").filter(pk=assessment_id).first()
    if assessment is None or upload_state(assessment) != "open":
        return 0
    if event == "opened":
        title, lead = f"Upload your work: {assessment.name}", "You can now upload your files for"
    else:
        title, lead = f"New upload deadline: {assessment.name}", "The deadline for uploading your files for"
    return _announce(assessment, title, lead, only_without_files=(event != "opened"))


def schedule_announcement(assessment: Assessment, event: str) -> None:
    run_in_background("assessment upload announcement", announce_upload_window, str(assessment.pk), event)


def send_due_reminders(now=None) -> int:
    """For every assessment whose upload deadline is near: remind the students who haven't handed anything in. Each
    window (48h, 24h, 6h, 1h before) fires once per deadline; safe to run as often as you like, from any instance."""
    now = now or timezone.now()
    horizon = now + max(REMINDER_WINDOWS.values())
    sent_total = 0
    assessments = Assessment.unscoped_objects.select_related("subject_offering__subject", "school").filter(
        allow_file_uploads=True,
        status=Assessment.Status.ACTIVE,
        upload_deadline__gt=now,
        upload_deadline__lte=horizon,
    )
    for assessment in assessments:
        if upload_state(assessment, now) != "open":
            continue
        due = [name for name, span in REMINDER_WINDOWS.items() if now >= assessment.upload_deadline - span]
        if not due:
            continue
        newly: list[str] = []
        for name in due:
            _, created = AssessmentUploadReminder.unscoped_objects.get_or_create(
                assessment=assessment, window=name, deadline=assessment.upload_deadline, defaults={"school": assessment.school}
            )
            if created:
                newly.append(name)
        if not newly:
            continue
        # Several may fall due at once (a deadline set for tomorrow): send just the nearest.
        nearest = min(newly, key=lambda n: REMINDER_WINDOWS[n])
        hours_left = max(1, round((assessment.upload_deadline - now).total_seconds() / 3600))
        remaining = f"{hours_left} hour{'s' if hours_left != 1 else ''}"
        sent_total += _announce(
            assessment,
            f"Upload closes in about {remaining}: {assessment.name}",
            f"Uploads close in about {remaining} for",
            only_without_files=True,
        )
        logger.info("Upload reminder %s sent for assessment %s", nearest, assessment.pk)
    return sent_total


def trigger_reminders_from_traffic() -> None:
    """Called from ordinary requests (the sign-in heartbeat), at most once every few minutes per process: sends any
    reminders that have come due. The dependable driver is `manage.py send_upload_reminders` on a cron."""
    from django.core.cache import cache

    if not getattr(settings, "UPLOAD_REMINDERS_AUTO_TRIGGER", True) or not cache.add("uploads:reminders", 1, 300):
        return
    run_in_background("assessment upload reminders", send_due_reminders)
