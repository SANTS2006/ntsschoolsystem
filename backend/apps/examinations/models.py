from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel


class GradingScale(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "grading_scales"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_grading_scale_name_per_school"),
        ]

    def __str__(self):
        return self.name


class GradeBoundary(TenantScopedModel):
    grading_scale = models.ForeignKey(GradingScale, on_delete=models.CASCADE, related_name="boundaries")
    grade = models.CharField(max_length=5)  # "A", "B+", "F"
    min_score = models.DecimalField(max_digits=5, decimal_places=2)
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    gpa_value = models.DecimalField(max_digits=3, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "grade_boundaries"
        ordering = ["-min_score"]
        constraints = [
            models.UniqueConstraint(
                fields=["grading_scale", "grade"], name="unique_grade_per_scale"
            ),
            models.CheckConstraint(
                condition=models.Q(max_score__gt=models.F("min_score")), name="grade_boundary_max_gt_min"
            ),
        ]

    def __str__(self):
        return f"{self.grading_scale.name}: {self.grade}"

    def save(self, *args, **kwargs):
        if self.grading_scale.school_id != self.school_id:
            raise ValueError("GradeBoundary.school must match grading_scale.school")
        super().save(*args, **kwargs)


class Exam(TenantScopedModel, TimeStampedModel):
    class ExamType(models.TextChoices):
        EXAM = "exam", "Exam"
        TEST = "test", "Test"
        QUIZ = "quiz", "Quiz"
        CONTINUOUS_ASSESSMENT = "continuous_assessment", "Continuous Assessment"
        PRACTICAL = "practical", "Practical"

    name = models.CharField(max_length=150)
    exam_type = models.CharField(max_length=30, choices=ExamType.choices, default=ExamType.EXAM)
    term = models.ForeignKey("academics.Term", on_delete=models.CASCADE, related_name="exams")
    grading_scale = models.ForeignKey(
        GradingScale, null=True, blank=True, on_delete=models.SET_NULL, related_name="exams"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    # The exam timetable (date, time, room, invigilators, seating) is only visible to students and invigilators once
    # the Exams Director has published it.
    timetable_published = models.BooleanField(default=False)
    timetable_published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "exams"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(fields=["term", "name"], name="unique_exam_name_per_term"),
            models.CheckConstraint(
                condition=models.Q(end_date__gte=models.F("start_date")), name="exam_end_after_start"
            ),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.term.school_id != self.school_id:
            raise ValueError("Exam.school must match term.school")
        if self.grading_scale_id and self.grading_scale.school_id != self.school_id:
            raise ValueError("Exam.grading_scale must belong to the same school")
        super().save(*args, **kwargs)


class ExamSchedule(TenantScopedModel, TimeStampedModel):
    """One subject's sitting within an Exam, for one class."""

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="schedules")
    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.CASCADE, related_name="+")
    subject = models.ForeignKey("academics.Subject", on_delete=models.CASCADE, related_name="+")
    max_score = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    date = models.DateField(null=True, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)

    class Meta:
        db_table = "exam_schedules"
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(
                fields=["exam", "school_class", "subject"], name="unique_exam_class_subject"
            ),
        ]

    def __str__(self):
        return f"{self.exam.name} - {self.school_class.name} - {self.subject.name}"

    def save(self, *args, **kwargs):
        if self.exam.school_id != self.school_id:
            raise ValueError("ExamSchedule.school must match exam.school")
        if self.school_class.school_id != self.school_id:
            raise ValueError("ExamSchedule.school_class must belong to the same school")
        if self.subject.school_id != self.school_id:
            raise ValueError("ExamSchedule.subject must belong to the same school")
        super().save(*args, **kwargs)


class ExamRoomAssignment(TenantScopedModel, TimeStampedModel):
    """One room used for one paper (ExamSchedule): who supervises it and which students sit in it."""

    exam_schedule = models.ForeignKey(ExamSchedule, on_delete=models.CASCADE, related_name="room_assignments")
    room = models.ForeignKey("timetable.Room", on_delete=models.PROTECT, related_name="+")
    invigilators = models.ManyToManyField("staff.Staff", blank=True, related_name="exam_invigilations")

    class Meta:
        db_table = "exam_room_assignments"
        ordering = ["room__name"]
        constraints = [
            models.UniqueConstraint(fields=["exam_schedule", "room"], name="unique_room_per_exam_schedule"),
        ]

    def __str__(self):
        return f"{self.exam_schedule} - {self.room}"

    def save(self, *args, **kwargs):
        if self.exam_schedule.school_id != self.school_id or self.room.school_id != self.school_id:
            raise ValueError("ExamRoomAssignment must belong to the same school as its paper and room")
        super().save(*args, **kwargs)


class ExamSeat(TenantScopedModel, TimeStampedModel):
    """A student's place in a room for a paper. A student has at most one seat per paper."""

    room_assignment = models.ForeignKey(ExamRoomAssignment, on_delete=models.CASCADE, related_name="seats")
    exam_schedule = models.ForeignKey(ExamSchedule, on_delete=models.CASCADE, related_name="seats")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="exam_seats")
    seat_number = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "exam_seats"
        ordering = ["seat_number"]
        constraints = [
            models.UniqueConstraint(fields=["exam_schedule", "student"], name="one_seat_per_student_per_paper"),
        ]

    def save(self, *args, **kwargs):
        if self.student.school_id != self.school_id or self.room_assignment.school_id != self.school_id:
            raise ValueError("ExamSeat must belong to the same school as its student and room")
        super().save(*args, **kwargs)


class Result(TenantScopedModel, TimeStampedModel):
    """
    Lifecycle: draft -> submitted -> reviewed -> approved -> published -> locked.
    Score/comment are freely editable while draft/submitted/reviewed; once
    approved they only change through the transition actions
    (ResultViewSet.submit/review/approve/publish/lock) or, once locked,
    through the dedicated `correct` action — never a plain PATCH. See
    apps.examinations.views.ResultViewSet.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        REVIEWED = "reviewed", "Reviewed"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        LOCKED = "locked", "Locked"

    exam_schedule = models.ForeignKey(ExamSchedule, on_delete=models.CASCADE, related_name="results")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="results")
    # exam_score: the raw exam-portion score entered by the Exams Director, out of
    # exam_schedule.max_score — the only one of these three fields a caller ever writes directly
    # (see apps.examinations.services.enter_exam_score). ca_score: a snapshot (0-100 scale) of the
    # subject's weighted-assignment average at the moment exam_score was entered — never
    # recomputed live afterward, so a published grade can't silently drift if a teacher edits an
    # old assignment's grade later. score: the auto-combined final value (unchanged field name/
    # role from before this split) = ca_score*subject.ca_weight_percent/100 +
    # (exam_score/exam_schedule.max_score*100)*subject.exam_weight_percent/100 — left null until
    # both components exist, so an incomplete grade is never silently published (see
    # enter_exam_score's docstring for the exact rule).
    exam_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    ca_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    grade = models.CharField(max_length=5, blank=True)
    teacher_comment = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "results"
        ordering = ["student__last_name", "student__first_name"]
        constraints = [
            models.UniqueConstraint(
                fields=["exam_schedule", "student"], name="unique_result_per_student_exam_schedule"
            ),
        ]

    def __str__(self):
        return f"{self.student} - {self.exam_schedule} - {self.score}"

    def save(self, *args, **kwargs):
        if self.exam_schedule.school_id != self.school_id:
            raise ValueError("Result.school must match exam_schedule.school")
        if self.student.school_id != self.school_id:
            raise ValueError("Result.student must belong to the same school")
        self.grade = self.compute_grade()
        super().save(*args, **kwargs)

    def compute_grade(self):
        """Looks up the matching GradeBoundary on the exam's grading scale, if any."""
        if self.score is None:
            return ""
        scale = self.exam_schedule.exam.grading_scale
        if scale is None:
            return ""
        boundary = scale.boundaries.filter(
            min_score__lte=self.score, max_score__gte=self.score
        ).first()
        return boundary.grade if boundary else ""
