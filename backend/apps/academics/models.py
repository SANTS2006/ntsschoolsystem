from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.validators import validate_image_file, validate_upload_file
from apps.tenants.models import TenantScopedModel


class AcademicYear(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=20)  # e.g. "2025/2026"
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)
    # Once archived, the year's own records (sections, subject offerings, terms — and, one hop
    # further, anything scoped to one of those, like attendance/timetable) become read-only; see
    # apps.academics.services.assert_year_not_archived, the single choke point every write path
    # that touches a year-scoped model runs through.
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    # Set only by apps.academics.year_services.activate_academic_year (never by a plain create/update).
    activated_at = models.DateTimeField(null=True, blank=True)
    activated_by = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "academic_years"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_academic_year_name_per_school"),
            # The database itself refuses a second active year for a school, whatever the application does.
            models.UniqueConstraint(
                fields=["school"], condition=models.Q(is_current=True), name="one_current_academic_year_per_school"
            ),
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date")),
                name="academic_year_end_after_start",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def status(self) -> str:
        """upcoming | active | closed — derived, so it can never disagree with the two flags it comes from."""
        if self.is_current:
            return "active"
        return "closed" if self.is_archived else "upcoming"


class Term(TenantScopedModel, TimeStampedModel):
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="terms")
    name = models.CharField(max_length=50)  # e.g. "Term 1"
    # Explicit ordering within the academic year (1st/2nd/3rd/...) — deliberately independent of
    # start_date, which is fragile if a school ever needs to back-date or reorder terms. Schools
    # define their own number of terms (not hard-coded to exactly 3).
    sequence = models.PositiveIntegerField(default=1)
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = "terms"
        ordering = ["sequence", "start_date"]
        constraints = [
            models.UniqueConstraint(fields=["academic_year", "name"], name="unique_term_name_per_year"),
            models.UniqueConstraint(fields=["academic_year", "sequence"], name="unique_term_sequence_per_year"),
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date")), name="term_end_after_start"
            ),
            models.UniqueConstraint(fields=["school"], condition=models.Q(is_current=True), name="one_current_term_per_school"),
        ]

    def __str__(self):
        return f"{self.academic_year.name} - {self.name}"

    def save(self, *args, **kwargs):
        if self.academic_year.school_id != self.school_id:
            raise ValueError("Term.school must match academic_year.school")
        super().save(*args, **kwargs)


class Department(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = "departments"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_department_name_per_school"),
        ]

    def __str__(self):
        return self.name


class Subject(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)
    # A subject can be offered by more than one department (e.g. "Financial Accounting" taught
    # by both Business and Accounting) — plain M2M, no through-model attributes needed.
    departments = models.ManyToManyField(Department, blank=True, related_name="subjects")
    # LEGACY grading split, kept for backward compatibility with Result rows created before
    # SubjectOffering existed (Phase 44's grading engine originally read these two fields
    # directly). New code should read the CA/Exam split from the relevant SubjectOffering
    # instead (one subject can now have a different split per class/term/year) — see
    # apps.examinations.services.compute_ca_score/combine_score, which fall back to these
    # fields only when no SubjectOffering matches. Not removed, because doing so would orphan
    # every already-published historical Result computed against them.
    ca_weight_percent = models.PositiveIntegerField(default=40)
    exam_weight_percent = models.PositiveIntegerField(default=60)

    class Meta:
        db_table = "subjects"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_subject_name_per_school"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # `departments` is M2M, so cross-school membership can't be checked here the way a plain
        # FK could be (the row must exist first) — see SubjectSerializer.validate_departments.
        if self.ca_weight_percent + self.exam_weight_percent != 100:
            raise ValueError("Subject.ca_weight_percent and exam_weight_percent must sum to 100")
        super().save(*args, **kwargs)


class SubjectOffering(TenantScopedModel, TimeStampedModel):
    """Phase 44 (Subjects & Results). `Subject` (above) is the school-wide catalog entry — "
    Mathematics" exists once per school. `SubjectOffering` is that subject *as taught*: to one
    `SchoolClass`, for one `Term` of one `AcademicYear`, by one `main_teacher` — with its own
    CA/Exam split and pass mark, since a school may reasonably grade "Mathematics for Grade 10"
    differently from "Mathematics for Grade 1." One teacher can hold any number of offerings
    (across different subjects, classes, or terms) — nothing here restricts that.

    Deliberately does NOT replace `ExamSchedule`: an ExamSchedule is one specific Exam's sitting
    of a subject for a class (there can be several Exams — Mid-Term, End-of-Term — within the
    same term), while a SubjectOffering is the standing "who teaches this, what's the grading
    split" configuration for the whole term, independent of how many exams happen within it."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    class CAStatus(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="offerings")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="subject_offerings")
    term = models.ForeignKey(Term, on_delete=models.CASCADE, related_name="subject_offerings")
    school_class = models.ForeignKey("SchoolClass", on_delete=models.CASCADE, related_name="subject_offerings")
    main_teacher = models.ForeignKey(
        "staff.Staff", on_delete=models.PROTECT, related_name="main_subject_offerings"
    )
    assistant_teacher = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="assistant_subject_offerings"
    )
    # Same CA/Exam split concept as Subject.ca_weight_percent/exam_weight_percent above, but
    # scoped to this specific offering — a school can grade the same subject differently per
    # class/term. Must sum to 100, same rule as Subject's legacy fields.
    ca_weight_percent = models.PositiveIntegerField(default=40)
    exam_weight_percent = models.PositiveIntegerField(default=60)
    # This offering's own pass mark — deliberately per-offering, not a single global constant
    # (e.g. Mathematics might pass at 50% while English passes at 60%).
    pass_mark = models.PositiveIntegerField(default=50)
    # Phase 6: the exam-portion raw score is "out of" this — same reasoning as an Assessment's own
    # max_score (a school's exam paper isn't guaranteed to be marked out of 100).
    exam_max_score = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    # Phase 5: once an admin closes CA for this offering, a teacher can no longer create/edit
    # Assessments or AssessmentScores under it (enforced in the view layer, not here — that check
    # spans a different model). Reopen events are recorded via apps.audit.services.log_action
    # (actor/timestamp/reason), not as overwritable fields here, since an offering's CA can be
    # closed and reopened more than once over its life and a single "last reopened by" field
    # would lose that history.
    ca_status = models.CharField(max_length=10, choices=CAStatus.choices, default=CAStatus.OPEN)
    ca_closed_at = models.DateTimeField(null=True, blank=True)
    ca_closed_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Optional: a teacher-picked cover photo shown large on this offering's card in the teacher's
    # Subjects grid — purely cosmetic, no effect on grading.
    cover_image = models.FileField(
        upload_to="subject_offering_covers/", null=True, blank=True, validators=[validate_image_file]
    )

    class Meta:
        db_table = "subject_offerings"
        ordering = ["-academic_year__start_date", "term__sequence", "school_class__order", "subject__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["subject", "academic_year", "term", "school_class"],
                name="unique_subject_offering_per_term_class",
            ),
            models.CheckConstraint(
                condition=models.Q(ca_weight_percent__gte=0) & models.Q(exam_weight_percent__gte=0),
                name="subject_offering_weights_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.subject.name} - {self.school_class.name} - {self.term}"

    def save(self, *args, **kwargs):
        if self.subject.school_id != self.school_id:
            raise ValueError("SubjectOffering.subject must belong to the same school")
        if self.academic_year.school_id != self.school_id:
            raise ValueError("SubjectOffering.academic_year must belong to the same school")
        if self.term.school_id != self.school_id:
            raise ValueError("SubjectOffering.term must belong to the same school")
        if self.term.academic_year_id != self.academic_year_id:
            raise ValueError("SubjectOffering.term must belong to SubjectOffering.academic_year")
        if self.school_class.school_id != self.school_id:
            raise ValueError("SubjectOffering.school_class must belong to the same school")
        if self.main_teacher.school_id != self.school_id:
            raise ValueError("SubjectOffering.main_teacher must belong to the same school")
        if self.assistant_teacher_id and self.assistant_teacher.school_id != self.school_id:
            raise ValueError("SubjectOffering.assistant_teacher must belong to the same school")
        if self.ca_weight_percent + self.exam_weight_percent != 100:
            raise ValueError("SubjectOffering.ca_weight_percent and exam_weight_percent must sum to 100")
        super().save(*args, **kwargs)


class StudentSubjectEnrollment(TenantScopedModel, TimeStampedModel):
    """Phase 44 (Subjects & Results): explicit record that a specific student takes a specific
    SubjectOffering. Deliberately NOT inferred from the student's class alone — a student's class
    determines which offerings they *could* take, not which ones they *do*, since a school may run
    electives or streams where students in the same class take different subject combinations."""

    subject_offering = models.ForeignKey(SubjectOffering, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="subject_enrollments")

    class Meta:
        db_table = "student_subject_enrollments"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["subject_offering", "student"], name="unique_student_subject_enrollment"
            ),
        ]

    def __str__(self):
        return f"{self.student} -> {self.subject_offering}"

    def save(self, *args, **kwargs):
        if self.subject_offering.school_id != self.school_id:
            raise ValueError("StudentSubjectEnrollment.subject_offering must belong to the same school")
        if self.student.school_id != self.school_id:
            raise ValueError("StudentSubjectEnrollment.student must belong to the same school")
        super().save(*args, **kwargs)


class Assessment(TenantScopedModel, TimeStampedModel):
    """Phase 5 (Subjects & Results): one continuous-assessment component of a SubjectOffering's
    CA allocation — e.g. "Assignment 1", "Mid-Term Test", or any custom name a teacher picks (not
    a fixed enum, per spec). `weight` is this assessment's share of the *SubjectOffering's*
    ca_weight_percent — the sum of a SubjectOffering's active Assessment weights must never
    exceed its ca_weight_percent (enforced in the serializer, since that constraint spans every
    sibling Assessment, not just this one), though it may legitimately be *less* while a teacher
    is still building out the term's assessments — see the CA progress display on the frontend.

    Deliberately separate from `apps.assignments.Assignment`: that model's `weight` is a relative
    weight normalized only over graded work and never required to sum to anything in particular
    — a different, looser grading philosophy this phase's strict CA-percentage accounting can't
    reuse without breaking Assignment's existing behavior."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    subject_offering = models.ForeignKey(SubjectOffering, on_delete=models.CASCADE, related_name="assessments")
    name = models.CharField(max_length=100)
    weight = models.PositiveIntegerField()
    max_score = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    # Part of `weight` the teacher holds back to award by hand, per student, at their own
    # discretion (see AssessmentScore.discretionary_mark). The test itself only earns the rest:
    # raw_score / max_score * (weight - discretionary_weight). 0 means no marks are reserved.
    discretionary_weight = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    # Work that is handed in as files (an assignment, a lab report...). When on, enrolled students can upload their
    # files for this assessment until `upload_deadline`; the teacher opens them, marks them and enters the score as usual.
    allow_file_uploads = models.BooleanField(default=False)
    # Uploads stop at this moment (null = no cut-off). Moving it later reopens the assessment for uploads.
    upload_deadline = models.DateTimeField(null=True, blank=True)
    upload_instructions = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = "assessments"
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(discretionary_weight__lte=models.F("weight")),
                name="assessment_discretionary_within_weight",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.subject_offering})"

    def save(self, *args, **kwargs):
        if self.subject_offering.school_id != self.school_id:
            raise ValueError("Assessment.subject_offering must belong to the same school")
        super().save(*args, **kwargs)


class AssessmentFile(TenantScopedModel, TimeStampedModel):
    """A file a student handed in for an Assessment that takes uploads. Several per student (up to the limit in
    apps.academics.submissions); the teacher marks the work through the ordinary AssessmentScore."""

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="files")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="assessment_files")
    file = models.FileField(upload_to="assessment_files/", validators=[validate_upload_file])
    original_name = models.CharField(max_length=255)
    size_bytes = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "assessment_files"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["assessment", "student"])]

    def __str__(self):
        return f"{self.student} - {self.assessment} - {self.original_name}"

    def save(self, *args, **kwargs):
        if self.assessment.school_id != self.school_id or self.student.school_id != self.school_id:
            raise ValueError("AssessmentFile must belong to the same school as its assessment and student")
        super().save(*args, **kwargs)


class AssessmentUploadReminder(TenantScopedModel):
    """Remembers which 'the upload window is closing' reminders have gone out for an assessment, so each is sent once —
    and sent again from scratch if the teacher moves the deadline (the deadline is part of the key)."""

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="upload_reminders")
    window = models.CharField(max_length=10)  # "48h", "24h", "6h", "1h"
    deadline = models.DateTimeField()
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "assessment_upload_reminders"
        constraints = [
            models.UniqueConstraint(fields=["assessment", "window", "deadline"], name="unique_upload_reminder_per_window"),
        ]


class AssessmentScore(TenantScopedModel, TimeStampedModel):
    """One student's raw score on one Assessment. `weighted_score` = raw_score / max_score *
    assessment.weight, computed and stored here (not recomputed ad hoc on every read) so a later
    edit to the assessment's weight or max_score doesn't silently reshape an already-recorded
    score. `status` tracks the teacher's draft -> submitted workflow (Phase 5's grade-entry table);
    a draft score is not yet visible to the student and doesn't count toward Total CA. Whether an
    edit is currently *allowed* at all depends on the parent SubjectOffering.ca_status — that
    cross-model check lives in the view/service layer, not here."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="scores")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="assessment_scores")
    raw_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    # Teacher-awarded marks out of Assessment.discretionary_weight, in CA points (same unit as
    # weighted_score) - added on top of the test portion, not scaled by max_score.
    discretionary_mark = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    weighted_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    class Meta:
        db_table = "assessment_scores"
        ordering = ["student__last_name", "student__first_name"]
        constraints = [
            models.UniqueConstraint(fields=["assessment", "student"], name="unique_assessment_score_per_student"),
            models.CheckConstraint(
                condition=models.Q(raw_score__gte=0) | models.Q(raw_score__isnull=True),
                name="assessment_score_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(discretionary_mark__gte=0) | models.Q(discretionary_mark__isnull=True),
                name="assessment_discretionary_mark_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.student} - {self.assessment} - {self.raw_score}"

    def save(self, *args, **kwargs):
        if self.assessment.school_id != self.school_id:
            raise ValueError("AssessmentScore.assessment must belong to the same school")
        if self.student.school_id != self.school_id:
            raise ValueError("AssessmentScore.student must belong to the same school")
        discretionary_cap = self.assessment.discretionary_weight
        if self.discretionary_mark is not None and self.discretionary_mark > discretionary_cap:
            raise ValueError("AssessmentScore.discretionary_mark cannot exceed the assessment's discretionary_weight")
        weighted = None
        if self.raw_score is not None:
            if self.raw_score > self.assessment.max_score:
                raise ValueError("AssessmentScore.raw_score cannot exceed the assessment's max_score")
            test_weight = self.assessment.weight - discretionary_cap
            weighted = (self.raw_score / self.assessment.max_score) * test_weight
        if self.discretionary_mark is not None:
            weighted = (weighted or 0) + self.discretionary_mark
        self.weighted_score = weighted
        super().save(*args, **kwargs)


class SubjectResult(TenantScopedModel, TimeStampedModel):
    """Phase 6 (Subjects & Results): one student's exam-portion raw score for a SubjectOffering —
    entered by an Admin/Exams Director, never a teacher. Combined with Phase 5's Total CA
    (`apps.academics.services.compute_total_ca`) into a deterministic Final Subject Score by
    `apps.academics.services.compute_final_subject_score`; that combination is intentionally NOT
    stored here (unlike `AssessmentScore.weighted_score`) because it depends on the CA side too,
    which can still change — the score is computed fresh on every read instead of snapshotted.

    Deliberately a new model, not a reuse of the legacy `apps.examinations.Result` — that model is
    keyed off `ExamSchedule`/`Subject` (predates SubjectOffering) and stays exactly as-is so
    historical results already computed against it are never disturbed."""

    subject_offering = models.ForeignKey(SubjectOffering, on_delete=models.CASCADE, related_name="exam_results")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="subject_exam_results")
    exam_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    entered_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "subject_results"
        ordering = ["student__last_name", "student__first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["subject_offering", "student"], name="unique_subject_result_per_student"
            ),
            models.CheckConstraint(
                condition=models.Q(exam_score__gte=0) | models.Q(exam_score__isnull=True),
                name="subject_result_exam_score_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.student} - {self.subject_offering} - {self.exam_score}"

    def save(self, *args, **kwargs):
        if self.subject_offering.school_id != self.school_id:
            raise ValueError("SubjectResult.subject_offering must belong to the same school")
        if self.student.school_id != self.school_id:
            raise ValueError("SubjectResult.student must belong to the same school")
        if self.exam_score is not None and self.exam_score > self.subject_offering.exam_max_score:
            raise ValueError("SubjectResult.exam_score cannot exceed the subject offering's exam_max_score")
        super().save(*args, **kwargs)


class SchoolClass(TenantScopedModel, TimeStampedModel):
    """A grade/form level, e.g. 'Grade 10' — not year-specific itself; Section below is.

    Promotion/progression is deliberately school-configured, not hard-coded: `next_class` is the
    class a passing student normally moves into (null for a terminal/graduation-only class with
    no successor, or for a school that hasn't configured progression yet). `order` remains purely
    a display-sort convenience — `next_class` is the actual progression edge the promotion engine
    (Phase 7) walks, since a school's numbering isn't guaranteed to be contiguous or even numeric
    (e.g. "JSS 3" -> "SSS 1")."""

    name = models.CharField(max_length=50)
    order = models.PositiveIntegerField(default=0)
    next_class = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="previous_classes"
    )
    # If True, a student finishing THIS class is never auto-promoted from their internal results
    # alone — the school requires a public/external examination first, and promotion out of this
    # class must be a deliberate manual action (Phase 7). Independent of is_graduation_level: a
    # class can require a public exam without being a graduation level (e.g. "JSS 3" -> "SSS 1").
    is_public_exam_transition = models.BooleanField(default=False)
    # If True, this class is a terminal level in the school's structure (e.g. "SSS 3") — a student
    # completing it graduates rather than progressing to another class. Independent of whether
    # next_class is set: a school might still record a nominal "next" class for record-keeping
    # while treating this level as a graduation point.
    is_graduation_level = models.BooleanField(default=False)

    class Meta:
        db_table = "school_classes"
        ordering = ["order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_class_name_per_school"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.next_class_id:
            if self.next_class.school_id != self.school_id:
                raise ValueError("SchoolClass.next_class must belong to the same school")
            if self.next_class_id == self.id:
                raise ValueError("SchoolClass.next_class cannot be itself")
        super().save(*args, **kwargs)


class Section(TenantScopedModel, TimeStampedModel):
    """e.g. 'Grade 10 - A' for a specific academic year."""

    school_class = models.ForeignKey(SchoolClass, on_delete=models.CASCADE, related_name="sections")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="sections")
    name = models.CharField(max_length=50)  # "A", "B", "Blue"
    class_teacher = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.SET_NULL, related_name="class_teacher_sections"
    )
    capacity = models.PositiveIntegerField(default=40)

    class Meta:
        db_table = "sections"
        ordering = ["school_class__order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school_class", "academic_year", "name"], name="unique_section_per_class_year"
            ),
        ]

    def __str__(self):
        return f"{self.school_class.name} - {self.name}"

    def save(self, *args, **kwargs):
        if self.school_class.school_id != self.school_id or self.academic_year.school_id != self.school_id:
            raise ValueError("Section.school must match school_class.school and academic_year.school")
        if self.class_teacher_id and self.class_teacher.school_id != self.school_id:
            raise ValueError("Section.class_teacher must belong to the same school")
        super().save(*args, **kwargs)


class PromotionRecord(TenantScopedModel, TimeStampedModel):
    """Phase 7 (Subjects & Results): one immutable record of a single promotion decision for one
    student at the end of one academic year. Never edited or overwritten after creation — a
    correction is a new record, not a change to an old one, so a student's academic history stays
    intact (`created_at` doubles as the spec's "date"; `actor` is whoever triggered it).

    `status` is the *outcome* (promoted / repeated / stuck pending a public exam); `type` is *how*
    it was decided (the normal bulk pass, blocked on a public exam, or a manual override once
    that exam's result is known). A public-exam-transition class's students get exactly one
    `PUBLIC_EXAM` record with `new_class`/`new_academic_year` left null — nothing here promotes
    them automatically — and later exactly one `MANUAL` record once an admin acts on the real
    external result."""

    class Status(models.TextChoices):
        PROMOTED = "promoted", "Promoted"
        REPEATED = "repeated", "Failed — Repeat"
        PUBLIC_EXAM_REQUIRED = "public_exam_required", "Public Examination Required"

    class Type(models.TextChoices):
        NORMAL = "normal", "Normal"
        PUBLIC_EXAM = "public_exam", "Public Examination"
        MANUAL = "manual", "Manual"

    class ExternalExamStatus(models.TextChoices):
        NOT_APPLICABLE = "not_applicable", "Not Applicable"
        PENDING = "pending", "Pending"
        PASSED = "passed", "Passed"
        FAILED = "failed", "Failed"

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="promotion_records")
    previous_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name="+")
    previous_academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="+")
    new_class = models.ForeignKey(SchoolClass, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    new_academic_year = models.ForeignKey(
        AcademicYear, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    overall_percent = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    threshold_percent = models.PositiveIntegerField()
    status = models.CharField(max_length=25, choices=Status.choices)
    type = models.CharField(max_length=15, choices=Type.choices)
    external_exam_status = models.CharField(
        max_length=20, choices=ExternalExamStatus.choices, default=ExternalExamStatus.NOT_APPLICABLE
    )
    actor = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "promotion_records"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.student} - {self.previous_academic_year} -> {self.status}"

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk).exists():
            raise ValueError("PromotionRecord is append-only and cannot be modified after creation.")
        if self.student.school_id != self.school_id:
            raise ValueError("PromotionRecord.student must belong to the same school")
        if self.previous_class.school_id != self.school_id:
            raise ValueError("PromotionRecord.previous_class must belong to the same school")
        if self.previous_academic_year.school_id != self.school_id:
            raise ValueError("PromotionRecord.previous_academic_year must belong to the same school")
        if self.new_class_id and self.new_class.school_id != self.school_id:
            raise ValueError("PromotionRecord.new_class must belong to the same school")
        if self.new_academic_year_id and self.new_academic_year.school_id != self.school_id:
            raise ValueError("PromotionRecord.new_academic_year must belong to the same school")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("PromotionRecord is append-only and cannot be deleted.")


class TermResultPublication(TenantScopedModel, TimeStampedModel):
    """Phase 8 (Subjects & Results): the publication gate for one student's results in one
    class/term — students never see Phase 6/7's computed scores until this record reaches
    PUBLISHED. `school_class` and `term` are stored directly here (not derived from
    `student.current_class`, which changes on promotion) so a published result permanently
    reflects the class the student was actually in *at the time* — "never change old Class 1
    results into Class 2 results."

    States: DRAFT (default, nothing verified yet) -> IN_PROGRESS (some but not all of the term's
    subjects graded) -> READY_FOR_REVIEW (every enrolled subject's Final Subject Score is
    complete) -> VERIFIED (an admin/exams-director confirmed it) -> PUBLISHED (visible to the
    student; triggers a notification) -> LOCKED (terminal; no further transitions). Moving
    IN_PROGRESS/READY_FOR_REVIEW is automatic (derived from data completeness, recomputed on
    read); VERIFIED/PUBLISHED/LOCKED are explicit actions in apps.academics.services, each
    audit-logged."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        IN_PROGRESS = "in_progress", "In Progress"
        READY_FOR_REVIEW = "ready_for_review", "Ready For Review"
        VERIFIED = "verified", "Verified"
        PUBLISHED = "published", "Published"
        LOCKED = "locked", "Locked"

    student = models.ForeignKey(
        "students.Student", on_delete=models.CASCADE, related_name="term_result_publications"
    )
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name="+")
    term = models.ForeignKey(Term, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(
        "users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "term_result_publications"
        ordering = ["-term__sequence"]
        constraints = [
            models.UniqueConstraint(fields=["student", "school_class", "term"], name="unique_term_result_publication"),
        ]

    def __str__(self):
        return f"{self.student} - {self.school_class} - {self.term} - {self.status}"

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id:
            raise ValueError("TermResultPublication.student must belong to the same school")
        if self.school_class.school_id != self.school_id:
            raise ValueError("TermResultPublication.school_class must belong to the same school")
        if self.term.school_id != self.school_id:
            raise ValueError("TermResultPublication.term must belong to the same school")
        super().save(*args, **kwargs)


class SubjectMaterial(TenantScopedModel, TimeStampedModel):
    """Phase 9 (Subjects & Results): a file a subject's teacher shares with its enrolled
    students — notes, slides, worksheets, anything covered by the shared upload allowlist
    (`apps.common.validators.validate_upload_file`, reused rather than duplicated). Visible only
    to students with an actual StudentSubjectEnrollment for this offering — see
    MySubjectMaterialsView, never a raw unauthenticated file URL."""

    subject_offering = models.ForeignKey(SubjectOffering, on_delete=models.CASCADE, related_name="materials")
    title = models.CharField(max_length=200)
    file = models.FileField(upload_to="subject_materials/", validators=[validate_upload_file])
    uploaded_by = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")

    class Meta:
        db_table = "subject_materials"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.subject_offering})"

    def save(self, *args, **kwargs):
        if self.subject_offering.school_id != self.school_id:
            raise ValueError("SubjectMaterial.subject_offering must belong to the same school")
        if self.uploaded_by.school_id != self.school_id:
            raise ValueError("SubjectMaterial.uploaded_by must belong to the same school")
        super().save(*args, **kwargs)


class SubjectMessage(TenantScopedModel, TimeStampedModel):
    """Phase 9: a general broadcast message from a subject's teacher to every one of its
    currently-enrolled students — never a one-to-one conversation (see SubjectPrivateMessage for
    that). `sender` is always the teacher's own user; kept as an explicit FK (not derived from
    subject_offering.main_teacher) so an assistant teacher's messages are attributed correctly."""

    subject_offering = models.ForeignKey(SubjectOffering, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")
    body = models.CharField(max_length=2000)

    class Meta:
        db_table = "subject_messages"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject_offering}: {self.body[:50]}"

    def save(self, *args, **kwargs):
        if self.subject_offering.school_id != self.school_id:
            raise ValueError("SubjectMessage.subject_offering must belong to the same school")
        if self.sender.school_id != self.school_id:
            raise ValueError("SubjectMessage.sender must belong to the same school")
        super().save(*args, **kwargs)


class SubjectPrivateMessage(TenantScopedModel, TimeStampedModel):
    """Phase 9: one message in a private thread between a subject's teacher and exactly one
    specific enrolled student. `student` identifies *which* thread a message belongs to
    (subject_offering + student is the thread key); `sender` is whoever actually wrote this one
    message — either the teacher's user or that same student's own user, since the student can
    reply. Authorization (never trusting a client-supplied student id) is enforced entirely in
    the view layer: sender must be the offering's main/assistant teacher OR `student` itself."""

    subject_offering = models.ForeignKey(SubjectOffering, on_delete=models.CASCADE, related_name="private_messages")
    student = models.ForeignKey(
        "students.Student", on_delete=models.CASCADE, related_name="subject_private_messages"
    )
    sender = models.ForeignKey("users.User", on_delete=models.CASCADE, related_name="+")
    body = models.CharField(max_length=2000)

    class Meta:
        db_table = "subject_private_messages"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.subject_offering} <-> {self.student}: {self.body[:50]}"

    def save(self, *args, **kwargs):
        if self.subject_offering.school_id != self.school_id:
            raise ValueError("SubjectPrivateMessage.subject_offering must belong to the same school")
        if self.student.school_id != self.school_id:
            raise ValueError("SubjectPrivateMessage.student must belong to the same school")
        if self.sender.school_id != self.school_id:
            raise ValueError("SubjectPrivateMessage.sender must belong to the same school")
        super().save(*args, **kwargs)


class StudentEnrollment(TenantScopedModel, TimeStampedModel):
    """Which class (and section) a student belonged to in one academic year — the permanent history that
    `Student.current_class/current_section/current_academic_year` (a pointer to *now*) cannot keep.

    One row per student per year. A student's profile is never duplicated for a new year; a new year gets a new
    enrolment row. Rows are never deleted by a rollover. `outcome` records what happened at the end of the year
    (set when the year is rolled over); it stays blank while the year is in progress."""

    class Source(models.TextChoices):
        ADMISSION = "admission", "Admission"
        ROLLOVER = "rollover", "Year rollover"
        MANUAL = "manual", "Manual"
        BACKFILL_CURRENT = "backfill_current", "Backfilled from the student's current class"
        BACKFILL_PROMOTION = "backfill_promotion", "Backfilled from a promotion record"

    class Outcome(models.TextChoices):
        PROMOTED = "promoted", "Promoted"
        REPEATED = "repeated", "Repeated"
        GRADUATED = "graduated", "Graduated"
        WITHDRAWN = "withdrawn", "Withdrawn"
        TRANSFERRED = "transferred", "Transferred"

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="enrollments")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="enrollments")
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name="enrollments")
    section = models.ForeignKey(Section, null=True, blank=True, on_delete=models.SET_NULL, related_name="enrollments")
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    outcome = models.CharField(max_length=15, choices=Outcome.choices, blank=True)

    class Meta:
        db_table = "student_enrollments"
        ordering = ["-academic_year__start_date", "student__last_name"]
        constraints = [
            models.UniqueConstraint(fields=["student", "academic_year"], name="one_enrollment_per_student_per_year"),
        ]
        indexes = [models.Index(fields=["academic_year", "school_class"])]

    def __str__(self):
        return f"{self.student} - {self.academic_year} - {self.school_class}"

    def save(self, *args, **kwargs):
        for name in ("student", "academic_year", "school_class"):
            if getattr(self, name).school_id != self.school_id:
                raise ValueError(f"StudentEnrollment.{name} must belong to the same school")
        if self.section_id:
            if self.section.school_id != self.school_id:
                raise ValueError("StudentEnrollment.section must belong to the same school")
            if self.section.academic_year_id != self.academic_year_id:
                raise ValueError("StudentEnrollment.section must belong to the enrolment's academic year")
            if self.section.school_class_id != self.school_class_id:
                raise ValueError("StudentEnrollment.section must belong to the enrolment's class")
        super().save(*args, **kwargs)


class RolloverRun(TenantScopedModel, TimeStampedModel):
    """One year-end rollover from `source_year` into `target_year`. There is at most one per pair, so a retried or
    double-clicked request finds the same row instead of creating a second set of enrolments; a completed run is never
    executed again. `summary` holds the completion report; `error` the (sanitised) reason a run failed."""

    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    source_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="+")
    target_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    options = models.JSONField(default=dict, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)
    started_by = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "academic_year_rollovers"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["source_year", "target_year"], name="one_rollover_per_year_pair"),
            models.CheckConstraint(condition=~models.Q(source_year=models.F("target_year")), name="rollover_years_differ"),
        ]

    def __str__(self):
        return f"{self.source_year} -> {self.target_year} ({self.status})"
