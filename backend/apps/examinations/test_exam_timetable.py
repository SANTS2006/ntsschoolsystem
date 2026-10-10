from datetime import date, time

import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.examinations.models import ExamSeat
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    ExamFactory,
    ExamScheduleFactory,
    RoomFactory,
    SchoolFactory,
    StaffFactory,
    StudentFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/examinations"


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def world(settings):
    settings.BACKGROUND_TASKS_ASYNC = False
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    director = UserFactory(school=school)
    assign_role(user=director, role=Role.unscoped_objects.get(school=school, slug="exams-director"))
    exam = ExamFactory(school=school)
    paper = ExamScheduleFactory(school=school, exam=exam, date=date(2025, 11, 3), start_time=time(9, 0), end_time=time(11, 0))
    students = []
    for _ in range(3):
        st = StudentFactory(school=school, current_class=paper.school_class, status="active")
        st.user = UserFactory(school=school)
        st.save(update_fields=["user"])
        students.append(st)
    invigilator = StaffFactory(school=school)
    assign_role(user=invigilator.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    room = RoomFactory(school=school, capacity=2)
    return {"school": school, "director": director, "exam": exam, "paper": paper, "students": students, "invigilator": invigilator, "room": room}


def _assign(api_client, w, **extra):
    return api_client.post(
        f"{BASE}/schedules/{w['paper'].id}/rooms/",
        {"room": str(w["room"].id), "invigilators": [str(w["invigilator"].id)], "auto_seat": True, **extra},
        format="json",
    )


def test_exams_director_assigns_room_invigilator_and_seats_up_to_capacity(api_client, world):
    _login(api_client, world["director"])
    response = _assign(api_client, world)
    assert response.status_code == 200, response.data
    room = response.data["schedule"]["rooms"][0]
    assert room["seated"] == 2 and room["capacity"] == 2  # 3 students, room of 2
    assert room["invigilators"][0]["name"] == world["invigilator"].user.full_name


def test_second_room_takes_the_remaining_students_and_each_has_one_seat(api_client, world):
    _login(api_client, world["director"])
    _assign(api_client, world)
    room2 = RoomFactory(school=world["school"], capacity=5)
    other = StaffFactory(school=world["school"])
    r = api_client.post(
        f"{BASE}/schedules/{world['paper'].id}/rooms/",
        {"room": str(room2.id), "invigilators": [str(other.id)], "auto_seat": True},
        format="json",
    )
    assert r.status_code == 200, r.data
    assert ExamSeat.unscoped_objects.filter(exam_schedule=world["paper"]).count() == 3
    assert ExamSeat.unscoped_objects.filter(exam_schedule=world["paper"]).values("student").distinct().count() == 3


def test_a_room_or_invigilator_cannot_be_double_booked(api_client, world):
    _login(api_client, world["director"])
    _assign(api_client, world)
    clash = ExamScheduleFactory(
        school=world["school"], exam=world["exam"], date=date(2025, 11, 3), start_time=time(10, 0), end_time=time(12, 0)
    )
    same_room = api_client.post(
        f"{BASE}/schedules/{clash.id}/rooms/",
        {"room": str(world["room"].id), "invigilators": [], "auto_seat": False},
        format="json",
    )
    assert same_room.status_code == 400 and "already used" in same_room.data["message"]
    same_person = api_client.post(
        f"{BASE}/schedules/{clash.id}/rooms/",
        {"room": str(RoomFactory(school=world["school"]).id), "invigilators": [str(world["invigilator"].id)], "auto_seat": False},
        format="json",
    )
    assert same_person.status_code == 400 and "already invigilating" in same_person.data["message"]


def test_publish_needs_a_complete_timetable_then_students_and_invigilators_see_it(api_client, world):
    _login(api_client, world["director"])
    incomplete = api_client.post(f"{BASE}/exams/{world['exam'].id}/timetable/publish/")
    assert incomplete.status_code == 400 and incomplete.data["code"] == "TIMETABLE_INCOMPLETE"

    _assign(api_client, world)
    room2 = RoomFactory(school=world["school"], capacity=5)
    api_client.post(
        f"{BASE}/schedules/{world['paper'].id}/rooms/",
        {"room": str(room2.id), "invigilators": [str(StaffFactory(school=world["school"]).id)], "auto_seat": True},
        format="json",
    )
    # nobody sees it before publishing
    _login(api_client, world["students"][0].user)
    assert api_client.get(f"{BASE}/my-timetable/").data["rows"] == []

    _login(api_client, world["director"])
    ok = api_client.post(f"{BASE}/exams/{world['exam'].id}/timetable/publish/")
    assert ok.status_code == 200, ok.data

    _login(api_client, world["students"][0].user)
    row = api_client.get(f"{BASE}/my-timetable/").data["rows"][0]
    assert row["subject"] == world["paper"].subject.name and row["start_time"] == "09:00" and row["room"]
    assert row["invigilators"]

    _login(api_client, world["invigilator"].user)
    duties = api_client.get(f"{BASE}/my-timetable/").data
    assert duties["kind"] == "staff" and duties["rows"][0]["room"] == world["room"].name

    _login(api_client, world["director"])
    api_client.post(f"{BASE}/exams/{world['exam'].id}/timetable/unpublish/")
    _login(api_client, world["students"][0].user)
    assert api_client.get(f"{BASE}/my-timetable/").data["rows"] == []


def test_teacher_and_student_cannot_build_the_exam_timetable(api_client, world):
    _login(api_client, world["invigilator"].user)
    assert _assign(api_client, world).status_code == 403
    assert api_client.post(f"{BASE}/exams/{world['exam'].id}/timetable/publish/").status_code == 403
    _login(api_client, world["students"][0].user)
    assert _assign(api_client, world).status_code == 403


def test_exams_director_has_ca_and_exam_timetable_but_no_class_timetable_or_attendance(world):
    from apps.authorization.services import get_user_permission_codes

    codes = get_user_permission_codes(world["director"])
    assert {"ca.manage", "exam_timetable.view", "exam_timetable.publish"} <= codes
    assert not any(c.startswith(("timetable.", "staff_attendance.", "attendance.")) for c in codes)
    admin = UserFactory(school=world["school"])
    assign_role(user=admin, role=Role.unscoped_objects.get(school=world["school"], slug="school-administrator"))
    admin_codes = get_user_permission_codes(admin)
    assert "ca.manage" in admin_codes and "timetable.create" in admin_codes and "exam_timetable.view" not in admin_codes
