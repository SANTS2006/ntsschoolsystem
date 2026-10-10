from decimal import ROUND_HALF_UP, Decimal

from django.db import models, transaction
from django.utils import timezone
from django.utils.html import escape

from apps.audit.services import log_action
from apps.notifications.services import notify, notify_bulk

from .models import AcademicYear, Assessment, AssessmentScore, Section, SchoolClass, SubjectOffering, Term

# Phase 6: a Final Subject Score within this many percentage points BELOW the offering's own
# pass_mark reads as NEAR PASS rather than FAIL — a fixed band, not a per-school setting, since
# the spec only asks that the pass mark itself (not this margin) be school-configurable.
NEAR_PASS_MARGIN = Decimal("5")


def _round2(value):
    """Consistent rounding policy for every derived percentage in this module: two decimal
    places, half-up. `None` passes through unchanged so callers don't need to special-case it."""
    if value is None:
        return None
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def assert_year_not_archived(academic_year: AcademicYear | None) -> None:
    """The single choke point every write path for a year-scoped record runs through: Section,
    Term, and SubjectOffering here in academics (direct FK to AcademicYear/Term), plus, one hop
    further via their own `section.academic_year`, AttendanceRecord and TimetableEntry, and
    FeeStructure/Invoice in finance (direct, nullable FK). `None` is a no-op — some of those FKs
    are optional, and a record with no year at all was never year-scoped to begin with.

    Raises a plain ValueError, not a DRF error — same convention as every other service function
    in this module (see close_ca, save_assessment_scores): the caller (almost always a
    serializer's own `validate()`) re-raises it as `serializers.ValidationError`, keeping this
    module framework-agnostic and reusable outside a request (management commands, tests)."""
    if academic_year is not None and academic_year.is_archived:
        raise ValueError(f'"{academic_year.name}" is archived; its records are read-only.')


def archive_academic_year(academic_year: AcademicYear, *, actor) -> AcademicYear:
    """Marks a year read-only for every year-scoped write path (see assert_year_not_archived).
    Refuses to archive the currently-current year — switch which year is current first, so a
    school is never left with its active year suddenly locked out from under whoever's using it."""
    if academic_year.is_archived:
        raise ValueError("This academic year is already archived.")
    if academic_year.is_current:
        raise ValueError("Switch the current academic year to a different one before archiving this one.")
    academic_year.is_archived = True
    academic_year.archived_at = timezone.now()
    academic_year.save(update_fields=["is_archived", "archived_at"])
    log_action(
        action="academics.year_archived",
        actor=actor,
        school=academic_year.school,
        entity_type="AcademicYear",
        entity_id=academic_year.id,
    )
    return academic_year


def unarchive_academic_year(academic_year: AcademicYear, *, actor) -> AcademicYear:
    if not academic_year.is_archived:
        raise ValueError("This academic year is not archived.")
    academic_year.is_archived = False
    academic_year.archived_at = None
    academic_year.save(update_fields=["is_archived", "archived_at"])
    log_action(
        action="academics.year_unarchived",
        actor=actor,
        school=academic_year.school,
        entity_type="AcademicYear",
        entity_id=academic_year.id,
    )
    return academic_year


def scope_subject_offerings_for_teacher(queryset, user):
    """A Teacher must only see the subject offerings they actually teach — as either the main or
    the assistant teacher — never the whole school's catalog. Keyed off the "teacher" role slug
    specifically (same pattern as apps.students.services.scope_students_for_teacher), not a
    view-only permission, since e.g. a Principal or Exams Director legitimately needs
    school-wide visibility without "teaching" anything."""
    from apps.authorization.services import user_has_active_role

    is_teacher = user_has_active_role(user, "teacher")
    if not is_teacher:
        return queryset

    staff_profile = getattr(user, "staff_profile", None)
    if staff_profile is None:
        return queryset.none()

    return queryset.filter(models.Q(main_teacher=staff_profile) | models.Q(assistant_teacher=staff_profile))


def compute_ca_allocation(subject_offering: SubjectOffering) -> dict:
    """CA weight budget for one offering: configured (its ca_weight_percent), allocated (sum of
    active Assessment weights), and remaining. Backs both the "CA progress display" and the
    over-allocation guard in AssessmentSerializer.validate() — a single Assessment's weight can't
    be validated in isolation, since the constraint spans every sibling Assessment."""
    allocated = (
        subject_offering.assessments.filter(status=Assessment.Status.ACTIVE).aggregate(total=models.Sum("weight"))[
            "total"
        ]
        or 0
    )
    configured = subject_offering.ca_weight_percent
    return {"configured": configured, "allocated": allocated, "remaining": configured - allocated}


def compute_total_ca(subject_offering: SubjectOffering, student) -> Decimal | None:
    """Total CA = sum of weighted scores across this offering's assessments, counting only
    SUBMITTED scores. A draft or missing score is excluded entirely, never treated as zero, so an
    in-progress or ungraded assessment doesn't silently drag a student's visible CA down. Returns
    None (not 0) when nothing has been submitted yet."""
    scores = AssessmentScore.objects.filter(
        assessment__subject_offering=subject_offering,
        student=student,
        status=AssessmentScore.Status.SUBMITTED,
        weighted_score__isnull=False,
    )
    if not scores.exists():
        return None
    return scores.aggregate(total=models.Sum("weighted_score"))["total"]


def save_assessment_scores(assessment: Assessment, *, entries: list[dict], submit: bool):
    """Upserts one AssessmentScore row per entry ({"student": Student, "raw_score": Decimal|None}).
    `submit=True` finalizes every touched row to SUBMITTED and notifies each affected student (in-
    app + email, via the existing notifications system — no separate infrastructure); `submit=False`
    keeps them as drafts, invisible to the student, so a teacher can save progress without
    alerting anyone. Raises ValueError (caught by the view and turned into a 400) if the offering's
    CA is already closed, or if a score is negative or exceeds the assessment's max_score."""
    subject_offering = assessment.subject_offering
    if subject_offering.ca_status == SubjectOffering.CAStatus.CLOSED:
        raise ValueError("CA is closed for this subject offering; scores can no longer be modified.")

    for entry in entries:
        discretionary_mark = entry.get("discretionary_mark")
        if discretionary_mark is not None:
            if discretionary_mark < 0:
                raise ValueError(f"{entry['student'].full_name}'s discretionary mark cannot be negative.")
            if discretionary_mark > assessment.discretionary_weight:
                raise ValueError(
                    f"{entry['student'].full_name}'s discretionary mark cannot exceed "
                    f"{assessment.discretionary_weight}."
                )
        raw_score = entry.get("raw_score")
        if raw_score is None:
            continue
        if raw_score < 0:
            raise ValueError(f"{entry['student'].full_name}'s score cannot be negative.")
        if raw_score > assessment.max_score:
            raise ValueError(f"{entry['student'].full_name}'s score cannot exceed {assessment.max_score}.")

    saved = []
    with transaction.atomic():
        for entry in entries:
            defaults = {
                "school": assessment.school,
                "raw_score": entry.get("raw_score"),
                "status": AssessmentScore.Status.SUBMITTED if submit else AssessmentScore.Status.DRAFT,
            }
            # Only touched when the caller sent it, so a client that predates discretionary marks
            # never wipes ones already awarded.
            if "discretionary_mark" in entry:
                defaults["discretionary_mark"] = entry["discretionary_mark"]
            # Not update_or_create: it saves only the keys in `defaults`, which would skip the
            # weighted_score that AssessmentScore.save() recomputes and leave it stale on re-save.
            score = AssessmentScore.objects.filter(assessment=assessment, student=entry["student"]).first()
            if score is None:
                score = AssessmentScore(assessment=assessment, student=entry["student"])
            for field, value in defaults.items():
                setattr(score, field, value)
            score.save()
            saved.append(score)

    if submit:
        for score in saved:
            if not score.student.user_id:
                continue
            detail = (
                f"{score.raw_score}/{assessment.max_score}"
                if score.raw_score is not None
                else "recorded (no score entered)"
            )
            if score.discretionary_mark is not None:
                detail += f" + {score.discretionary_mark}/{assessment.discretionary_weight} teacher's discretion"
            notify(
                recipient=score.student.user,
                category="assessment",
                title=f"{assessment.name} graded",
                message=f"{assessment.subject_offering.subject.name} — {detail}",
                link="/my-subjects",
                email_subject=f"{assessment.name} graded",
                email_html=(
                    f"<p>Your score for <strong>{assessment.name}</strong> "
                    f"({assessment.subject_offering.subject.name}) has been recorded: {detail}.</p>"
                ),
            )
    return saved


def close_ca(subject_offering: SubjectOffering, *, actor):
    subject_offering.ca_status = SubjectOffering.CAStatus.CLOSED
    subject_offering.ca_closed_at = timezone.now()
    subject_offering.ca_closed_by = actor
    subject_offering.save(update_fields=["ca_status", "ca_closed_at", "ca_closed_by"])
    log_action(
        action="academics.ca_closed",
        actor=actor,
        school=subject_offering.school,
        entity_type="SubjectOffering",
        entity_id=subject_offering.id,
    )
    return subject_offering


def reopen_ca(subject_offering: SubjectOffering, *, actor, reason: str):
    subject_offering.ca_status = SubjectOffering.CAStatus.OPEN
    subject_offering.ca_closed_at = None
    subject_offering.ca_closed_by = None
    subject_offering.save(update_fields=["ca_status", "ca_closed_at", "ca_closed_by"])
    log_action(
        action="academics.ca_reopened",
        actor=actor,
        school=subject_offering.school,
        entity_type="SubjectOffering",
        entity_id=subject_offering.id,
        metadata={"reason": reason},
    )
    return subject_offering


def compute_exam_contribution(subject_offering: SubjectOffering, exam_score) -> Decimal | None:
    """Exam Contribution = (raw exam score / the offering's exam_max_score) * exam_weight_percent
    — the exam-portion's share of the Final Subject Score. None (never 0) when no exam score has
    been entered yet, so a missing exam score never silently drags the final score down."""
    if exam_score is None:
        return None
    return _round2((exam_score / subject_offering.exam_max_score) * subject_offering.exam_weight_percent)


def compute_pass_status(subject_offering: SubjectOffering, final_score) -> str:
    """PASS / NEAR_PASS / FAIL / INCOMPLETE against the offering's own pass_mark — never a single
    global constant. INCOMPLETE means a component (CA or exam) is still missing; it is never
    conflated with FAIL, since an ungraded subject isn't the same as a failed one."""
    if final_score is None:
        return "incomplete"
    pass_mark = Decimal(subject_offering.pass_mark)
    if final_score >= pass_mark:
        return "pass"
    if final_score >= pass_mark - NEAR_PASS_MARGIN:
        return "near_pass"
    return "fail"


def load_grade_boundaries(school) -> list:
    """The school's letter-grade table: its default grading scale (or, failing that, its first one), best grade
    first. Loaded once and handed to `grade_for_score` so a whole class doesn't query it per student."""
    from apps.examinations.models import GradeBoundary, GradingScale

    # Explicitly the school's own rows (unscoped managers + a school filter) so this works the same inside a
    # request, a background job or a platform admin viewing a school.
    scales = GradingScale.unscoped_objects.filter(school=school)
    scale = scales.filter(is_default=True).first() or scales.order_by("name").first()
    if scale is None:
        return []
    return list(GradeBoundary.unscoped_objects.filter(school=school, grading_scale=scale).order_by("-min_score"))


def grade_for_score(boundaries, score) -> tuple[str | None, Decimal | None]:
    """(letter, grade points) for a final score: the best boundary the score reaches. (None, None) when the
    score is incomplete or the school hasn't set up a grading scale."""
    if score is None or not boundaries:
        return None, None
    for boundary in boundaries:
        if score >= boundary.min_score:
            return boundary.grade, boundary.gpa_value
    lowest = boundaries[-1]
    return lowest.grade, lowest.gpa_value


def compute_grade_point_average(points) -> Decimal | None:
    """Grade-point average across a term's subjects: the plain mean of each subject's grade points. None when
    any subject is still ungraded or has no points set for its letter, so a half-finished term never shows a
    flattering average."""
    points = list(points)
    if not points or any(p is None for p in points):
        return None
    return _round2(sum(points) / len(points))


def compute_final_subject_score(subject_offering: SubjectOffering, student, boundaries=None) -> dict:
    """Phase 6's deterministic, backend-only combination of Phase 5's Total CA and this
    offering's exam contribution: Final Subject Score = CA Contribution + Exam Contribution.
    Either half missing (no submitted CA yet, or no exam score entered yet) leaves `final_score`
    `None` — an incomplete grade is never silently treated as a zero, and `compute_pass_status`
    reports that as INCOMPLETE rather than FAIL."""
    from .models import SubjectResult

    ca_contribution = compute_total_ca(subject_offering, student)
    exam_score = (
        SubjectResult.objects.filter(subject_offering=subject_offering, student=student)
        .values_list("exam_score", flat=True)
        .first()
    )
    exam_contribution = compute_exam_contribution(subject_offering, exam_score)

    final_score = (
        _round2(ca_contribution + exam_contribution)
        if ca_contribution is not None and exam_contribution is not None
        else None
    )
    letter_grade, grade_points = grade_for_score(boundaries, final_score)
    return {
        "ca_contribution": ca_contribution,
        "exam_contribution": exam_contribution,
        "final_score": final_score,
        "pass_status": compute_pass_status(subject_offering, final_score),
        "letter_grade": letter_grade,
        "grade_points": grade_points,
    }


def enter_subject_exam_score(subject_offering: SubjectOffering, *, student, exam_score, entered_by):
    """Admin/Exams-Director entry point for the exam-portion score — never a teacher (enforced in
    the view, not here). Raises ValueError for an out-of-range score, caught by the view and
    turned into a clean 400 rather than surfacing the model's own CheckConstraint as a 500."""
    if exam_score is not None:
        if exam_score < 0:
            raise ValueError(f"{student.full_name}'s exam score cannot be negative.")
        if exam_score > subject_offering.exam_max_score:
            raise ValueError(f"{student.full_name}'s exam score cannot exceed {subject_offering.exam_max_score}.")

    from .models import SubjectResult

    result, _created = SubjectResult.objects.update_or_create(
        subject_offering=subject_offering,
        student=student,
        defaults={"school": subject_offering.school, "exam_score": exam_score, "entered_by": entered_by},
    )
    return result


def compute_term_percentage(school_class, term, student) -> Decimal | None:
    """Term Percentage = the average Final Subject Score (Phase 6) across every subject the
    student is enrolled in for this class/term. None if the student has no enrolled subjects for
    this term, or if even one enrolled subject's Final Subject Score is still incomplete — an
    incomplete subject is never averaged in as a 0."""
    offerings = SubjectOffering.objects.filter(
        term=term, school_class=school_class, enrollments__student=student
    ).distinct()
    if not offerings.exists():
        return None
    scores = []
    for offering in offerings:
        final_score = compute_final_subject_score(offering, student)["final_score"]
        if final_score is None:
            return None
        scores.append(final_score)
    return _round2(sum(scores) / len(scores))


def compute_class_positions(school_class, term) -> list[dict]:
    """Standard competition ranking (ties share a rank; the next distinct score's rank skips
    ahead by the number of tied students — e.g. 90/90/85 -> 1st/1st/3rd) among every student
    currently in `school_class` who has a computed Term Percentage for `term`. A student with an
    incomplete Term Percentage is excluded from ranking entirely rather than being placed using a
    0 they didn't earn."""
    from apps.students.models import Student

    students = Student.objects.filter(school=school_class.school, current_class=school_class)
    scored = []
    for student in students:
        pct = compute_term_percentage(school_class, term, student)
        if pct is not None:
            scored.append((student, pct))
    scored.sort(key=lambda pair: pair[1], reverse=True)

    rows = []
    rank = 0
    previous_score = None
    for index, (student, pct) in enumerate(scored, start=1):
        if pct != previous_score:
            rank = index
            previous_score = pct
        rows.append({"student": student, "term_percentage": pct, "position": rank})
    return rows


def compute_overall_percentage(school_class, academic_year, student) -> Decimal | None:
    """Overall % = the average Term Percentage across every Term the school has actually
    configured for `academic_year` — generalized to however many terms that is, never hard-coded
    to three. None until every one of those terms has a computed Term Percentage for this
    student (or if the year has no terms at all)."""
    terms = Term.objects.filter(academic_year=academic_year)
    if not terms.exists():
        return None
    percentages = []
    for term in terms:
        pct = compute_term_percentage(school_class, term, student)
        if pct is None:
            return None
        percentages.append(pct)
    return _round2(sum(percentages) / len(percentages))


def _decide_promotion_outcome(school_class, overall_percent, threshold_percent):
    """Pure decision rule, no DB writes — the one place that reads is_public_exam_transition and
    the school's own promotion_threshold_percent, so bulk_promote (and any future caller) can't
    drift out of sync with each other."""
    from .models import PromotionRecord

    if school_class.is_public_exam_transition:
        return PromotionRecord.Status.PUBLIC_EXAM_REQUIRED, None
    if overall_percent is not None and overall_percent >= threshold_percent:
        return PromotionRecord.Status.PROMOTED, school_class.next_class
    return PromotionRecord.Status.REPEATED, school_class


@transaction.atomic
def bulk_promote(*, school_class, academic_year, target_academic_year, students, actor):
    """One PromotionRecord per student, decided purely from their own Overall % against the
    school's own promotion_threshold_percent and the class's own is_public_exam_transition flag.
    Promoted students move to `school_class`'s configured `next_class` (which may itself be None
    if the school hasn't configured progression yet — that's a data-completeness gap for the
    school to fix, not a reason to block the decision); repeating students stay in `school_class`.
    A public-exam-transition class's students get neither their class nor academic year advanced
    here — nothing in this function is allowed to promote them; see `manual_promote` for the
    follow-up once the real external result is known. Skips (never overwrites) any student who
    already has a normal promoted/repeated record for this exact academic year, so re-running
    this for a class doesn't double-promote anyone."""
    from .models import PromotionRecord
    from apps.students.models import Student

    school = school_class.school
    threshold = school.promotion_threshold_percent
    created = []
    skipped = []

    for student in students:
        already_decided = PromotionRecord.objects.filter(
            student=student,
            previous_academic_year=academic_year,
            status__in=[PromotionRecord.Status.PROMOTED, PromotionRecord.Status.REPEATED],
        ).exists()
        if already_decided:
            skipped.append(student)
            continue

        overall_percent = compute_overall_percentage(school_class, academic_year, student)
        status, new_class = _decide_promotion_outcome(school_class, overall_percent, threshold)
        is_pending_public_exam = status == PromotionRecord.Status.PUBLIC_EXAM_REQUIRED

        record = PromotionRecord.objects.create(
            school=school,
            student=student,
            previous_class=school_class,
            previous_academic_year=academic_year,
            new_class=None if is_pending_public_exam else new_class,
            new_academic_year=None if is_pending_public_exam else target_academic_year,
            overall_percent=overall_percent,
            threshold_percent=threshold,
            status=status,
            type=PromotionRecord.Type.PUBLIC_EXAM if is_pending_public_exam else PromotionRecord.Type.NORMAL,
            external_exam_status=(
                PromotionRecord.ExternalExamStatus.PENDING
                if is_pending_public_exam
                else PromotionRecord.ExternalExamStatus.NOT_APPLICABLE
            ),
            actor=actor,
        )
        created.append(record)

        if not is_pending_public_exam:
            Student.objects.filter(pk=student.pk).update(
                current_class=new_class, current_academic_year=target_academic_year
            )

    return created, skipped


@transaction.atomic
def manual_promote(*, student, new_class, new_academic_year, status, external_exam_status, actor):
    """The follow-up half of a public-exam-transition decision: once the real external exam
    result is known, an admin explicitly places the student into whichever class/year (and
    promoted-vs-repeated status) that result earns them — this system never guesses that
    placement itself. Requires the student's most recent PromotionRecord to be
    PUBLIC_EXAM_REQUIRED; raises ValueError otherwise, since a manual override only makes sense
    as the resolution of that specific pending state."""
    from .models import PromotionRecord
    from apps.students.models import Student

    latest = PromotionRecord.objects.filter(student=student).order_by("-created_at").first()
    if latest is None or latest.status != PromotionRecord.Status.PUBLIC_EXAM_REQUIRED:
        raise ValueError("This student has no pending public-examination promotion to resolve.")

    record = PromotionRecord.objects.create(
        school=student.school,
        student=student,
        previous_class=latest.previous_class,
        previous_academic_year=latest.previous_academic_year,
        new_class=new_class,
        new_academic_year=new_academic_year,
        overall_percent=latest.overall_percent,
        threshold_percent=latest.threshold_percent,
        status=status,
        type=PromotionRecord.Type.MANUAL,
        external_exam_status=external_exam_status,
        actor=actor,
    )
    Student.objects.filter(pk=student.pk).update(current_class=new_class, current_academic_year=new_academic_year)
    return record


def _student_offerings_for_term(school_class, term, student):
    return SubjectOffering.objects.filter(
        term=term, school_class=school_class, enrollments__student=student
    ).distinct()


def compute_term_completeness(school_class, term, student) -> bool:
    """True only when the student is enrolled in at least one subject for this term and every
    one of those subjects has a complete Final Subject Score (Phase 6) — the gate for
    READY_FOR_REVIEW. A student with zero enrolled subjects is never "complete" by default."""
    offerings = _student_offerings_for_term(school_class, term, student)
    if not offerings.exists():
        return False
    return all(compute_final_subject_score(offering, student)["final_score"] is not None for offering in offerings)


def get_or_create_term_result_publication(student, school_class, term):
    from .models import TermResultPublication

    pub, _created = TermResultPublication.objects.get_or_create(
        student=student, school_class=school_class, term=term, defaults={"school": school_class.school}
    )
    return pub


def sync_publication_progress(pub):
    """Auto-advances DRAFT -> IN_PROGRESS -> READY_FOR_REVIEW purely from data completeness on
    every check — never touches VERIFIED/PUBLISHED/LOCKED, which only change through their own
    explicit, audited actions below."""
    from .models import TermResultPublication

    if pub.status not in (
        TermResultPublication.Status.DRAFT,
        TermResultPublication.Status.IN_PROGRESS,
        TermResultPublication.Status.READY_FOR_REVIEW,
    ):
        return pub

    offerings = _student_offerings_for_term(pub.school_class, pub.term, pub.student)
    if not offerings.exists():
        new_status = TermResultPublication.Status.DRAFT
    elif compute_term_completeness(pub.school_class, pub.term, pub.student):
        new_status = TermResultPublication.Status.READY_FOR_REVIEW
    else:
        new_status = TermResultPublication.Status.IN_PROGRESS
    if new_status != pub.status:
        pub.status = new_status
        pub.save(update_fields=["status"])
    return pub


def verify_term_result(pub, *, actor):
    from .models import TermResultPublication

    sync_publication_progress(pub)
    if pub.status != TermResultPublication.Status.READY_FOR_REVIEW:
        raise ValueError("This result is not ready for review yet.")
    pub.status = TermResultPublication.Status.VERIFIED
    pub.verified_at = timezone.now()
    pub.verified_by = actor
    pub.save(update_fields=["status", "verified_at", "verified_by"])
    log_action(
        action="academics.result_verified",
        actor=actor,
        school=pub.school,
        entity_type="TermResultPublication",
        entity_id=pub.id,
    )
    return pub


def publish_term_result(pub, *, actor):
    """VERIFIED -> PUBLISHED. Only past this point does the student's own result become visible
    at all — see MyResultsView, which filters strictly on status=PUBLISHED. Notifies the student
    in-app + email via the existing notifications system (no separate infrastructure)."""
    from .models import TermResultPublication

    if pub.status != TermResultPublication.Status.VERIFIED:
        raise ValueError("This result must be verified before it can be published.")
    pub.status = TermResultPublication.Status.PUBLISHED
    pub.published_at = timezone.now()
    pub.published_by = actor
    pub.save(update_fields=["status", "published_at", "published_by"])
    log_action(
        action="academics.result_published",
        actor=actor,
        school=pub.school,
        entity_type="TermResultPublication",
        entity_id=pub.id,
    )

    if pub.student.user_id:
        notify(
            recipient=pub.student.user,
            category="result_published",
            title=f"{pub.term.name} results published",
            message=f"Your results for {pub.term.name} ({pub.school_class.name}) are now available.",
            link="/my-results",
            email_subject=f"{pub.term.name} results published",
            email_html=(
                f"<p>Your results for <strong>{pub.term.name}</strong> "
                f"({pub.school_class.name}) have been published.</p>"
            ),
        )
    return pub


def lock_term_result(pub, *, actor):
    """PUBLISHED -> LOCKED, terminal. Locking exists so a published result can't be silently
    altered later — nothing in this module transitions a LOCKED record any further."""
    from .models import TermResultPublication

    if pub.status != TermResultPublication.Status.PUBLISHED:
        raise ValueError("Only a published result can be locked.")
    pub.status = TermResultPublication.Status.LOCKED
    pub.locked_at = timezone.now()
    pub.locked_by = actor
    pub.save(update_fields=["status", "locked_at", "locked_by"])
    log_action(
        action="academics.result_locked",
        actor=actor,
        school=pub.school,
        entity_type="TermResultPublication",
        entity_id=pub.id,
    )
    return pub


def bulk_transition_term_results(*, school_classes, term, action, actor, student_ids=None):
    """Drives verify/publish/lock across a batch — the spec's "individual / class / term /
    multiple classes" publication shapes are all just this same call with a different
    `school_classes`/`student_ids` combination: one class + one student id = individual; one
    class, no ids = that whole class; several classes = "multiple classes". When `student_ids`
    is given, those students are looked up directly (not filtered by current_class) — an
    individual publish targets a specific historical (student, school_class, term), which may no
    longer match the student's *current* class after a later promotion. Without `student_ids`,
    students are scoped to who is currently in `school_class`, the normal in-year case. Skips
    (never raises for) any student whose publication isn't in the right state yet, so one
    not-ready row never aborts the whole batch."""
    from .models import TermResultPublication
    from apps.students.models import Student

    action_fn = {
        "verify": verify_term_result,
        "publish": publish_term_result,
        "lock": lock_term_result,
    }[action]

    processed, skipped = [], []
    for school_class in school_classes:
        if student_ids:
            students_qs = Student.objects.filter(school=school_class.school, id__in=student_ids)
        else:
            students_qs = Student.objects.filter(school=school_class.school, current_class=school_class)
        for student in students_qs:
            pub = get_or_create_term_result_publication(student, school_class, term)
            sync_publication_progress(pub)
            try:
                action_fn(pub, actor=actor)
                processed.append(pub)
            except ValueError:
                skipped.append(pub)
    return processed, skipped


def build_term_result_report(student, school_class, term):
    """The full per-student report: every enrolled subject's CA/exam contributions, Final
    Subject Score, pass mark, and pass status, plus the term-level summary (Term %, class
    position, the school's threshold, Overall % and promotion status where available). Shared by
    the admin preview and the student's own published view — the same numbers, computed once,
    never duplicated in the frontend."""
    from .models import PromotionRecord

    offerings = _student_offerings_for_term(school_class, term, student)
    boundaries = load_grade_boundaries(school_class.school)
    is_tertiary = school_class.school.school_type == "tertiary"
    subjects = []
    passed = failed = 0
    for offering in offerings:
        breakdown = compute_final_subject_score(offering, student, boundaries)
        if breakdown["pass_status"] == "pass":
            passed += 1
        elif breakdown["pass_status"] in ("fail", "near_pass"):
            failed += 1
        subjects.append(
            {
                "subject_name": offering.subject.name,
                "ca_contribution": breakdown["ca_contribution"],
                "exam_contribution": breakdown["exam_contribution"],
                "final_score": breakdown["final_score"],
                "pass_mark": offering.pass_mark,
                "pass_status": breakdown["pass_status"],
                "letter_grade": breakdown["letter_grade"],
                "grade_points": breakdown["grade_points"],
            }
        )

    positions = compute_class_positions(school_class, term)
    position = next((row["position"] for row in positions if row["student"].id == student.id), None)
    promotion = (
        PromotionRecord.objects.filter(student=student, previous_academic_year=term.academic_year)
        .order_by("-created_at")
        .first()
    )

    return {
        "subjects": subjects,
        "total_subjects": len(subjects),
        "passed": passed,
        "failed": failed,
        "term_percentage": compute_term_percentage(school_class, term, student),
        "position": position,
        "threshold_percent": school_class.school.promotion_threshold_percent,
        "overall_percent": compute_overall_percentage(school_class, term.academic_year, student),
        "promotion_status": promotion.status if promotion else None,
        # Tertiary institutions also report a grade-point average on the scale the school chose.
        "is_tertiary": is_tertiary,
        "grade_point_scale": school_class.school.grade_point_scale if is_tertiary else None,
        "term_gpa": compute_grade_point_average(s["grade_points"] for s in subjects) if is_tertiary else None,
    }


def _enrolled_student_users(subject_offering):
    from .models import StudentSubjectEnrollment

    return [
        enrollment.student.user
        for enrollment in StudentSubjectEnrollment.objects.filter(
            subject_offering=subject_offering, student__user__isnull=False
        ).select_related("student__user")
    ]


def notify_material_uploaded(material):
    """Alerts every currently-enrolled student (with a portal account) that a new material was
    posted. In-app only — mirrors apps.assignments.services.notify_new_assignment's identical
    "broadcast to a whole class" shape: no email for a batch that could be large, consistent with
    "do not send large batches of emails synchronously inside API requests" (no background queue
    exists in this codebase to defer it to)."""
    users = _enrolled_student_users(material.subject_offering)
    if not users:
        return 0
    notify_bulk(
        recipients=users,
        category="subject_material",
        title=f"New material: {material.title}",
        message=f"{material.subject_offering.subject.name} — {material.title}",
        link="/my-subjects",
    )
    return len(users)


def notify_subject_message(message):
    """Same in-app-only broadcast shape as notify_material_uploaded, for the same reason — a
    general subject message can reach an entire class."""
    users = _enrolled_student_users(message.subject_offering)
    if not users:
        return 0
    notify_bulk(
        recipients=users,
        category="subject_message",
        title=f"New message in {message.subject_offering.subject.name}",
        message=message.body[:200],
        link="/my-subjects",
    )
    return len(users)


def notify_private_message(private_message):
    """A private thread has exactly one other participant — safe to use the singular notify()
    with email, unlike the broadcast paths above. If the student sent it, the offering's main
    teacher is notified (the accountable owner of record); otherwise the student is."""
    if private_message.sender_id == private_message.student.user_id:
        recipient = private_message.subject_offering.main_teacher.user
    else:
        recipient = private_message.student.user
    if recipient is None:
        return

    subject_name = private_message.subject_offering.subject.name
    notify(
        recipient=recipient,
        category="subject_private_message",
        title=f"New message — {subject_name}",
        message=private_message.body[:200],
        link="/my-subjects",
        email_subject=f"New message — {subject_name}",
        # escape()'d: body is free-text user content, unlike the other email_html call sites in
        # this codebase that only ever interpolate system-generated values (invoice numbers,
        # amounts) — this is the one place in apps.academics where raw user text reaches an HTML
        # email body, so it's the one place that needs explicit escaping.
        email_html=f"<p>{escape(private_message.body)}</p>",
    )


def compute_graduation_status(student):
    """Phase 10: graduation eligibility derived entirely from the school's own configured class
    structure (SchoolClass.is_graduation_level, Phase 2) and the student's actual
    PromotionRecord history (Phase 7) — never a hard-coded number of levels or a fixed "total
    classes" count, since that structure is school-defined and not guaranteed to be linear.

    `has_graduated` is true once the student holds a PROMOTED record whose *previous_class* was
    itself a graduation level — i.e. they completed that terminal class, not merely that they are
    currently sitting in one (a student newly promoted *into* a graduation-level class hasn't
    graduated from it yet)."""
    from .models import PromotionRecord

    history = list(
        PromotionRecord.objects.filter(student=student)
        .select_related("previous_class", "previous_academic_year", "new_class", "new_academic_year")
        .order_by("created_at")
    )
    graduating_record = next(
        (r for r in history if r.status == PromotionRecord.Status.PROMOTED and r.previous_class.is_graduation_level),
        None,
    )
    return {
        "current_class": student.current_class,
        "is_in_graduation_level": bool(student.current_class and student.current_class.is_graduation_level),
        "has_graduated": graduating_record is not None,
        "graduated_at": graduating_record.created_at if graduating_record else None,
        "history": history,
    }


def scope_classes_for_teacher(queryset, user):
    """Same rationale as `apps.students.services.scope_students_for_teacher`: a Teacher's
    "pick a class" dropdown (creating a lesson, an assignment, a live session, an exam schedule,
    ...) should only ever offer classes they're actually assigned to teach, not the whole
    school's class list. Scoped by the "teacher" role slug, not the `academics.view`-only
    permission — plenty of non-teaching roles (Exams Director, Accountant) also hold
    `academics.view` and legitimately need the full list."""
    from django.db.models import Q

    from apps.authorization.services import user_has_active_role

    if not user_has_active_role(user, "teacher"):
        return queryset

    staff_profile = getattr(user, "staff_profile", None)
    if staff_profile is None:
        return queryset.none()

    class_ids = set(
        SchoolClass.unscoped_objects.filter(
            Q(subject_offerings__main_teacher=staff_profile) | Q(subject_offerings__assistant_teacher=staff_profile)
        ).values_list("id", flat=True)
    )
    class_ids |= set(
        Section.unscoped_objects.filter(class_teacher=staff_profile).values_list("school_class_id", flat=True)
    )
    return queryset.filter(id__in=class_ids) if queryset.model is SchoolClass else queryset.filter(
        school_class_id__in=class_ids
    )


def user_teaches_offering(user, subject_offering) -> bool:
    """Is this person one of the subject's assigned teachers *in the role they are working as*? Someone who is both a
    teacher and, say, the exams director only gets teacher powers over their own subject while working as a teacher —
    as the exams director they have none (no adding or grading assessments, no hand-in files)."""
    from apps.authorization.services import active_role_slug

    staff = getattr(user, "staff_profile", None)
    if staff is None:
        return False
    active = active_role_slug(user)
    if active is not None and active != "teacher":
        return False
    return staff.id in (subject_offering.main_teacher_id, subject_offering.assistant_teacher_id)
