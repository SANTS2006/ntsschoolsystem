"""The exam timetable: when each paper is sat, in which rooms, who invigilates and where each student sits — built by the
Exams Director, and only visible to students and invigilators once published."""

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedAPIView
from apps.notifications.services import notify_bulk
from apps.tenants.services import get_current_school

from .models import Exam, ExamRoomAssignment, ExamSchedule, ExamSeat


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


def _error(message, code="VALIDATION_ERROR", http_status=status.HTTP_400_BAD_REQUEST, errors=None):
    return Response(
        {"success": False, "message": message, "code": code, "errors": errors or [{"field": None, "message": message}]},
        status=http_status,
    )


def _overlap(a_start, a_end, b_start, b_end) -> bool:
    return a_start < b_end and b_start < a_end


# ---- reading ----------------------------------------------------------------------------------------


def schedule_payload(schedule: ExamSchedule) -> dict:
    rooms = []
    for assignment in schedule.room_assignments.all():
        rooms.append(
            {
                "id": str(assignment.id),
                "room": str(assignment.room_id),
                "room_name": assignment.room.name,
                "capacity": assignment.room.capacity,
                "seated": len(assignment.seats.all()),
                "invigilators": [
                    {"id": str(s.id), "name": s.user.full_name} for s in assignment.invigilators.all()
                ],
            }
        )
    seated_total = sum(r["seated"] for r in rooms)
    return {
        "id": str(schedule.id),
        "exam": str(schedule.exam_id),
        "school_class": str(schedule.school_class_id),
        "school_class_name": schedule.school_class.name,
        "subject_name": schedule.subject.name,
        "date": schedule.date.isoformat() if schedule.date else None,
        "start_time": schedule.start_time.strftime("%H:%M") if schedule.start_time else None,
        "end_time": schedule.end_time.strftime("%H:%M") if schedule.end_time else None,
        "rooms": rooms,
        "seated": seated_total,
    }


def _eligible_students(schedule: ExamSchedule):
    from apps.students.models import Student

    return Student.unscoped_objects.filter(
        school=schedule.school, status=Student.Status.ACTIVE, current_class_id=schedule.school_class_id
    )


def exam_timetable(exam: Exam) -> dict:
    schedules = list(
        ExamSchedule.unscoped_objects.filter(school=exam.school, exam=exam)
        .select_related("school_class", "subject")
        .prefetch_related("room_assignments__room", "room_assignments__invigilators__user", "room_assignments__seats")
        .order_by("date", "start_time", "school_class__order")
    )
    rows = []
    for schedule in schedules:
        payload = schedule_payload(schedule)
        payload["students"] = _eligible_students(schedule).count()
        rows.append(payload)
    return {
        "exam": {
            "id": str(exam.id),
            "name": exam.name,
            "start_date": exam.start_date.isoformat(),
            "end_date": exam.end_date.isoformat(),
            "published": exam.timetable_published,
            "published_at": exam.timetable_published_at.isoformat() if exam.timetable_published_at else None,
        },
        "schedules": rows,
    }


def timetable_problems(exam: Exam) -> list[str]:
    """What stops this timetable from being published."""
    problems = []
    schedules = ExamSchedule.unscoped_objects.filter(school=exam.school, exam=exam).select_related("school_class", "subject")
    if not schedules.exists():
        return ["This exam has no papers yet."]
    for schedule in schedules:
        label = f"{schedule.school_class.name} · {schedule.subject.name}"
        if schedule.date is None or schedule.start_time is None or schedule.end_time is None:
            problems.append(f"{label}: set the date and start/end time.")
            continue
        assignments = list(schedule.room_assignments.prefetch_related("invigilators", "seats"))
        if not assignments:
            problems.append(f"{label}: assign at least one room.")
            continue
        if any(a.invigilators.count() == 0 for a in assignments):
            problems.append(f"{label}: every room needs at least one invigilator.")
        students = _eligible_students(schedule).count()
        seated = sum(a.seats.count() for a in assignments)
        if seated < students:
            problems.append(f"{label}: {students - seated} student(s) have no seat yet.")
    return problems


# ---- changing ---------------------------------------------------------------------------------------


def assign_room(schedule: ExamSchedule, room, invigilators, *, auto_seat: bool) -> ExamRoomAssignment:
    """Puts a paper in a room with its invigilators and (optionally) seats the class's unseated students there.
    Refuses double-booking a room or an invigilator at an overlapping time."""
    if schedule.date is None or schedule.start_time is None or schedule.end_time is None:
        raise serializers.ValidationError("Set the paper's date and start/end time before assigning a room.")
    if not schedule.end_time > schedule.start_time:
        raise serializers.ValidationError("The end time must be after the start time.")
    if room.school_id != schedule.school_id:
        raise serializers.ValidationError("That room doesn't belong to your school.")

    others = ExamRoomAssignment.unscoped_objects.filter(
        school=schedule.school, exam_schedule__date=schedule.date
    ).exclude(exam_schedule=schedule).select_related("exam_schedule", "room")
    for other in others:
        if other.exam_schedule.start_time is None:
            continue
        if not _overlap(schedule.start_time, schedule.end_time, other.exam_schedule.start_time, other.exam_schedule.end_time):
            continue
        if other.room_id == room.id:
            raise serializers.ValidationError(
                f"{room.name} is already used by {other.exam_schedule.school_class.name} · {other.exam_schedule.subject.name} "
                f"at that time."
            )
        clash = [s for s in invigilators if other.invigilators.filter(pk=s.pk).exists()]
        if clash:
            raise serializers.ValidationError(
                f"{clash[0].user.full_name} is already invigilating {other.exam_schedule.school_class.name} · "
                f"{other.exam_schedule.subject.name} at that time."
            )
    for staff in invigilators:
        if staff.school_id != schedule.school_id:
            raise serializers.ValidationError("An invigilator doesn't belong to your school.")

    with transaction.atomic():
        assignment, _ = ExamRoomAssignment.objects.get_or_create(
            exam_schedule=schedule, room=room, defaults={"school": schedule.school}
        )
        assignment.invigilators.set(invigilators)
        if auto_seat:
            seat_unseated_students(assignment)
    return assignment


def seat_unseated_students(assignment: ExamRoomAssignment) -> int:
    """Seats the class's students who have no seat for this paper yet, up to the room's capacity."""
    schedule = assignment.exam_schedule
    seated_ids = set(ExamSeat.unscoped_objects.filter(exam_schedule=schedule).values_list("student_id", flat=True))
    taken = assignment.seats.count()
    room_left = max(assignment.room.capacity - taken, 0)
    students = [s for s in _eligible_students(schedule).order_by("last_name", "first_name") if s.id not in seated_ids][:room_left]
    next_number = taken + 1
    ExamSeat.objects.bulk_create(
        [
            ExamSeat(school=schedule.school, room_assignment=assignment, exam_schedule=schedule, student=s, seat_number=next_number + i)
            for i, s in enumerate(students)
        ]
    )
    return len(students)


def publish(exam: Exam, *, publish_it: bool) -> None:
    exam.timetable_published = publish_it
    exam.timetable_published_at = timezone.now() if publish_it else None
    exam.save(update_fields=["timetable_published", "timetable_published_at", "updated_at"])
    if not publish_it:
        return
    # Tell the students who sit it and the staff who invigilate it. In-app only; the details are on the timetable page.
    seats = ExamSeat.unscoped_objects.filter(school=exam.school, exam_schedule__exam=exam).select_related("student__user")
    student_users = {s.student.user for s in seats if s.student.user_id}
    notify_bulk(
        recipients=student_users,
        category="examination",
        title=f"Exam timetable published: {exam.name}",
        message="Your exam dates, times, rooms and seats are now available.",
        link="/my-exam-timetable",
    )
    staff_users = {
        staff.user
        for a in ExamRoomAssignment.unscoped_objects.filter(school=exam.school, exam_schedule__exam=exam).prefetch_related("invigilators__user")
        for staff in a.invigilators.all()
    }
    notify_bulk(
        recipients=staff_users,
        category="examination",
        title=f"You are invigilating: {exam.name}",
        message="The exam timetable is published. See your invigilation duties.",
        link="/my-exam-timetable",
    )


# ---- endpoints --------------------------------------------------------------------------------------


class _Perm(TenantScopedAPIView):
    code = "exam_timetable.view"

    def get_permissions(self):
        return [require_permission(self.code)()]


def _exam_or_404(pk):
    return Exam.objects.select_related("school").filter(pk=pk).first()


class ExamTimetableView(_Perm):
    """GET /examinations/exams/<id>/timetable/ — every paper with its rooms, invigilators and seating."""

    code = "exam_timetable.view"

    def get(self, request, pk):
        exam = _exam_or_404(pk)
        if exam is None:
            return _error("Exam not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        return _ok(timetable=exam_timetable(exam))


class ExamTimetablePublishView(_Perm):
    """POST /examinations/exams/<id>/timetable/publish/ and .../unpublish/ ."""

    code = "exam_timetable.publish"

    def post(self, request, pk, action):
        exam = _exam_or_404(pk)
        if exam is None:
            return _error("Exam not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        if action == "publish":
            problems = timetable_problems(exam)
            if problems:
                return _error(
                    "The timetable isn't ready to publish.",
                    "TIMETABLE_INCOMPLETE",
                    errors=[{"field": None, "message": p} for p in problems],
                )
            publish(exam, publish_it=True)
            return _ok("Exam timetable published.", timetable=exam_timetable(exam))
        publish(exam, publish_it=False)
        return _ok("Exam timetable withdrawn.", timetable=exam_timetable(exam))


class ExamTimetableOptionsView(_Perm):
    """GET /examinations/timetable-options/ — the rooms and invigilators that can be picked."""

    code = "exam_timetable.view"

    def get(self, request):
        from apps.authorization.models import UserRole
        from apps.staff.models import Staff
        from apps.timetable.models import Room

        school = get_current_school()
        teacher_user_ids = set(
            UserRole.unscoped_objects.filter(role__school=school, role__slug="teacher", role__is_active=True).values_list("user_id", flat=True)
        )
        staff = Staff.unscoped_objects.filter(school=school, employment_status=Staff.EmploymentStatus.ACTIVE).select_related("user")
        pool = [s for s in staff if s.user_id in teacher_user_ids] or list(staff)
        return _ok(
            rooms=[{"id": str(r.id), "name": r.name, "capacity": r.capacity} for r in Room.objects.all()],
            invigilators=[{"id": str(s.id), "name": s.user.full_name} for s in sorted(pool, key=lambda s: s.user.full_name)],
        )


class ExamScheduleRoomsView(_Perm):
    """POST /examinations/schedules/<id>/rooms/ {room, invigilators: [staff ids], auto_seat}; DELETE .../rooms/<assignment>/ ."""

    code = "exam_timetable.update"

    def post(self, request, pk):
        from apps.staff.models import Staff
        from apps.timetable.models import Room

        schedule = ExamSchedule.objects.select_related("exam", "school_class", "subject", "school").filter(pk=pk).first()
        if schedule is None:
            return _error("Paper not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        room = Room.objects.filter(pk=str(request.data.get("room", ""))).first()
        if room is None:
            return _error("Choose a room.")
        staff_ids = [str(i) for i in (request.data.get("invigilators") or [])]
        invigilators = list(Staff.objects.filter(pk__in=staff_ids).select_related("user"))
        if len(invigilators) != len(set(staff_ids)):
            return _error("One of the invigilators was not found.")
        try:
            assignment = assign_room(schedule, room, invigilators, auto_seat=bool(request.data.get("auto_seat", True)))
        except serializers.ValidationError as exc:
            return _error(" ".join(str(m) for m in exc.detail))
        schedule = (
            ExamSchedule.objects.select_related("school_class", "subject")
            .prefetch_related("room_assignments__room", "room_assignments__invigilators__user", "room_assignments__seats")
            .get(pk=schedule.pk)
        )
        return _ok("Room assigned.", schedule=schedule_payload(schedule), assignment=str(assignment.id))

    def delete(self, request, pk, assignment_id):
        deleted, _ = ExamRoomAssignment.objects.filter(pk=assignment_id, exam_schedule_id=pk).delete()
        if not deleted:
            return _error("Room assignment not found.", "NOT_FOUND", status.HTTP_404_NOT_FOUND)
        return _ok("Room removed from this paper.")

    def get_permissions(self):
        code = "exam_timetable.delete" if self.request.method == "DELETE" else "exam_timetable.update"
        return [require_permission(code)()]


class MyExamTimetableView(TenantScopedAPIView):
    """GET /examinations/my-timetable/ — what the signed-in student sits, or what the signed-in staff member invigilates.
    Only exams whose timetable the Exams Director has published; never anyone else's seat or duties."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        student = getattr(user, "student_profile", None)
        rows = []
        if student is not None:
            seats = (
                ExamSeat.objects.filter(student=student, exam_schedule__exam__timetable_published=True)
                .select_related("exam_schedule__exam", "exam_schedule__subject", "room_assignment__room")
                .prefetch_related("room_assignment__invigilators__user")
                .order_by("exam_schedule__date", "exam_schedule__start_time")
            )
            for seat in seats:
                sch = seat.exam_schedule
                rows.append(
                    {
                        "exam": sch.exam.name,
                        "subject": sch.subject.name,
                        "date": sch.date.isoformat() if sch.date else None,
                        "start_time": sch.start_time.strftime("%H:%M") if sch.start_time else None,
                        "end_time": sch.end_time.strftime("%H:%M") if sch.end_time else None,
                        "room": seat.room_assignment.room.name,
                        "seat_number": seat.seat_number,
                        "invigilators": [s.user.full_name for s in seat.room_assignment.invigilators.all()],
                    }
                )
            return _ok(kind="student", rows=rows)
        staff = getattr(user, "staff_profile", None)
        if staff is None:
            return _ok(kind="none", rows=[])
        duties = (
            ExamRoomAssignment.objects.filter(invigilators=staff, exam_schedule__exam__timetable_published=True)
            .select_related("exam_schedule__exam", "exam_schedule__subject", "exam_schedule__school_class", "room")
            .prefetch_related("invigilators__user", "seats")
            .order_by("exam_schedule__date", "exam_schedule__start_time")
        )
        for duty in duties:
            sch = duty.exam_schedule
            rows.append(
                {
                    "exam": sch.exam.name,
                    "subject": sch.subject.name,
                    "class": sch.school_class.name,
                    "date": sch.date.isoformat() if sch.date else None,
                    "start_time": sch.start_time.strftime("%H:%M") if sch.start_time else None,
                    "end_time": sch.end_time.strftime("%H:%M") if sch.end_time else None,
                    "room": duty.room.name,
                    "students": duty.seats.count(),
                    "invigilators": [s.user.full_name for s in duty.invigilators.all()],
                }
            )
        return _ok(kind="staff", rows=rows)
