"""Academic-year lifecycle: single active year, activation, rollover, enrolment history, closed-year writes, access."""

import importlib
from datetime import date
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from apps.audit.models import AuditLog
from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.students.models import Student
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AcademicYearFactory,
    FeeCategoryFactory,
    FeeStructureFactory,
    FeeStructureItemFactory,
    InvoiceFactory,
    PaymentFactory,
    PlatformAdminFactory,
    SchoolClassFactory,
    SchoolFactory,
    SectionFactory,
    StaffFactory,
    StudentFactory,
    SubjectFactory,
    SubjectOfferingFactory,
    TermFactory,
    UserFactory,
)

from . import year_services
from .models import AcademicYear, PromotionRecord, RolloverRun, Section, StudentEnrollment, SubjectOffering, Term

pytestmark = pytest.mark.django_db

API = "/api/v1/academics"


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


def _staff(school, slug):
    user = UserFactory(school=school)
    assign_role(user=user, role=Role.unscoped_objects.get(school=school, slug=slug))
    return user


@pytest.fixture
def world():
    """A school in 2026/2027 with two classes (Grade 1 -> Grade 2 [graduation level]), sections, an offering, a fee plan and
    three enrolled students, plus an upcoming 2027/2028 with a term."""
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = _staff(school, "principal")
    g1 = SchoolClassFactory(school=school, name="Grade 1", order=1)
    g2 = SchoolClassFactory(school=school, name="Grade 2", order=2, is_graduation_level=True)
    g1.next_class = g2
    g1.save()

    y1 = AcademicYearFactory(school=school, name="2026/2027", start_date=date(2026, 9, 1), end_date=date(2027, 7, 31), is_current=True)
    y2 = AcademicYearFactory(school=school, name="2027/2028", start_date=date(2027, 9, 1), end_date=date(2028, 7, 31), is_current=False)
    t1 = TermFactory(school=school, academic_year=y1, name="Term 1", sequence=1, start_date=date(2026, 9, 1), end_date=date(2026, 12, 15), is_current=True)
    t2 = TermFactory(school=school, academic_year=y2, name="Term 1", sequence=1, start_date=date(2027, 9, 1), end_date=date(2027, 12, 15))

    s1a = SectionFactory(school=school, school_class=g1, academic_year=y1, name="A")
    s2a = SectionFactory(school=school, school_class=g2, academic_year=y1, name="A")

    pass_student = StudentFactory(school=school, first_name="Pass", status="active", current_academic_year=y1, current_class=g1, current_section=s1a)
    repeat_student = StudentFactory(school=school, first_name="Repeat", status="active", current_academic_year=y1, current_class=g1, current_section=s1a)
    grad_student = StudentFactory(school=school, first_name="Grad", status="active", current_academic_year=y1, current_class=g2, current_section=s2a)

    teacher_staff = StaffFactory(school=school)
    subject = SubjectFactory(school=school)
    offering = SubjectOfferingFactory(school=school, subject=subject, academic_year=y1, term=t1, school_class=g1, main_teacher=teacher_staff)

    fee_category = FeeCategoryFactory(school=school)
    plan = FeeStructureFactory(school=school, academic_year=y1, term=t1, school_class=g1, name="Grade 1 fees 2026/2027")
    FeeStructureItemFactory(school=school, fee_structure=plan, fee_category=fee_category, amount=Decimal("500.00"))
    invoice = InvoiceFactory(
        school=school, student=pass_student, academic_year=y1, fee_structure=plan,
        total=Decimal("500.00"), subtotal=Decimal("500.00"), balance=Decimal("200.00"), amount_paid=Decimal("300.00"),
    )
    payment = PaymentFactory(school=school, invoice=invoice, amount=Decimal("300.00"))

    return dict(
        school=school, principal=principal, g1=g1, g2=g2, y1=y1, y2=y2, t1=t1, t2=t2, s1a=s1a, s2a=s2a,
        pass_student=pass_student, repeat_student=repeat_student, grad_student=grad_student,
        offering=offering, plan=plan, invoice=invoice, payment=payment,
    )


def _decisions(w):
    return {
        str(w["pass_student"].pk): {"outcome": "promote"},
        str(w["repeat_student"].pk): {"outcome": "repeat"},
        str(w["grad_student"].pk): {"outcome": "graduate"},
    }


def _rollover(api_client, w, **extra):
    body = {"source": str(w["y1"].pk), "target": str(w["y2"].pk), "decisions": _decisions(w), **extra}
    return api_client.post(f"{API}/year-rollover/execute/", body, format="json")


# ---- the single active year -----------------------------------------------------------------------------------------

class TestSingleActiveYear:
    def test_the_database_refuses_a_second_active_year(self, world):
        with pytest.raises(IntegrityError), transaction.atomic():
            AcademicYear.unscoped_objects.filter(pk=world["y2"].pk).update(is_current=True)

    def test_another_school_can_have_its_own_active_year(self, world):
        other = SchoolFactory()
        AcademicYearFactory(school=other, is_current=True)
        assert AcademicYear.unscoped_objects.filter(is_current=True).count() == 2

    def test_creating_or_editing_a_year_cannot_set_it_active(self, api_client, world):
        _login(api_client, world["principal"])
        created = api_client.post(f"{API}/academic-years/", {"name": "2028/2029", "start_date": "2028-09-01", "end_date": "2029-07-31", "is_current": True}, format="json")
        assert created.status_code == 201
        assert created.data["is_current"] is False and created.data["status"] == "upcoming"
        patched = api_client.patch(f"{API}/academic-years/{world['y2'].pk}/", {"is_current": True}, format="json")
        assert patched.status_code == 200
        world["y2"].refresh_from_db()
        assert world["y2"].is_current is False

    def test_status_is_derived(self, world):
        assert world["y1"].status == "active" and world["y2"].status == "upcoming"
        AcademicYear.unscoped_objects.filter(pk=world["y2"].pk).update(is_archived=True)
        world["y2"].refresh_from_db()
        assert world["y2"].status == "closed"


# ---- context (the shared header + selector) ---------------------------------------------------------------------------

class TestYearContext:
    def test_any_school_user_sees_the_active_year_and_only_their_own_years(self, api_client, world):
        AcademicYearFactory(school=SchoolFactory(), name="Someone else's year")
        teacher = _staff(world["school"], "teacher")
        _login(api_client, teacher)
        body = api_client.get(f"{API}/year-context/").data
        assert body["active"]["name"] == "2026/2027" and body["current_term"]["name"] == "Term 1"
        assert {y["name"] for y in body["years"]} == {"2026/2027", "2027/2028"}

    def test_no_active_year_is_reported_not_invented(self, api_client, world):
        AcademicYear.unscoped_objects.filter(pk=world["y1"].pk).update(is_current=False)
        _login(api_client, world["principal"])
        body = api_client.get(f"{API}/year-context/").data
        assert body["active"] is None and len(body["years"]) == 2
        with pytest.raises(year_services.NoActiveAcademicYear):
            year_services.require_active_year(world["school"])

    def test_requires_a_school_account(self, api_client, world):
        assert api_client.get(f"{API}/year-context/").status_code in (401, 403)
        _login(api_client, PlatformAdminFactory())
        assert api_client.get(f"{API}/year-context/").status_code == 403

    def test_resolve_year_rejects_other_schools_years(self, world):
        foreign = AcademicYearFactory(school=SchoolFactory())
        with pytest.raises(year_services.YearLifecycleError):
            year_services.resolve_year(world["school"], foreign.pk)
        with pytest.raises(year_services.YearLifecycleError):
            year_services.resolve_year(world["school"], "not-a-uuid")


# ---- preview ---------------------------------------------------------------------------------------------------------

class TestPreview:
    def test_preview_changes_nothing_and_flags_what_needs_a_decision(self, api_client, world):
        _login(api_client, world["principal"])
        before = (StudentEnrollment.unscoped_objects.count(), PromotionRecord.unscoped_objects.count(), Section.unscoped_objects.count())
        response = api_client.post(f"{API}/year-rollover/preview/", {"source": str(world["y1"].pk), "target": str(world["y2"].pk)}, format="json")
        assert response.status_code == 200
        preview = response.data["preview"]
        # No results exist, so the school's own rules cannot decide: every student is a "review", and it is not ready.
        assert preview["counts"] == {"review": 3} and preview["ready"] is False
        assert preview["outstanding_balances"]["total"] == "200.00" and preview["outstanding_balances"]["students"] == 1
        assert preview["configuration"]["sections"] == {"in_source": 2, "in_target": 0}
        assert (StudentEnrollment.unscoped_objects.count(), PromotionRecord.unscoped_objects.count(), Section.unscoped_objects.count()) == before
        assert not RolloverRun.unscoped_objects.exists()

    def test_the_schools_pass_mark_drives_the_proposal(self, api_client, world, monkeypatch):
        from . import services

        marks = {str(world["pass_student"].pk): Decimal("70.00"), str(world["repeat_student"].pk): Decimal("20.00"), str(world["grad_student"].pk): Decimal("65.00")}
        monkeypatch.setattr(services, "compute_overall_percentage", lambda school_class, year, student: marks[str(student.pk)])
        _login(api_client, world["principal"])
        preview = api_client.post(f"{API}/year-rollover/preview/", {"source": str(world["y1"].pk), "target": str(world["y2"].pk)}, format="json").data["preview"]
        proposed = {row["name"]: row["proposed"] for row in preview["students"]}
        assert proposed == {"Pass Dent": "promote", "Repeat Dent": "repeat", "Grad Dent": "graduate"}
        assert preview["ready"] is True

    def test_bad_year_pairs_are_refused(self, api_client, world):
        _login(api_client, world["principal"])
        same = api_client.post(f"{API}/year-rollover/preview/", {"source": str(world["y1"].pk), "target": str(world["y1"].pk)}, format="json")
        backwards = api_client.post(f"{API}/year-rollover/preview/", {"source": str(world["y2"].pk), "target": str(world["y1"].pk)}, format="json")
        foreign = api_client.post(f"{API}/year-rollover/preview/", {"source": str(world["y1"].pk), "target": str(AcademicYearFactory(school=SchoolFactory()).pk)}, format="json")
        assert same.status_code == backwards.status_code == foreign.status_code == 400

    def test_a_target_without_terms_is_warned_about(self, api_client, world):
        Term.unscoped_objects.filter(pk=world["t2"].pk).delete()
        _login(api_client, world["principal"])
        preview = api_client.post(f"{API}/year-rollover/preview/", {"source": str(world["y1"].pk), "target": str(world["y2"].pk)}, format="json").data["preview"]
        assert any("no terms" in w for w in preview["warnings"])


# ---- execute ---------------------------------------------------------------------------------------------------------

class TestRollover:
    def test_progression_enrolments_and_history(self, api_client, world):
        _login(api_client, world["principal"])
        response = _rollover(api_client, world)
        assert response.status_code == 200, response.data

        def enrol(student, year):
            return StudentEnrollment.unscoped_objects.filter(student=student, academic_year=year).first()

        promoted, repeated, graduated = (Student.unscoped_objects.get(pk=world[k].pk) for k in ("pass_student", "repeat_student", "grad_student"))
        assert (promoted.current_class_id, promoted.current_academic_year_id) == (world["g2"].pk, world["y2"].pk)
        assert (repeated.current_class_id, repeated.current_academic_year_id) == (world["g1"].pk, world["y2"].pk)
        assert graduated.status == "graduated" and graduated.current_class_id is None
        assert enrol(promoted, world["y2"]).school_class_id == world["g2"].pk
        assert enrol(repeated, world["y2"]).school_class_id == world["g1"].pk
        assert enrol(graduated, world["y2"]) is None  # a graduate has no new-year enrolment

        # History is preserved and annotated, not replaced.
        assert enrol(promoted, world["y1"]).school_class_id == world["g1"].pk and enrol(promoted, world["y1"]).outcome == "promoted"
        assert enrol(repeated, world["y1"]).outcome == "repeated" and enrol(graduated, world["y1"]).outcome == "graduated"
        assert PromotionRecord.unscoped_objects.filter(student=graduated, previous_class=world["g2"]).count() == 1

        # Same student profiles, never duplicated.
        assert Student.unscoped_objects.filter(school=world["school"]).count() == 3

    def test_students_land_in_the_matching_new_year_section(self, api_client, world):
        _login(api_client, world["principal"])
        _rollover(api_client, world)
        promoted = Student.unscoped_objects.get(pk=world["pass_student"].pk)
        repeated = Student.unscoped_objects.get(pk=world["repeat_student"].pk)
        # Grade 1 A exists in 2027/2028 (copied) so the repeater lands there; Grade 2 A (copied) takes the promoted student.
        assert repeated.current_section.academic_year_id == world["y2"].pk and repeated.current_section.name == "A"
        assert promoted.current_section.school_class_id == world["g2"].pk and promoted.current_section.academic_year_id == world["y2"].pk

    def test_configuration_is_copied_but_results_money_and_marks_are_not(self, api_client, world):
        _login(api_client, world["principal"])
        before = (world["invoice"].balance, world["invoice"].amount_paid)
        response = _rollover(api_client, world)
        summary = response.data["run"]["summary"]
        assert summary["configuration"]["sections"]["created"] == 2
        assert summary["configuration"]["subject_offerings"]["created"] == 1
        assert summary["configuration"]["fee_structures"]["created"] == 1

        new_offering = SubjectOffering.unscoped_objects.get(academic_year=world["y2"])
        assert new_offering.pk != world["offering"].pk and new_offering.term_id == world["t2"].pk
        new_plan = type(world["plan"]).unscoped_objects.get(academic_year=world["y2"])
        from apps.finance.models import FeeStructureItem

        assert new_plan.name == "Grade 1 fees 2027/2028" and FeeStructureItem.unscoped_objects.filter(fee_structure=new_plan).count() == 1

        # The old year's configuration, invoices and payments are untouched; nothing financial was created.
        world["offering"].refresh_from_db()
        world["invoice"].refresh_from_db()
        assert world["offering"].academic_year_id == world["y1"].pk and world["plan"].academic_year_id == world["y1"].pk
        assert (world["invoice"].balance, world["invoice"].amount_paid) == before and world["invoice"].academic_year_id == world["y1"].pk
        assert type(world["invoice"]).unscoped_objects.count() == 1 and type(world["payment"]).unscoped_objects.count() == 1
        assert summary["outstanding_balances"] == {"invoices": 1, "students": 1, "total": "200.00"}

    def test_it_is_idempotent(self, api_client, world):
        _login(api_client, world["principal"])
        first = _rollover(api_client, world)

        def counts():
            return (
                StudentEnrollment.unscoped_objects.count(), PromotionRecord.unscoped_objects.count(), Section.unscoped_objects.count(),
                SubjectOffering.unscoped_objects.count(), type(world["plan"]).unscoped_objects.count(), RolloverRun.unscoped_objects.count(),
            )

        after_first = counts()
        second = _rollover(api_client, world)
        assert second.status_code == 200 and second.data["run"]["id"] == first.data["run"]["id"]
        assert counts() == after_first

    def test_students_needing_a_decision_block_the_run_and_nothing_is_written(self, api_client, world):
        _login(api_client, world["principal"])
        decisions = _decisions(world)
        del decisions[str(world["repeat_student"].pk)]  # no results exist, so the rules cannot decide this one
        before = StudentEnrollment.unscoped_objects.count()
        response = _rollover(api_client, world, decisions=decisions)
        assert response.status_code == 400 and "need a decision" in response.data["message"]
        assert StudentEnrollment.unscoped_objects.count() == before and not Section.unscoped_objects.filter(academic_year=world["y2"]).exists()
        run = RolloverRun.unscoped_objects.get()
        assert run.status == "failed" and "need a decision" in run.error
        # Supplying the missing decision lets the very same run complete.
        assert _rollover(api_client, world).status_code == 200
        assert RolloverRun.unscoped_objects.get().status == "completed"

    def test_a_failure_part_way_leaves_nothing_behind(self, api_client, world, monkeypatch):
        def boom(*args, **kwargs):
            raise RuntimeError("database hiccup")

        monkeypatch.setattr(year_services, "_copy_fee_structures", boom)
        _login(api_client, world["principal"])
        response = _rollover(api_client, world)
        assert response.status_code == 400 and "nothing was changed" in response.data["message"]
        assert "hiccup" not in str(response.data)  # internals are not leaked
        assert not StudentEnrollment.unscoped_objects.filter(academic_year=world["y2"]).exists()
        assert Student.unscoped_objects.get(pk=world["pass_student"].pk).current_class_id == world["g1"].pk
        assert RolloverRun.unscoped_objects.get().status == "failed"
        assert not AcademicYear.unscoped_objects.get(pk=world["y2"].pk).is_current

    def test_an_already_enrolled_student_is_skipped_not_duplicated(self, api_client, world):
        StudentEnrollment.unscoped_objects.create(school=world["school"], student=world["pass_student"], academic_year=world["y2"], school_class=world["g2"], source="manual")
        _login(api_client, world["principal"])
        response = _rollover(api_client, world)
        assert response.status_code == 200 and response.data["run"]["summary"]["skipped_already_enrolled"] == 1
        assert StudentEnrollment.unscoped_objects.filter(student=world["pass_student"], academic_year=world["y2"]).count() == 1

    def test_withdraw_and_transfer_close_the_student_out_without_deleting_anything(self, api_client, world):
        _login(api_client, world["principal"])
        decisions = {**_decisions(world), str(world["repeat_student"].pk): {"outcome": "withdraw"}, str(world["pass_student"].pk): {"outcome": "transfer"}}
        assert _rollover(api_client, world, decisions=decisions).status_code == 200
        assert Student.unscoped_objects.get(pk=world["repeat_student"].pk).status == "withdrawn"
        assert Student.unscoped_objects.get(pk=world["pass_student"].pk).status == "transferred"
        assert StudentEnrollment.unscoped_objects.filter(student=world["repeat_student"], academic_year=world["y1"], outcome="withdrawn").exists()

    def test_an_override_class_is_honoured_and_recorded_as_manual(self, api_client, world):
        extra = SchoolClassFactory(school=world["school"], name="Grade 3", order=3)
        _login(api_client, world["principal"])
        decisions = {**_decisions(world), str(world["pass_student"].pk): {"outcome": "promote", "class": str(extra.pk)}}
        assert _rollover(api_client, world, decisions=decisions).status_code == 200
        assert Student.unscoped_objects.get(pk=world["pass_student"].pk).current_class_id == extra.pk
        assert PromotionRecord.unscoped_objects.get(student=world["pass_student"]).type == "manual"

    def test_a_class_from_another_school_is_refused(self, api_client, world):
        foreign = SchoolClassFactory(school=SchoolFactory())
        _login(api_client, world["principal"])
        decisions = {**_decisions(world), str(world["pass_student"].pk): {"outcome": "promote", "class": str(foreign.pk)}}
        response = _rollover(api_client, world, decisions=decisions)
        assert response.status_code == 400
        assert not StudentEnrollment.unscoped_objects.filter(academic_year=world["y2"]).exists()

    def test_options_can_switch_off_the_configuration_copies(self, api_client, world):
        _login(api_client, world["principal"])
        assert _rollover(api_client, world, options={"sections": False, "subject_offerings": False, "fee_structures": False}).status_code == 200
        assert not SubjectOffering.unscoped_objects.filter(academic_year=world["y2"]).exists()
        assert not Section.unscoped_objects.filter(academic_year=world["y2"]).exists()
        # With no new-year sections the students are enrolled but flagged as needing a section.
        assert RolloverRun.unscoped_objects.get().summary["students_without_section"] == 2


# ---- activation ------------------------------------------------------------------------------------------------------

class TestActivation:
    def test_it_needs_the_rollover_first(self, api_client, world):
        _login(api_client, world["principal"])
        response = api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/")
        assert response.status_code == 400 and "rollover" in response.data["message"].lower()
        assert AcademicYear.unscoped_objects.get(pk=world["y1"].pk).is_current

    def test_it_needs_terms(self, api_client, world):
        Term.unscoped_objects.filter(pk=world["t2"].pk).delete()
        _login(api_client, world["principal"])
        _rollover(api_client, world)
        response = api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/")
        assert response.status_code == 400 and "term" in response.data["message"].lower()

    def test_activation_swaps_the_year_closes_the_old_one_and_is_audited(self, api_client, world):
        _login(api_client, world["principal"])
        _rollover(api_client, world)
        response = api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/")
        assert response.status_code == 200 and response.data["academic_year"]["status"] == "active"
        y1, y2 = (AcademicYear.unscoped_objects.get(pk=world[k].pk) for k in ("y1", "y2"))
        assert (y1.is_current, y1.is_archived, y2.is_current, y2.is_archived) == (False, True, True, False)
        assert AcademicYear.unscoped_objects.filter(school=world["school"], is_current=True).count() == 1
        assert Term.unscoped_objects.get(pk=world["t1"].pk).is_current is False and Term.unscoped_objects.get(pk=world["t2"].pk).is_current is True
        assert y2.activated_by_id == world["principal"].pk and y2.activated_at is not None
        entry = AuditLog.objects.get(action="academics.year_activated")
        assert entry.metadata == {"activated": "2027/2028", "closed": "2026/2027"}
        # The context endpoint now reports the new year everywhere.
        assert api_client.get(f"{API}/year-context/").data["active"]["name"] == "2027/2028"

    def test_a_year_cannot_be_activated_twice_or_after_closing(self, api_client, world):
        _login(api_client, world["principal"])
        _rollover(api_client, world)
        api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/")
        assert api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/").status_code == 400
        assert api_client.post(f"{API}/academic-years/{world['y1'].pk}/activate/").status_code == 400  # closed

    def test_the_first_ever_year_needs_no_rollover(self, api_client):
        seed_permission_catalog()
        school = SchoolFactory()
        seed_default_roles_for_school(school)
        principal = _staff(school, "principal")
        year = AcademicYearFactory(school=school, is_current=False)
        TermFactory(school=school, academic_year=year)
        _login(api_client, principal)
        assert api_client.post(f"{API}/academic-years/{year.pk}/activate/").status_code == 200

    def test_repeating_an_activation_cannot_leave_two_active_years(self, world):
        # The service locks the school's years and the database refuses a second active one.
        year_services.execute_rollover(world["y1"], world["y2"], actor=world["principal"], decisions=_decisions(world))
        year_services.activate_academic_year(world["y2"], actor=world["principal"])
        with pytest.raises(year_services.YearLifecycleError):
            year_services.activate_academic_year(world["y2"], actor=world["principal"])
        assert AcademicYear.unscoped_objects.filter(school=world["school"], is_current=True).count() == 1


# ---- closed years are read-only; history stays readable ------------------------------------------------------------------

class TestClosedYears:
    def _roll(self, api_client, world):
        _login(api_client, world["principal"])
        _rollover(api_client, world)
        api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/")

    def test_ordinary_writes_to_the_closed_year_are_rejected(self, api_client, world):
        self._roll(api_client, world)
        closed = api_client.post(f"{API}/sections/", {"school_class": str(world["g1"].pk), "academic_year": str(world["y1"].pk), "name": "Z", "capacity": 30}, format="json")
        assert closed.status_code == 400 and "archived" in str(closed.data).lower()
        open_year = api_client.post(f"{API}/sections/", {"school_class": str(world["g1"].pk), "academic_year": str(world["y2"].pk), "name": "Z", "capacity": 30}, format="json")
        assert open_year.status_code == 201

    def test_the_closed_year_stays_readable(self, api_client, world):
        self._roll(api_client, world)
        old_offerings = api_client.get(f"{API}/subject-offerings/", {"academic_year": str(world["y1"].pk)})
        assert old_offerings.status_code == 200 and old_offerings.data["count"] == 1

    def test_a_correction_goes_through_the_audited_unarchive(self, api_client, world):
        self._roll(api_client, world)
        assert api_client.post(f"{API}/academic-years/{world['y1'].pk}/unarchive/").status_code == 200
        assert AuditLog.objects.filter(action="academics.year_unarchived").exists()


# ---- who may do what -------------------------------------------------------------------------------------------------

class TestAccess:
    @pytest.mark.parametrize("slug", ["teacher", "student", "accountant"])
    def test_only_people_with_academic_update_can_roll_over_or_activate(self, api_client, world, slug):
        user = _staff(world["school"], slug)
        _login(api_client, user)
        body = {"source": str(world["y1"].pk), "target": str(world["y2"].pk), "decisions": _decisions(world)}
        assert api_client.post(f"{API}/year-rollover/preview/", body, format="json").status_code == 403
        assert api_client.post(f"{API}/year-rollover/execute/", body, format="json").status_code == 403
        assert api_client.get(f"{API}/year-rollover/runs/").status_code == 403
        assert api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/").status_code == 403
        assert not StudentEnrollment.unscoped_objects.filter(academic_year=world["y2"]).exists()

    def test_another_schools_administrator_cannot_touch_this_schools_years(self, api_client, world):
        other = SchoolFactory()
        seed_default_roles_for_school(other)
        outsider = _staff(other, "principal")
        _login(api_client, outsider)
        body = {"source": str(world["y1"].pk), "target": str(world["y2"].pk)}
        assert api_client.post(f"{API}/year-rollover/preview/", body, format="json").status_code == 400
        assert api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/").status_code == 404

    def test_decisions_must_be_well_formed(self, api_client, world):
        _login(api_client, world["principal"])
        bad = _rollover(api_client, world, decisions={str(world["pass_student"].pk): {"outcome": "teleport"}})
        assert bad.status_code == 400 and not StudentEnrollment.unscoped_objects.filter(academic_year=world["y2"]).exists()


# ---- historical views --------------------------------------------------------------------------------------------------

class TestHistoricalViews:
    def test_students_can_be_listed_for_a_viewing_year_without_changing_the_active_one(self, api_client, world):
        _login(api_client, world["principal"])
        _rollover(api_client, world)
        api_client.post(f"{API}/academic-years/{world['y2'].pk}/activate/")
        old = api_client.get("/api/v1/students/", {"academic_year": str(world["y1"].pk)})
        new = api_client.get("/api/v1/students/", {"academic_year": str(world["y2"].pk)})
        assert old.data["count"] == 3  # everyone was enrolled in 2026/2027
        assert {s["first_name"] for s in new.data["results"]} == {"Pass", "Repeat"}  # the graduate left
        assert AcademicYear.unscoped_objects.get(school=world["school"], is_current=True).pk == world["y2"].pk

    def test_a_viewing_year_must_be_this_schools(self, api_client, world):
        _login(api_client, world["principal"])
        foreign = AcademicYearFactory(school=SchoolFactory())
        assert api_client.get("/api/v1/students/", {"academic_year": str(foreign.pk)}).status_code == 400

    def test_a_students_enrolment_history(self, api_client, world):
        _login(api_client, world["principal"])
        _rollover(api_client, world)
        rows = api_client.get(f"/api/v1/students/{world['pass_student'].pk}/enrollments/").data["enrollments"]
        assert [(r["academic_year"], r["class"], r["outcome"]) for r in rows] == [("2027/2028", "Grade 2", ""), ("2026/2027", "Grade 1", "promoted")]


# ---- enrolment history stays in step with the student's current pointer ---------------------------------------------------

class TestEnrollmentSync:
    def test_saving_a_student_records_that_years_enrolment_and_keeps_it_current(self, world):
        student = StudentFactory(school=world["school"], current_academic_year=world["y1"], current_class=world["g1"], status="active")
        row = StudentEnrollment.unscoped_objects.get(student=student, academic_year=world["y1"])
        assert row.school_class_id == world["g1"].pk and row.source == "admission"
        student.current_class = world["g2"]
        student.save()
        assert StudentEnrollment.unscoped_objects.filter(student=student).count() == 1
        assert StudentEnrollment.unscoped_objects.get(student=student).school_class_id == world["g2"].pk

    def test_a_student_with_no_class_has_no_enrolment(self, world):
        student = StudentFactory(school=world["school"], status="admitted")
        assert not StudentEnrollment.unscoped_objects.filter(student=student).exists()

    def test_enrolment_rejects_mixed_up_years_classes_and_schools(self, world):
        student = world["pass_student"]
        wrong_year_section = SectionFactory(school=world["school"], school_class=world["g1"], academic_year=world["y2"], name="B")
        with pytest.raises(ValueError):
            StudentEnrollment.unscoped_objects.create(school=world["school"], student=student, academic_year=world["y1"], school_class=world["g1"], section=wrong_year_section)
        other_class = SchoolClassFactory(school=SchoolFactory())
        with pytest.raises(ValueError):
            StudentEnrollment.unscoped_objects.create(school=world["school"], student=student, academic_year=world["y2"], school_class=other_class)

    def test_one_enrolment_per_student_per_year(self, world):
        with pytest.raises(IntegrityError), transaction.atomic():
            StudentEnrollment.unscoped_objects.create(school=world["school"], student=world["pass_student"], academic_year=world["y1"], school_class=world["g2"])


# ---- legacy promotion tools keep the history in step -------------------------------------------------------------------------

class TestLegacyPromotionTools:
    def test_bulk_promote_records_enrolments(self, api_client, world, monkeypatch):
        from . import services

        monkeypatch.setattr(services, "compute_overall_percentage", lambda *args: Decimal("80.00"))
        _login(api_client, world["principal"])
        response = api_client.post(
            f"{API}/promotions/bulk-promote/",
            {"school_class": str(world["g1"].pk), "academic_year": str(world["y1"].pk), "target_academic_year": str(world["y2"].pk)},
            format="json",
        )
        assert response.status_code == 200
        assert StudentEnrollment.unscoped_objects.filter(student=world["pass_student"], academic_year=world["y2"], school_class=world["g2"]).count() == 1
        assert StudentEnrollment.unscoped_objects.get(student=world["pass_student"], academic_year=world["y1"]).outcome == "promoted"


# ---- the data migration's backfill -------------------------------------------------------------------------------------------

class TestBackfill:
    def _backfill(self):
        from django.apps import apps

        from apps.tenants.context import reset_platform_admin_context, set_platform_admin_context

        module = importlib.import_module("apps.academics.migrations.0017_academic_year_lifecycle")
        # A real migration sees plain managers; here the live registry's tenant-scoped ones need the unrestricted context.
        token = set_platform_admin_context(True)
        try:
            module.backfill_enrollments(apps, None)
        finally:
            reset_platform_admin_context(token)

    def test_it_rebuilds_history_from_current_classes_and_promotion_records_without_guessing(self, world):
        school = world["school"]
        PromotionRecord.unscoped_objects.create(
            school=school, student=world["pass_student"], previous_class=world["g1"], previous_academic_year=world["y1"],
            new_class=world["g2"], new_academic_year=world["y2"], threshold_percent=50, status="promoted", type="normal",
        )
        no_class = StudentFactory(school=school, status="admitted")
        StudentEnrollment.unscoped_objects.all().delete()
        self._backfill()
        rows = {(e.student_id, e.academic_year_id): e for e in StudentEnrollment.unscoped_objects.all()}
        assert (world["pass_student"].pk, world["y1"].pk) in rows and (world["pass_student"].pk, world["y2"].pk) in rows
        assert rows[(world["pass_student"].pk, world["y2"].pk)].school_class_id == world["g2"].pk
        assert rows[(world["pass_student"].pk, world["y1"].pk)].outcome == "promoted"
        assert rows[(world["grad_student"].pk, world["y1"].pk)].source == "backfill_current"
        assert not any(student_id == no_class.pk for student_id, _ in rows)  # no class recorded: nothing invented

    def test_it_is_safe_to_run_twice(self, world):
        StudentEnrollment.unscoped_objects.all().delete()
        self._backfill()
        count = StudentEnrollment.unscoped_objects.count()
        self._backfill()
        assert StudentEnrollment.unscoped_objects.count() == count == 3
