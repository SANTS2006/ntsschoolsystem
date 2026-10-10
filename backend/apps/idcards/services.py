import io
import secrets
from datetime import date, timedelta

import segno
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.services import log_action
from apps.common.email import frontend_base_url
from apps.staff.models import Staff
from apps.students.models import Student

from .models import IdCard

DEFAULT_VALIDITY_DAYS = 365
# No 0/O/1/I — card numbers get read aloud and typed by hand.
_CARD_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class IdCardError(Exception):
    pass


def _holder_fk(holder) -> dict:
    if isinstance(holder, Student):
        return {"holder_type": IdCard.HolderType.STUDENT, "student": holder}
    return {"holder_type": IdCard.HolderType.STAFF, "staff": holder}


def _iso(value) -> str:
    return value.isoformat() if value else ""


def build_payload(holder) -> dict:
    """The detail printed on the card face, frozen at issue time."""
    if isinstance(holder, Student):
        return {
            "name": holder.full_name,
            "number": holder.admission_number,
            "class": holder.current_class.name if holder.current_class_id else "",
            "section": holder.current_section.name if holder.current_section_id else "",
            "date_of_birth": _iso(holder.date_of_birth),
            "gender": holder.get_gender_display() if holder.gender else "",
            "role": "Student",
        }
    user = holder.user
    return {
        "name": user.full_name,
        "number": holder.staff_id,
        "job_title": holder.job_title,
        "department": holder.department.name if holder.department_id else "",
        "email": user.email,
        "phone": getattr(user, "phone_number", "") or "",
        "role": holder.job_title or "Staff",
    }


def _new_card_number(holder_type: str) -> str:
    prefix = "STU" if holder_type == IdCard.HolderType.STUDENT else "STF"
    return f"{prefix}-{''.join(secrets.choice(_CARD_NUMBER_ALPHABET) for _ in range(8))}"


def verify_url(token: str, request=None) -> str:
    return f"{frontend_base_url(request).rstrip('/')}/verify-card/{token}"


def render_qr_svg(url: str) -> str:
    buffer = io.BytesIO()
    segno.make(url, error="m").save(buffer, kind="svg", xmldecl=False, svgns=True, border=1, scale=4)
    return buffer.getvalue().decode()


def issue_card(holder, *, issued_by=None, expires_at: date | None = None, request=None) -> IdCard:
    """Issues a card for one student/staff member, replacing any card they already hold (the old
    one is kept for audit with status=replaced so a lost-and-found old card stops verifying).
    `expires_at` defaults to a year from today."""
    if isinstance(holder, Student) and holder.status in (Student.Status.ARCHIVED, Student.Status.WITHDRAWN):
        raise IdCardError("Cards can't be issued to a withdrawn or archived student.")
    if isinstance(holder, Staff) and holder.employment_status == Staff.EmploymentStatus.TERMINATED:
        raise IdCardError("Cards can't be issued to a terminated staff member.")

    fk = _holder_fk(holder)
    expires_at = expires_at or (timezone.localdate() + timedelta(days=DEFAULT_VALIDITY_DAYS))

    for _attempt in range(5):
        token = secrets.token_urlsafe(24)
        try:
            with transaction.atomic():
                IdCard.objects.filter(
                    school_id=holder.school_id, status=IdCard.Status.ACTIVE, **{k: v for k, v in fk.items() if k != "holder_type"}
                ).update(status=IdCard.Status.REPLACED)
                card = IdCard.objects.create(
                    school_id=holder.school_id,
                    card_number=_new_card_number(fk["holder_type"]),
                    verify_token=token,
                    payload=build_payload(holder),
                    qr_svg=render_qr_svg(verify_url(token, request)),
                    expires_at=expires_at,
                    issued_by=issued_by,
                    **fk,
                )
            log_action(
                action="idcards.card_issued", actor=issued_by, school=holder.school, entity_type="IdCard",
                entity_id=str(card.id), after={"card_number": card.card_number, "holder_type": card.holder_type},
            )
            return card
        except IntegrityError:
            continue  # a card_number/token collision — vanishingly rare; draw new ones
    raise IdCardError("Could not generate a unique card number. Please try again.")


def revoke_card(card: IdCard, *, actor=None) -> IdCard:
    if card.status != IdCard.Status.ACTIVE:
        raise IdCardError("Only an active card can be revoked.")
    card.status = IdCard.Status.REVOKED
    card.revoked_at = timezone.now()
    card.revoked_by = actor
    card.save(update_fields=["status", "revoked_at", "revoked_by", "updated_at"])
    log_action(
        action="idcards.card_revoked", actor=actor, school=card.school, entity_type="IdCard",
        entity_id=str(card.id), after={"card_number": card.card_number},
    )
    return card


def bulk_issue(*, holder_type: str, school, school_class=None, issued_by=None, request=None):
    """Issues cards to everyone of `holder_type` who has no active card yet (never replaces an
    existing one — re-issuing is a deliberate per-person action). Returns (issued, skipped)."""
    if holder_type == IdCard.HolderType.STUDENT:
        holders = (
            Student.objects.filter(school=school, status=Student.Status.ACTIVE)
            .exclude(id_cards__status=IdCard.Status.ACTIVE)
            .select_related("current_class", "current_section")
        )
        if school_class is not None:
            holders = holders.filter(current_class=school_class)
    else:
        holders = (
            Staff.objects.filter(school=school, employment_status=Staff.EmploymentStatus.ACTIVE)
            .exclude(id_cards__status=IdCard.Status.ACTIVE)
            .select_related("user", "department")
        )

    issued, skipped = [], []
    for holder in holders:
        try:
            issued.append(issue_card(holder, issued_by=issued_by, request=request))
        except IdCardError as exc:
            skipped.append({"name": str(holder), "reason": str(exc)})
    return issued, skipped


def verification_summary(card: IdCard) -> dict:
    """What a public scanner is allowed to see: enough to match a face to a name and confirm the
    card is genuine and current — deliberately nothing else (no DOB, address, contact details)."""
    holder = card.holder
    photo_url = ""
    try:
        photo_url = holder.photo.url if holder.photo else ""
    except Exception:  # noqa: BLE001 - a missing/unsigned file must never break verification
        photo_url = ""
    payload = card.payload or {}
    return {
        "valid": card.is_valid,
        "status": card.status,
        "reason": "" if card.is_valid else ("Expired" if card.status == IdCard.Status.ACTIVE else card.get_status_display()),
        "holder_type": card.holder_type,
        "name": payload.get("name", ""),
        "role": payload.get("role", ""),
        "number": payload.get("number", ""),
        "card_number": card.card_number,
        "school_name": card.school.name,
        "expires_at": card.expires_at,
        "photo": photo_url,
    }
