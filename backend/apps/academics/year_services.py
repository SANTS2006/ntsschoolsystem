"""Academic-year lifecycle: the one place that decides which year is active, who may move to another, and how a school
rolls from one year into the next.

Vocabulary
  active year   the school's single `is_current` year. Authoritative for every NEW academic record. Changed only by
                `activate_academic_year` (the database also refuses a second one).
  closed year   an archived year (`is_archived`). Its year-scoped records are read-only for ordinary writes (see
                `assert_year_not_archived`); un-archiving is the explicit, audited route for a correction.
  viewing year  a year a person is *looking at*. It is a request parameter, never stored on the school, and can never
                change the active year or widen what a person is allowed to see.

Everything here uses `unscoped_objects` with an explicit school so it behaves the same inside a request, a management
command or a test. Callers are responsible for checking permission before calling in."""

from __future__ import annotations

import logging
from collections import Counter
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.audit.services import log_action

from .models import (
    AcademicYear,
    RolloverRun,
    Section,
    SchoolClass,
    StudentEnrollment,
    SubjectOffering,
    Term,
    PromotionRecord,
)

logger = logging.getLogger("apps")


class NoActiveAcademicYear(Exception):
    """The school has no active academic year. Never papered over with "the latest year": an administrator must activate one."""


class YearLifecycleError(ValueError):
    """A lifecycle rule was broken (message is safe to show to the person who asked)."""


# ---------------------------------------------------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------------------------------------------------

def get_active_year(school) -> AcademicYear | None:
    return AcademicYear.unscoped_objects.filter(school=school, is_current=True).first()


def require_active_year(school) -> AcademicYear:
    year = get_active_year(school)
    if year is None:
        raise NoActiveAcademicYear("This school has no active academic year. An administrator needs to activate one.")
    return year


def resolve_year(school, year_id) -> AcademicYear:
    """A requested year (e.g. a `?academic_year=` viewing parameter) — only ever one of this school's own."""
    try:
        return AcademicYear.unscoped_objects.get(school=school, pk=year_id)
    except (AcademicYear.DoesNotExist, DjangoValidationError, ValueError, TypeError):
        raise YearLifecycleError("That academic year does not exist for your school.") from None


def year_summary(year: AcademicYear) -> dict:
    return {
        "id": str(year.pk),
        "name": year.name,
        "start_date": year.start_date.isoformat(),
        "end_date": year.end_date.isoformat(),
        "status": year.status,
        "is_current": year.is_current,
        "is_archived": year.is_archived,
    }


def year_context(school) -> dict:
    """What the interface needs to show "which year am I in" and offer a viewing selector. No permission-gated data."""
    years = list(AcademicYear.unscoped_objects.filter(school=school).order_by("-start_date"))
    active = next((y for y in years if y.is_current), None)
    term = None
    if active is not None:
        term = Term.unscoped_objects.filter(school=school, academic_year=active, is_current=True).first()
    return {
        "active": year_summary(active) if active else None,
        "current_term": {"id": str(term.pk), "name": term.name} if term else None,
        "years": [year_summary(y) for y in years],
    }


def deletion_blocker(year: AcademicYear) -> str | None:
    """Why this year must not be deleted, or None. A year owns invoices (and through them payments) with ON DELETE CASCADE, plus
    enrolments and rollover history, so deleting one that was ever used would silently destroy records. Only an unused year
    (a mistake, a placeholder) may go."""
    from apps.finance.models import FeeStructure, Invoice

    if year.is_current:
        return "This is the active academic year. Activate another year first (and then close this one)."
    if StudentEnrollment.unscoped_objects.filter(academic_year=year).exists():
        return "Students were enrolled in this year, so it is part of the school's history and cannot be deleted."
    if RolloverRun.unscoped_objects.filter(source_year=year).exists() or RolloverRun.unscoped_objects.filter(target_year=year).exists():
        return "This year took part in a rollover, so it cannot be deleted."
    if Invoice.unscoped_objects.filter(academic_year=year).exists():
        return "Invoices exist for this year, so it cannot be deleted. Its financial records must be kept."
    if PromotionRecord.unscoped_objects.filter(previous_academic_year=year).exists():
        return "Promotion records refer to this year, so it cannot be deleted."
    if FeeStructure.unscoped_objects.filter(academic_year=year).exists() or SubjectOffering.unscoped_objects.filter(academic_year=year).exists():
        return "Fee plans or subject offerings exist for this year. Remove them first if this year really was a mistake."
    return None


# ---------------------------------------------------------------------------------------------------------------------
# Activation
# ---------------------------------------------------------------------------------------------------------------------

def activate_academic_year(year: AcademicYear, *, actor) -> AcademicYear:
    """Makes `year` the school's active year and closes the previous one, atomically.

    Preconditions (all checked after the school's years are locked, so two simultaneous activations cannot both pass):
    the year is not archived, it has at least one term, and — when the school already has an active year — a completed
    rollover from that year into this one exists. A school's very first year needs no rollover."""
    with transaction.atomic():
        years = list(AcademicYear.unscoped_objects.select_for_update().filter(school_id=year.school_id))
        target = next(y for y in years if y.pk == year.pk)
        previous = next((y for y in years if y.is_current), None)

        if target.is_current:
            raise YearLifecycleError(f'"{target.name}" is already the active academic year.')
        if target.is_archived:
            raise YearLifecycleError(f'"{target.name}" is closed. Un-archive it first if it really must become active again.')
        terms = list(Term.unscoped_objects.filter(school_id=target.school_id, academic_year=target).order_by("sequence"))
        if not terms:
            raise YearLifecycleError(f'Add at least one term to "{target.name}" before activating it.')
        if previous is not None:
            completed = RolloverRun.unscoped_objects.filter(
                school_id=target.school_id, source_year=previous, target_year=target, status=RolloverRun.Status.COMPLETED
            ).exists()
            if not completed:
                raise YearLifecycleError(
                    f'Run the rollover from "{previous.name}" into "{target.name}" first, so students, classes and settings are carried over.'
                )

        now = timezone.now()
        if previous is not None:
            previous.is_current = False
            previous.is_archived = True
            previous.archived_at = now
            previous.save(update_fields=["is_current", "is_archived", "archived_at", "updated_at"])
            Term.unscoped_objects.filter(school_id=target.school_id, academic_year=previous, is_current=True).update(is_current=False)
        target.is_current = True
        target.activated_at = now
        target.activated_by = actor
        target.save(update_fields=["is_current", "activated_at", "activated_by", "updated_at"])
        if not any(t.is_current for t in terms):
            Term.unscoped_objects.filter(pk=terms[0].pk).update(is_current=True)

        log_action(
            action="academics.year_activated",
            actor=actor,
            school=target.school,
            entity_type="AcademicYear",
            entity_id=str(target.pk),
            severity="warning",
            metadata={"activated": target.name, "closed": previous.name if previous else None},
        )
    return target


# ---------------------------------------------------------------------------------------------------------------------
# Rollover: preview
# ---------------------------------------------------------------------------------------------------------------------

OUTCOMES = ("promote", "repeat", "graduate", "withdraw", "transfer")

_ACTIVE_STATUSES = ("active", "admitted")


def _check_years(source: AcademicYear, target: AcademicYear) -> None:
    if source.pk == target.pk:
        raise YearLifecycleError("Choose two different academic years.")
    if source.school_id != target.school_id:
        raise YearLifecycleError("Both academic years must belong to the same school.")
    if target.is_archived:
        raise YearLifecycleError(f'"{target.name}" is closed and cannot receive a rollover.')
    if target.is_current:
        raise YearLifecycleError(f'"{target.name}" is already the active year; roll over into an upcoming year instead.')
    if target.start_date <= source.start_date:
        raise YearLifecycleError("The new year must start after the year being closed.")


def _source_enrollments(source: AcademicYear):
    return (
        StudentEnrollment.unscoped_objects.filter(school_id=source.school_id, academic_year=source, student__status__in=_ACTIVE_STATUSES)
        .select_related("student", "school_class", "section")
        .order_by("school_class__order", "student__last_name", "student__first_name")
    )


def _propose(enrollment, school) -> tuple[str, str]:
    """The outcome the school's own rules suggest, and why — or "review" when the rules cannot decide."""
    from apps.tenants.context import reset_current_school_id, set_current_school_id

    from . import services as results

    school_class = enrollment.school_class
    # The results maths reads tenant-scoped tables; make sure it sees this school whether or not a request set that up.
    token = set_current_school_id(school.pk)
    try:
        overall = results.compute_overall_percentage(school_class, enrollment.academic_year, enrollment.student)
    finally:
        reset_current_school_id(token)
    threshold = school.promotion_threshold_percent
    if school_class.is_public_exam_transition:
        return "review", "This class needs a public examination result first."
    if overall is None:
        return "review", "Results for the year are incomplete."
    passed = overall >= threshold
    if school_class.is_graduation_level:
        return ("graduate", f"Final class, {overall}% (pass mark {threshold}%).") if passed else ("repeat", f"Below the {threshold}% pass mark ({overall}%).")
    if not passed:
        return "repeat", f"Below the {threshold}% pass mark ({overall}%)."
    if school_class.next_class_id is None:
        return "review", "No next class is configured for this class."
    return "promote", f"{overall}% (pass mark {threshold}%)."


def _outstanding(source: AcademicYear) -> dict:
    from apps.finance.models import Invoice

    qs = Invoice.unscoped_objects.filter(school_id=source.school_id, academic_year=source, balance__gt=0).exclude(status="cancelled")
    total = qs.aggregate(total=Sum("balance"))["total"] or Decimal("0")
    return {"invoices": qs.count(), "students": qs.values("student").distinct().count(), "total": f"{total:.2f}"}


def build_rollover_preview(source: AcademicYear, target: AcademicYear) -> dict:
    """Everything a rollover would do, computed without writing anything."""
    _check_years(source, target)
    school = source.school
    run = RolloverRun.unscoped_objects.filter(school=school, source_year=source, target_year=target).first()

    rows, counts, warnings = [], Counter(), []
    already = set(StudentEnrollment.unscoped_objects.filter(school=school, academic_year=target).values_list("student_id", flat=True))
    for enrollment in _source_enrollments(source):
        student = enrollment.student
        if student.pk in already:
            counts["already_enrolled"] += 1
            continue
        outcome, reason = _propose(enrollment, school)
        counts[outcome] += 1
        rows.append(
            {
                "student_id": str(student.pk),
                "name": student.full_name,
                "admission_number": student.admission_number,
                "class_id": str(enrollment.school_class_id),
                "class_name": enrollment.school_class.name,
                "section_name": enrollment.section.name if enrollment.section else "",
                "proposed": outcome,
                "reason": reason,
                "next_class_id": str(enrollment.school_class.next_class_id) if enrollment.school_class.next_class_id else None,
            }
        )

    from apps.students.models import Student

    students_without_enrollment = (
        Student.unscoped_objects.filter(school=school, status__in=_ACTIVE_STATUSES).exclude(enrollments__academic_year=source).count()
    )
    if students_without_enrollment:
        warnings.append(f"{students_without_enrollment} active student(s) have no class recorded for {source.name}; they are not part of this rollover and need a class assigned by hand.")

    target_terms = list(Term.unscoped_objects.filter(school=school, academic_year=target).order_by("sequence"))
    if not target_terms:
        warnings.append(f'"{target.name}" has no terms yet. Add them before activating it (subject offerings and fee plans are matched to terms by order).')

    source_sections = Section.unscoped_objects.filter(school=school, academic_year=source).count()
    target_sections = Section.unscoped_objects.filter(school=school, academic_year=target).count()
    source_offerings = SubjectOffering.unscoped_objects.filter(school=school, academic_year=source, status="active").count()
    target_offerings = SubjectOffering.unscoped_objects.filter(school=school, academic_year=target).count()
    from apps.finance.models import FeeStructure

    source_fees = FeeStructure.unscoped_objects.filter(school=school, academic_year=source).count()
    target_fees = FeeStructure.unscoped_objects.filter(school=school, academic_year=target).count()

    return {
        "source": year_summary(source),
        "target": year_summary(target),
        "run": {"status": run.status, "summary": run.summary, "error": run.error} if run else None,
        "students": rows,
        "counts": dict(counts),
        "configuration": {
            "sections": {"in_source": source_sections, "in_target": target_sections},
            "subject_offerings": {"in_source": source_offerings, "in_target": target_offerings, "needs_terms": not target_terms},
            "fee_structures": {"in_source": source_fees, "in_target": target_fees},
            "timetables": "Not copied: build the new year's timetable from its sections and subject offerings.",
        },
        "outstanding_balances": _outstanding(source),
        "warnings": warnings,
        "ready": bool(rows or counts.get("already_enrolled")) and not counts.get("review"),
    }


# ---------------------------------------------------------------------------------------------------------------------
# Rollover: execute
# ---------------------------------------------------------------------------------------------------------------------

def _copy_sections(school, source, target) -> dict:
    made = skipped = 0
    for section in Section.unscoped_objects.filter(school=school, academic_year=source):
        _, created = Section.unscoped_objects.get_or_create(
            school=school,
            school_class=section.school_class,
            academic_year=target,
            name=section.name,
            defaults={"class_teacher": section.class_teacher, "capacity": section.capacity},
        )
        made += created
        skipped += not created
    return {"created": made, "already_there": skipped}


def _copy_offerings(school, source, target) -> dict:
    """New offerings for the new year's terms (matched by term order). Grading configuration is copied; CA scores,
    results, assessments and enrolments are not — those belong to the year they were earned in."""
    target_terms = {t.sequence: t for t in Term.unscoped_objects.filter(school=school, academic_year=target)}
    made = skipped = unmatched = 0
    for offering in SubjectOffering.unscoped_objects.filter(school=school, academic_year=source, status="active").select_related("term"):
        term = target_terms.get(offering.term.sequence)
        if term is None:
            unmatched += 1
            continue
        _, created = SubjectOffering.unscoped_objects.get_or_create(
            school=school,
            subject=offering.subject,
            academic_year=target,
            term=term,
            school_class=offering.school_class,
            defaults={
                "main_teacher": offering.main_teacher,
                "assistant_teacher": offering.assistant_teacher,
                "ca_weight_percent": offering.ca_weight_percent,
                "exam_weight_percent": offering.exam_weight_percent,
                "pass_mark": offering.pass_mark,
                "exam_max_score": offering.exam_max_score,
            },
        )
        made += created
        skipped += not created
    return {"created": made, "already_there": skipped, "no_matching_term": unmatched}


def _copy_fee_structures(school, source, target) -> dict:
    """New fee plans (never invoices or payments) for the new year, named with the new year in place of the old."""
    from apps.finance.models import FeeStructure, FeeStructureItem

    target_terms = {t.sequence: t for t in Term.unscoped_objects.filter(school=school, academic_year=target)}
    made = skipped = 0
    for plan in FeeStructure.unscoped_objects.filter(school=school, academic_year=source).select_related("term"):
        name = plan.name.replace(source.name, target.name) if source.name in plan.name else f"{plan.name} ({target.name})"
        term = target_terms.get(plan.term.sequence) if plan.term_id else None
        if plan.term_id and term is None:
            skipped += 1
            continue
        copy, created = FeeStructure.unscoped_objects.get_or_create(
            school=school, name=name, defaults={"academic_year": target, "term": term, "school_class": plan.school_class}
        )
        if not created:
            skipped += 1
            continue
        for item in FeeStructureItem.unscoped_objects.filter(fee_structure=plan):
            FeeStructureItem.unscoped_objects.create(school=school, fee_structure=copy, fee_category=item.fee_category, amount=item.amount)
        made += 1
    return {"created": made, "skipped": skipped}


def _target_section(school, target, school_class, section_name):
    if not section_name:
        return None
    return Section.unscoped_objects.filter(school=school, academic_year=target, school_class=school_class, name=section_name).first()


def _apply_student(*, school, source, target, enrollment, outcome, override_class, actor, report):
    from apps.students.models import Student

    student = enrollment.student
    source_class = enrollment.school_class
    manual = override_class is not None

    if outcome in ("promote", "repeat"):
        if outcome == "promote":
            new_class = override_class or source_class.next_class
            if new_class is None:
                raise YearLifecycleError(f"{student.full_name}: no next class is configured for {source_class.name}.")
        else:
            new_class = override_class or source_class
        if new_class.school_id != school.pk:
            raise YearLifecycleError("A chosen class does not belong to this school.")
        section = _target_section(school, target, new_class, enrollment.section.name if enrollment.section else "")
        if section is None:
            report["students_without_section"] += 1
        StudentEnrollment.unscoped_objects.create(
            school=school, student=student, academic_year=target, school_class=new_class, section=section, source="rollover"
        )
        PromotionRecord.unscoped_objects.create(
            school=school,
            student=student,
            previous_class=source_class,
            previous_academic_year=source,
            new_class=new_class,
            new_academic_year=target,
            overall_percent=None,
            threshold_percent=school.promotion_threshold_percent,
            status=PromotionRecord.Status.PROMOTED if outcome == "promote" else PromotionRecord.Status.REPEATED,
            type=PromotionRecord.Type.MANUAL if manual else PromotionRecord.Type.NORMAL,
            actor=actor,
        )
        Student.unscoped_objects.filter(pk=student.pk).update(current_academic_year=target, current_class=new_class, current_section=section)
        enrollment.outcome = "promoted" if outcome == "promote" else "repeated"
    elif outcome == "graduate":
        PromotionRecord.unscoped_objects.create(
            school=school,
            student=student,
            previous_class=source_class,
            previous_academic_year=source,
            new_class=None,
            new_academic_year=None,
            threshold_percent=school.promotion_threshold_percent,
            status=PromotionRecord.Status.PROMOTED,
            type=PromotionRecord.Type.NORMAL,
            actor=actor,
        )
        Student.unscoped_objects.filter(pk=student.pk).update(status="graduated", current_academic_year=None, current_class=None, current_section=None)
        enrollment.outcome = "graduated"
    elif outcome in ("withdraw", "transfer"):
        Student.unscoped_objects.filter(pk=student.pk).update(
            status="withdrawn" if outcome == "withdraw" else "transferred", current_academic_year=None, current_class=None, current_section=None
        )
        enrollment.outcome = "withdrawn" if outcome == "withdraw" else "transferred"
    else:
        raise YearLifecycleError(f"Unknown outcome {outcome!r}.")
    enrollment.save(update_fields=["outcome", "updated_at"])
    report["outcomes"][enrollment.outcome] += 1


def execute_rollover(source: AcademicYear, target: AcademicYear, *, actor, decisions: dict | None = None, options: dict | None = None) -> RolloverRun:
    """Carries a school from `source` into `target`. Idempotent and atomic:

    * one `RolloverRun` per year pair: a completed run is returned as-is (a retry changes nothing);
    * the work happens in one transaction, so a failure leaves no half-done state; the run is then marked failed
      with a safe message, and can be run again;
    * a student who already has a `target` enrolment is skipped, never duplicated;
    * unresolved "review" students block the run until a decision is supplied for each.

    `decisions` maps student id -> {"outcome": promote|repeat|graduate|withdraw|transfer, "class": class id (optional)}.
    `options` toggles the configuration copies: sections, subject_offerings, fee_structures (all default on)."""
    decisions = decisions or {}
    options = {"sections": True, "subject_offerings": True, "fee_structures": True, **(options or {})}
    _check_years(source, target)
    school = source.school

    try:
        with transaction.atomic():
            # Lock both years for the whole run: a second request (a double click, a retry, another administrator) waits here
            # and then finds the finished run instead of racing this one, and an activation cannot interleave either.
            list(AcademicYear.unscoped_objects.select_for_update().filter(pk__in=[source.pk, target.pk]))
            run, _ = RolloverRun.unscoped_objects.get_or_create(
                school=school, source_year=source, target_year=target, defaults={"started_by": actor, "options": options}
            )
            if run.status == RolloverRun.Status.COMPLETED:
                return run  # a retried request: nothing to do, the original report stands
            run.status = RolloverRun.Status.RUNNING
            run.options = options
            run.error = ""
            run.started_by = actor
            summary = _apply_rollover(school, source, target, actor, decisions, options)
            run.status = RolloverRun.Status.COMPLETED
            run.summary = summary
            run.completed_at = timezone.now()
            run.save(update_fields=["status", "options", "error", "started_by", "summary", "completed_at", "updated_at"])
            log_action(
                action="academics.year_rollover_completed",
                actor=actor,
                school=school,
                entity_type="RolloverRun",
                entity_id=str(run.pk),
                severity="warning",
                metadata={"from": source.name, "to": target.name, "students": summary["students"]},
            )
            return run
    except YearLifecycleError as exc:
        _record_failure(school, source, target, actor, options, str(exc))
        raise
    except Exception:  # noqa: BLE001 - recorded, then re-raised as a safe message below
        logger.exception("Rollover %s -> %s failed", source.name, target.name)
        _record_failure(school, source, target, actor, options, "The rollover could not be completed and nothing was changed. Please try again or contact support.")
        raise YearLifecycleError("The rollover could not be completed and nothing was changed. Please try again.") from None


def _apply_rollover(school, source, target, actor, decisions, options) -> dict:
    """The work of a rollover, run inside `execute_rollover`'s transaction. Returns the completion summary."""
    report = {"outcomes": Counter(), "students_without_section": 0, "skipped_already_enrolled": 0}
    classes = {str(c.pk): c for c in SchoolClass.unscoped_objects.filter(school=school)}
    already = set(StudentEnrollment.unscoped_objects.filter(school=school, academic_year=target).values_list("student_id", flat=True))

    # Sections first: promoted students are placed into the matching new-year section.
    copied = {}
    if options["sections"]:
        copied["sections"] = _copy_sections(school, source, target)

    plan = []
    unresolved = []
    for enrollment in _source_enrollments(source):
        student = enrollment.student
        if student.pk in already:
            report["skipped_already_enrolled"] += 1
            continue
        decision = decisions.get(str(student.pk)) or {}
        outcome = decision.get("outcome")
        override = None
        if decision.get("class"):
            override = classes.get(str(decision["class"]))
            if override is None:
                raise YearLifecycleError("A chosen class does not exist for this school.")
        if not outcome:
            outcome, _reason = _propose(enrollment, school)
        if outcome == "review":
            unresolved.append(student.full_name)
            continue
        plan.append((enrollment, outcome, override))
    if unresolved:
        shown = ", ".join(unresolved[:5]) + ("…" if len(unresolved) > 5 else "")
        raise YearLifecycleError(f"{len(unresolved)} student(s) need a decision before the rollover can run: {shown}.")

    for enrollment, outcome, override in plan:
        _apply_student(school=school, source=source, target=target, enrollment=enrollment, outcome=outcome, override_class=override, actor=actor, report=report)

    if options["subject_offerings"]:
        copied["subject_offerings"] = _copy_offerings(school, source, target)
    if options["fee_structures"]:
        copied["fee_structures"] = _copy_fee_structures(school, source, target)

    return {
        "students": dict(report["outcomes"]),
        "students_without_section": report["students_without_section"],
        "skipped_already_enrolled": report["skipped_already_enrolled"],
        "configuration": copied,
        "outstanding_balances": _outstanding(source),
    }


def _record_failure(school, source, target, actor, options, message: str) -> None:
    """Notes a failed attempt in its own transaction (the run's work was rolled back). Never downgrades a completed run."""
    with transaction.atomic():
        run, created = RolloverRun.unscoped_objects.select_for_update().get_or_create(
            school=school,
            source_year=source,
            target_year=target,
            defaults={"started_by": actor, "options": options, "status": RolloverRun.Status.FAILED, "error": message[:1000]},
        )
        if not created and run.status != RolloverRun.Status.COMPLETED:
            run.status = RolloverRun.Status.FAILED
            run.error = message[:1000]
            run.save(update_fields=["status", "error", "updated_at"])


# ---------------------------------------------------------------------------------------------------------------------
# Keeping the enrolment history in step with the student's "current" pointer
# ---------------------------------------------------------------------------------------------------------------------

def sync_enrollment(student, *, source: str = "manual") -> StudentEnrollment | None:
    """Make sure the student's current class/year is recorded as that year's enrolment. Called whenever a student is saved
    or promoted, so no write path can leave the history behind the pointer. Creates or corrects *that one year's* row
    only; other years' history is never touched. Does nothing unless a year and a class are both set."""
    if not (student.current_academic_year_id and student.current_class_id):
        return None
    section_id = None
    section = student.current_section
    if section is not None and section.academic_year_id == student.current_academic_year_id and section.school_class_id == student.current_class_id:
        section_id = section.pk
    row = StudentEnrollment.unscoped_objects.filter(student=student, academic_year_id=student.current_academic_year_id).first()
    if row is None:
        return StudentEnrollment.unscoped_objects.create(
            school_id=student.school_id,
            student=student,
            academic_year_id=student.current_academic_year_id,
            school_class_id=student.current_class_id,
            section_id=section_id,
            source=source,
        )
    if row.school_class_id != student.current_class_id or row.section_id != section_id:
        row.school_class_id = student.current_class_id
        row.section_id = section_id
        row.save(update_fields=["school_class", "section", "updated_at"])
    return row
