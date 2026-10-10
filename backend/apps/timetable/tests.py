import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    PeriodFactory,
    RoomFactory,
    SchoolFactory,
    SectionFactory,
    StaffFactory,
    StudentFactory,
    TimetableEntryFactory,
    UserFactory,
)

from .models import TimetableEntry

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _principal():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    return school, principal


class TestTimetableEntryCreate:
    def test_principal_can_create_entry(self, api_client):
        school, principal = _principal()
        section = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {"section": str(section.id), "day_of_week": "monday", "period": str(period.id)},
            format="json",
        )
        assert response.status_code == 201

    def test_entry_without_teacher_or_room_is_valid(self, api_client):
        """
        Regression: DRF auto-generates a UniqueTogetherValidator from the
        partial unique constraints on (teacher, day, period) and (room, day,
        period), which incorrectly forces the nullable `teacher`/`room`
        fields to required=True — breaking exactly this case (e.g. a private
        study period with no assigned teacher or room). Meta.validators = []
        on the serializer disables the buggy auto-validator in favor of the
        explicit validate() above.
        """
        school, principal = _principal()
        section = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {"section": str(section.id), "day_of_week": "monday", "period": str(period.id)},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["teacher"] is None
        assert response.data["room"] is None

    def test_teacher_without_permission_cannot_create(self, api_client):
        school, _ = _principal()
        section = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {"section": str(section.id), "day_of_week": "monday", "period": str(period.id)},
            format="json",
        )
        assert response.status_code == 403

    def test_cannot_schedule_a_lesson_for_a_section_in_an_archived_year(self, api_client):
        from tests.factories import AcademicYearFactory

        school, principal = _principal()
        year = AcademicYearFactory(school=school, is_current=False, is_archived=True)
        section = SectionFactory(school=school, academic_year=year)
        period = PeriodFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {"section": str(section.id), "day_of_week": "monday", "period": str(period.id)},
            format="json",
        )
        assert response.status_code == 400


class TestConflictPrevention:
    def test_cannot_double_book_same_section_day_period(self, api_client):
        school, principal = _principal()
        section = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        TimetableEntryFactory(school=school, section=section, period=period, day_of_week="monday")
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {"section": str(section.id), "day_of_week": "monday", "period": str(period.id)},
            format="json",
        )
        assert response.status_code == 400
        assert response.data["errors"][0]["field"] == "section"

    def test_cannot_double_book_teacher(self, api_client):
        school, principal = _principal()
        period = PeriodFactory(school=school)
        teacher = StaffFactory(school=school)
        section_a = SectionFactory(school=school)
        section_b = SectionFactory(school=school)
        TimetableEntryFactory(
            school=school, section=section_a, period=period, day_of_week="monday", teacher=teacher
        )
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {
                "section": str(section_b.id),
                "day_of_week": "monday",
                "period": str(period.id),
                "teacher": str(teacher.id),
            },
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_double_book_room(self, api_client):
        school, principal = _principal()
        period = PeriodFactory(school=school)
        room = RoomFactory(school=school)
        section_a = SectionFactory(school=school)
        section_b = SectionFactory(school=school)
        TimetableEntryFactory(
            school=school, section=section_a, period=period, day_of_week="monday", room=room
        )
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {
                "section": str(section_b.id),
                "day_of_week": "monday",
                "period": str(period.id),
                "room": str(room.id),
            },
            format="json",
        )
        assert response.status_code == 400

    def test_same_teacher_different_period_is_fine(self, api_client):
        school, principal = _principal()
        period_a = PeriodFactory(school=school, order=1)
        period_b = PeriodFactory(school=school, order=2)
        teacher = StaffFactory(school=school)
        section = SectionFactory(school=school)
        TimetableEntryFactory(
            school=school, section=section, period=period_a, day_of_week="monday", teacher=teacher
        )
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/",
            {
                "section": str(section.id),
                "day_of_week": "monday",
                "period": str(period_b.id),
                "teacher": str(teacher.id),
            },
            format="json",
        )
        assert response.status_code == 201


class TestTimetableTenantIsolation:
    def test_cannot_list_another_schools_entries(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        TimetableEntryFactory(school=school_b)
        entry_a = TimetableEntryFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/timetable/entries/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(entry_a.id) in ids_seen
        assert len(ids_seen) == 1

    def test_cannot_reference_another_schools_teacher(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        teacher_b = StaffFactory(school=school_b)
        section_a = SectionFactory(school=school_a)
        period_a = PeriodFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.post(
            "/api/v1/timetable/entries/",
            {
                "section": str(section_a.id),
                "day_of_week": "monday",
                "period": str(period_a.id),
                "teacher": str(teacher_b.id),
            },
            format="json",
        )
        assert response.status_code == 400


class TestBulkCreate:
    def test_creates_every_entry_in_one_request(self, api_client):
        school, principal = _principal()
        section = SectionFactory(school=school)
        period_a = PeriodFactory(school=school, order=1)
        period_b = PeriodFactory(school=school, order=2)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/bulk-create/",
            {
                "entries": [
                    {"section": str(section.id), "day_of_week": "monday", "period": str(period_a.id)},
                    {"section": str(section.id), "day_of_week": "monday", "period": str(period_b.id)},
                ]
            },
            format="json",
        )
        assert response.status_code == 201
        assert len(response.data) == 2
        assert TimetableEntry.unscoped_objects.filter(section=section).count() == 2

    def test_rejects_whole_batch_if_any_row_conflicts_with_existing_entry(self, api_client):
        school, principal = _principal()
        section = SectionFactory(school=school)
        period_a = PeriodFactory(school=school, order=1)
        period_b = PeriodFactory(school=school, order=2)
        TimetableEntryFactory(school=school, section=section, period=period_a, day_of_week="monday")
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/bulk-create/",
            {
                "entries": [
                    {"section": str(section.id), "day_of_week": "monday", "period": str(period_a.id)},
                    {"section": str(section.id), "day_of_week": "monday", "period": str(period_b.id)},
                ]
            },
            format="json",
        )
        assert response.status_code == 400
        assert any(e["field"] == "entries[0].section" for e in response.data["errors"])
        # Nothing committed — the second (otherwise-valid) row must not have been saved either.
        assert TimetableEntry.unscoped_objects.filter(section=section, period=period_b).count() == 0

    def test_rejects_two_rows_in_the_same_batch_double_booking_a_teacher(self, api_client):
        school, principal = _principal()
        section_a = SectionFactory(school=school)
        section_b = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        teacher = StaffFactory(school=school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/bulk-create/",
            {
                "entries": [
                    {
                        "section": str(section_a.id),
                        "day_of_week": "monday",
                        "period": str(period.id),
                        "teacher": str(teacher.id),
                    },
                    {
                        "section": str(section_b.id),
                        "day_of_week": "monday",
                        "period": str(period.id),
                        "teacher": str(teacher.id),
                    },
                ]
            },
            format="json",
        )
        assert response.status_code == 400
        assert TimetableEntry.unscoped_objects.filter(teacher=teacher).count() == 0

    def test_teacher_without_permission_cannot_bulk_create(self, api_client):
        school, _ = _principal()
        section = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        teacher_user = UserFactory(school=school)
        assign_role(user=teacher_user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher_user)

        response = api_client.post(
            "/api/v1/timetable/entries/bulk-create/",
            {"entries": [{"section": str(section.id), "day_of_week": "monday", "period": str(period.id)}]},
            format="json",
        )
        assert response.status_code == 403


class TestCopySection:
    def test_copies_entries_to_target_section(self, api_client):
        school, principal = _principal()
        from_section = SectionFactory(school=school)
        to_section = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        teacher = StaffFactory(school=school)
        room = RoomFactory(school=school)
        TimetableEntryFactory(
            school=school,
            section=from_section,
            period=period,
            day_of_week="monday",
            teacher=teacher,
            room=room,
        )
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/copy/",
            {"from_section": str(from_section.id), "to_section": str(to_section.id)},
            format="json",
        )
        assert response.status_code == 201
        assert len(response.data["created"]) == 1
        assert response.data["skipped"] == []
        copied = TimetableEntry.unscoped_objects.get(section=to_section)
        # Teacher/room are deliberately dropped, not copied — a parallel section's lesson
        # happens at the exact same day/period as the source, so it can never share the
        # source's teacher or room (that's a guaranteed unique_*_day_period conflict); only the
        # subject and slot make sense to carry over.
        assert copied.teacher_id is None
        assert copied.room_id is None

    def test_skips_a_slot_the_target_section_already_has_filled(self, api_client):
        school, principal = _principal()
        from_section = SectionFactory(school=school)
        to_section = SectionFactory(school=school)
        period = PeriodFactory(school=school)
        TimetableEntryFactory(school=school, section=from_section, period=period, day_of_week="monday")
        # The target section already has its own lesson in this exact slot — copying must skip
        # it (report it back as skipped) rather than silently overwriting it.
        existing = TimetableEntryFactory(school=school, section=to_section, period=period, day_of_week="monday")
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/copy/",
            {"from_section": str(from_section.id), "to_section": str(to_section.id)},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["created"] == []
        assert len(response.data["skipped"]) == 1
        assert TimetableEntry.unscoped_objects.filter(pk=existing.pk).exists()

    def test_replace_clears_target_section_first(self, api_client):
        school, principal = _principal()
        from_section = SectionFactory(school=school)
        to_section = SectionFactory(school=school)
        TimetableEntryFactory(school=school, section=from_section, day_of_week="monday")
        stale_entry = TimetableEntryFactory(school=school, section=to_section, day_of_week="tuesday")
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/timetable/entries/copy/",
            {"from_section": str(from_section.id), "to_section": str(to_section.id), "replace": True},
            format="json",
        )
        assert response.status_code == 201
        assert not TimetableEntry.unscoped_objects.filter(pk=stale_entry.pk).exists()
        assert TimetableEntry.unscoped_objects.filter(section=to_section).count() == 1


class TestMyTimetable:
    def test_teacher_sees_own_lessons_only(self, api_client):
        school, _ = _principal()
        staff = StaffFactory(school=school)
        TimetableEntryFactory(school=school, teacher=staff)
        TimetableEntryFactory(school=school)  # someone else's lesson

        _login(api_client, staff.user)
        response = api_client.get("/api/v1/timetable/me/")

        assert response.status_code == 200
        assert len(response.data["results"]) == 1
        row = response.data["results"][0]
        # each lesson carries its period's clock times so the timetable can show when it is
        assert len(row["period_start_time"]) == 5 and ":" in row["period_start_time"]
        assert len(row["period_end_time"]) == 5 and ":" in row["period_end_time"]
        assert "period_order" in row

    def test_student_sees_their_sections_lessons(self, api_client):
        school, _ = _principal()
        section = SectionFactory(school=school)
        student = StudentFactory(school=school, current_section=section)
        student.user = UserFactory(school=school)
        student.save(update_fields=["user"])
        TimetableEntryFactory(school=school, section=section)
        TimetableEntryFactory(school=school)  # a different section's lesson

        _login(api_client, student.user)
        response = api_client.get("/api/v1/timetable/me/")

        assert response.status_code == 200
        assert len(response.data["results"]) == 1
