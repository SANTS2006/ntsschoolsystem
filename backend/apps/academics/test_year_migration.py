"""The academic-year migrations (0017, 0018) against data created under the OLD schema: duplicate "current" flags, existing
students/promotions, and existing invoices must come through intact."""

from datetime import date
from decimal import Decimal

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

def _targets(academics_node):
    """Every app at its latest migration, except academics, which is pinned (so the old/new states include the other apps' tables)."""
    leaves = [leaf for leaf in MigrationExecutor(connection).loader.graph.leaf_nodes() if leaf[0] != "academics"]
    return leaves + [("academics", academics_node)]


OLD = "0016_assessment_file_uploads"
NEW = "0018_one_current_term_per_school"


def _migrate(academics_node):
    targets = _targets(academics_node)
    executor = MigrationExecutor(connection)
    executor.migrate(targets)
    executor.loader.build_graph()
    return executor.loader.project_state(targets).apps


@pytest.mark.django_db(transaction=True)
def test_migrations_clean_up_duplicates_and_backfill_history_without_touching_money():
    old = _migrate(OLD)
    School = old.get_model("tenants", "School")
    AcademicYear = old.get_model("academics", "AcademicYear")
    Term = old.get_model("academics", "Term")
    SchoolClass = old.get_model("academics", "SchoolClass")
    PromotionRecord = old.get_model("academics", "PromotionRecord")
    Student = old.get_model("students", "Student")
    Invoice = old.get_model("finance", "Invoice")

    school = School.objects.create(name="Legacy School", slug="legacy-school")
    older = AcademicYear.objects.create(school=school, name="2025/2026", start_date=date(2025, 9, 1), end_date=date(2026, 7, 31), is_current=True)
    newer = AcademicYear.objects.create(school=school, name="2026/2027", start_date=date(2026, 9, 1), end_date=date(2027, 7, 31), is_current=True)  # a legacy mistake
    t_old = Term.objects.create(school=school, academic_year=older, name="Term 1", sequence=1, start_date=date(2025, 9, 1), end_date=date(2025, 12, 15), is_current=True)
    t_new = Term.objects.create(school=school, academic_year=newer, name="Term 1", sequence=1, start_date=date(2026, 9, 1), end_date=date(2026, 12, 15), is_current=True)
    grade1 = SchoolClass.objects.create(school=school, name="Grade 1", order=1)
    grade2 = SchoolClass.objects.create(school=school, name="Grade 2", order=2)

    promoted = Student.objects.create(school=school, admission_number="A1", first_name="Ama", last_name="K", status="active", current_academic_year=newer, current_class=grade2)
    no_class = Student.objects.create(school=school, admission_number="A2", first_name="Joe", last_name="B", status="active")
    PromotionRecord.objects.create(
        school=school, student=promoted, previous_class=grade1, previous_academic_year=older, new_class=grade2, new_academic_year=newer,
        threshold_percent=50, status="promoted", type="normal",
    )
    invoice = Invoice.objects.create(
        school=school, student=promoted, invoice_number="INV-1", academic_year=older, subtotal=Decimal("500"), total=Decimal("500"),
        amount_paid=Decimal("300"), balance=Decimal("200"),
    )
    invoice_before = (invoice.pk, invoice.academic_year_id, invoice.total, invoice.amount_paid, invoice.balance)

    new = _migrate(NEW)

    AcademicYear, Term = new.get_model("academics", "AcademicYear"), new.get_model("academics", "Term")
    Enrollment = new.get_model("academics", "StudentEnrollment")
    Invoice = new.get_model("finance", "Invoice")

    # One current year / term per school: the later-starting year and its term were kept; nothing was deleted.
    assert list(AcademicYear.objects.filter(school_id=school.pk, is_current=True).values_list("name", flat=True)) == ["2026/2027"]
    assert AcademicYear.objects.filter(school_id=school.pk).count() == 2
    assert list(Term.objects.filter(school_id=school.pk, is_current=True).values_list("pk", flat=True)) == [t_new.pk]
    assert Term.objects.filter(school_id=school.pk).count() == 2

    # History rebuilt only from recorded evidence; the student with no class/year got nothing invented.
    rows = {(e.academic_year_id, e.school_class_id): e for e in Enrollment.objects.filter(student_id=promoted.pk)}
    assert set(rows) == {(older.pk, grade1.pk), (newer.pk, grade2.pk)}
    assert rows[(older.pk, grade1.pk)].outcome == "promoted" and rows[(older.pk, grade1.pk)].source == "backfill_promotion"
    assert rows[(newer.pk, grade2.pk)].source == "backfill_current"
    assert not Enrollment.objects.filter(student_id=no_class.pk).exists()

    # Money untouched.
    after = Invoice.objects.get(pk=invoice_before[0])
    assert (after.pk, after.academic_year_id, after.total, after.amount_paid, after.balance) == invoice_before

    # And the database now enforces the rules.
    with pytest.raises(Exception):
        AcademicYear.objects.filter(pk=older.pk).update(is_current=True)

    # Leave the schema at head for the tests that follow.
    executor = MigrationExecutor(connection)
    executor.migrate(executor.loader.graph.leaf_nodes())
