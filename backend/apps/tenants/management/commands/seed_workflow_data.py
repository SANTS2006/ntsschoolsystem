"""Idempotently tops up Demo Academy with realistic-ish test data across every module, so a
tester can exercise real workflows (attendance, grading, invoicing, payroll, library loans,
hostel allocation, procurement, ...) without hand-creating records one at a time in the UI.

NEVER run against production — this is development-only seed data, safe to re-run (every
section tops up to a target count rather than duplicating existing rows).
"""

import random
from datetime import date, time, timedelta
from decimal import Decimal

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from faker import Faker

from apps.academics.models import AcademicYear, Department, SchoolClass, Section, Subject, Term
from apps.assignments.models import Assignment, AssignmentSubmission
from apps.attendance.models import AttendanceStatus, StaffAttendance, StudentAttendance
from apps.authorization.models import Role
from apps.authorization.services import assign_role
from apps.communications.models import Announcement
from apps.complaints.models import Complaint, ComplaintResponse
from apps.discipline.models import DisciplineIncident
from apps.documents.models import Document, DocumentCategory
from apps.education.models import Lesson
from apps.events.models import Event
from apps.examinations.models import Exam, ExamSchedule, GradeBoundary, GradingScale
from apps.finance import services as finance_services
from apps.finance.models import FeeCategory, FeeStructure, FeeStructureItem, Invoice
from apps.hostel import services as hostel_services
from apps.hostel.models import Bed
from apps.hostel.models import HostelAllocation
from apps.hostel.models import Hostel
from apps.hostel.models import Room as HostelRoom
from apps.inventory import services as inventory_services
from apps.inventory.models import InventoryCategory, InventoryItem
from apps.library import services as library_services
from apps.library.models import Book, BookCategory, BookCopy, BookReservation
from apps.live_sessions.models import LiveSession
from apps.medical.models import MedicalProfile, MedicalVisit
from apps.parents.models import Guardian, StudentGuardian
from apps.procurement.models import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem, Supplier
from apps.salary import services as salary_services
from apps.salary.models import SalaryStructure, SalaryStructureItem, StaffSalaryAssignment
from apps.staff.models import Staff
from apps.students.models import Student
from apps.tenants.context import set_current_school_id
from apps.tenants.models import School
from apps.timetable.models import Period
from apps.timetable.models import Room as TimetableRoom
from apps.timetable.models import TimetableEntry
from apps.transport.models import Route, Stop, StudentTransportAssignment, Vehicle, VehicleMaintenance
from apps.users.models import User
from apps.users.services import invite_user

fake = Faker()
TARGET = 20


def _refuse_unless_explicitly_allowed():
    """These commands create accounts with a password that is written in the source code, and
    fake students/finance data. Run against a database holding real records that would be a
    backdoor plus corrupted data — so they refuse unless the operator opts in explicitly AND the
    process is a development one (DEBUG on)."""
    import os

    from django.conf import settings
    from django.core.management.base import CommandError

    if not settings.DEBUG or os.environ.get("ALLOW_DEV_SEED") != "1":
        raise CommandError(
            "Refusing to seed demo data: this creates accounts with a publicly known password. "
            "Only run it against a throwaway DEVELOPMENT database, with DJANGO_DEBUG=True and "
            "ALLOW_DEV_SEED=1 set. Never against production."
        )


class Command(BaseCommand):
    help = (
        "Idempotently tops up Demo Academy with up to 20 records per module for workflow "
        "testing (attendance, grading, invoicing, payroll, library, hostel, procurement, ...). "
        "NEVER run against production. Safe to re-run."
    )

    def handle(self, *args, **options):
        _refuse_unless_explicitly_allowed()
        school = School.objects.get(slug="demo-academy")
        set_current_school_id(school.id)
        self.school = school
        self.rand = random.Random(42)

        self.seed_academics()
        self.seed_staff()
        self.seed_students()
        self.seed_parents()
        self.seed_timetable()
        self.seed_attendance()
        self.seed_examinations()
        self.seed_finance()
        self.seed_salary()
        self.seed_library()
        self.seed_transport()
        self.seed_hostel()
        self.seed_medical()
        self.seed_discipline()
        self.seed_communications()
        self.seed_assignments()
        self.seed_documents()
        self.seed_inventory()
        self.seed_procurement()
        self.seed_events()
        self.seed_complaints()
        self.seed_education()
        self.seed_live_sessions()

        self.stdout.write(self.style.SUCCESS("Workflow test data seeded for Demo Academy."))

    def log(self, label, count):
        self.stdout.write(f"  {label}: {count}")

    def top_up(self, model, target, build_fn, filter_kwargs=None):
        """Creates records via build_fn() until model.objects.filter(**filter_kwargs) reaches
        target. build_fn raises StopIteration to signal "no more can be created" (e.g. ran out
        of source combinations) — caught and treated as done."""
        filter_kwargs = filter_kwargs or {"school": self.school}
        existing = model.objects.filter(**filter_kwargs).count()
        created = 0
        while existing + created < target:
            try:
                build_fn()
            except StopIteration:
                break
            created += 1
        self.log(model._meta.label, existing + created)

    # ---------------------------------------------------------------- academics
    def seed_academics(self):
        self.stdout.write("Academics...")
        year1, _ = AcademicYear.objects.get_or_create(
            school=self.school, name="2025/2026",
            defaults={"start_date": date(2025, 9, 1), "end_date": date(2026, 7, 31), "is_current": True},
        )
        year2, _ = AcademicYear.objects.get_or_create(
            school=self.school, name="2026/2027",
            defaults={"start_date": date(2026, 9, 1), "end_date": date(2027, 7, 31), "is_current": False},
        )
        self.current_year = AcademicYear.objects.filter(school=self.school, is_current=True).first() or year1

        term_specs = [
            (year1, "Term 1", date(2025, 9, 1), date(2025, 12, 12)),
            (year1, "Term 2", date(2026, 1, 5), date(2026, 4, 3)),
            (year1, "Term 3", date(2026, 4, 20), date(2026, 7, 31), True),
            (year2, "Term 1", date(2026, 9, 1), date(2026, 12, 12)),
        ]
        for spec in term_specs:
            year, name, start, end, *rest = spec
            Term.objects.get_or_create(
                school=self.school, academic_year=year, name=name,
                defaults={"start_date": start, "end_date": end, "is_current": bool(rest and rest[0])},
            )
        self.current_term = Term.objects.filter(school=self.school, is_current=True).first() \
            or Term.objects.filter(school=self.school, academic_year=self.current_year).first()

        dept_names = ["Mathematics", "Sciences", "Languages", "Humanities", "Arts & Sports"]
        for name in dept_names:
            Department.objects.get_or_create(school=self.school, name=name, defaults={"code": name[:3].upper()})
        self.departments = list(Department.objects.filter(school=self.school))

        subject_specs = [
            "Mathematics", "English", "Physics", "Chemistry", "Biology", "History",
            "Geography", "Kiswahili", "Computer Studies", "Art & Design",
        ]
        for i, name in enumerate(subject_specs):
            subject, _created = Subject.objects.get_or_create(
                school=self.school, name=name,
                defaults={
                    "code": name[:4].upper(),
                    "ca_weight_percent": 40,
                    "exam_weight_percent": 60,
                },
            )
            subject.departments.set([self.departments[i % len(self.departments)]])
        self.subjects = list(Subject.objects.filter(school=self.school))

        class_names = ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12", "Grade 7"]
        for i, name in enumerate(class_names):
            SchoolClass.objects.get_or_create(school=self.school, name=name, defaults={"order": i + 7})
        self.classes = list(SchoolClass.objects.filter(school=self.school).order_by("order"))

        for school_class in self.classes:
            for section_name in ("A", "B"):
                Section.objects.get_or_create(
                    school=self.school, school_class=school_class, academic_year=self.current_year,
                    name=section_name, defaults={"capacity": 40},
                )
        self.sections = list(Section.objects.filter(school=self.school, academic_year=self.current_year))
        self.log("academics.Department", len(self.departments))
        self.log("academics.Subject", len(self.subjects))
        self.log("academics.SchoolClass", len(self.classes))
        self.log("academics.Section", len(self.sections))

    # ---------------------------------------------------------------- staff
    def seed_staff(self):
        self.stdout.write("Staff...")
        job_titles = ["Teacher", "Senior Teacher", "Head of Department", "Librarian", "Nurse", "Accounts Clerk"]
        teacher_role = Role.unscoped_objects.filter(school=self.school, slug="teacher").first()

        def build():
            first, last = fake.first_name(), fake.last_name()
            email = f"{first}.{last}.{self.rand.randint(1000,9999)}@demoacademy.test".lower()
            user = invite_user(email=email, first_name=first, last_name=last, school=self.school)
            staff = Staff.objects.create(
                school=self.school, user=user,
                staff_id=f"STF-{self.rand.randint(10000,99999)}",
                department=self.rand.choice(self.departments),
                job_title=self.rand.choice(job_titles),
                qualification=self.rand.choice(["B.Ed", "B.Sc", "M.Ed", "Diploma in Education"]),
                hire_date=fake.date_between(start_date="-6y", end_date="-1M"),
                emergency_contact_name=fake.name(),
                emergency_contact_phone=fake.phone_number()[:32],
            )
            if teacher_role and self.rand.random() < 0.7:
                assign_role(user=user, role=teacher_role)

        self.top_up(Staff, TARGET, build)
        self.staff = list(Staff.objects.filter(school=self.school).select_related("user"))
        self.teachers = [s for s in self.staff if "teacher" in (s.job_title or "").lower()] or self.staff

    # ---------------------------------------------------------------- students
    def seed_students(self):
        self.stdout.write("Students...")

        def build():
            first, last = fake.first_name(), fake.last_name()
            school_class = self.rand.choice(self.classes)
            sections_for_class = [s for s in self.sections if s.school_class_id == school_class.id]
            Student.objects.create(
                school=self.school,
                admission_number=f"ADM-{self.rand.randint(10000,99999)}",
                first_name=first, last_name=last,
                date_of_birth=fake.date_of_birth(minimum_age=6, maximum_age=18),
                gender=self.rand.choice(["male", "female"]),
                address=fake.address()[:500],
                admission_date=fake.date_between(start_date="-3y", end_date="-1M"),
                status=Student.Status.ACTIVE,
                current_academic_year=self.current_year,
                current_class=school_class,
                current_section=self.rand.choice(sections_for_class) if sections_for_class else None,
            )

        self.top_up(Student, TARGET, build)
        self.students = list(Student.objects.filter(school=self.school))

    # ---------------------------------------------------------------- parents
    def seed_parents(self):
        self.stdout.write("Parents...")

        def build():
            first, last = fake.first_name(), fake.last_name()
            Guardian.objects.create(
                school=self.school, first_name=first, last_name=last,
                email=f"{first}.{last}.{self.rand.randint(1000,9999)}@example.test".lower(),
                phone_number=fake.phone_number()[:32],
                address=fake.address()[:500],
                occupation=fake.job()[:150],
            )

        self.top_up(Guardian, 15, build)
        self.guardians = list(Guardian.objects.filter(school=self.school))

        existing_links = StudentGuardian.objects.filter(school=self.school).count()
        target_links = min(TARGET, len(self.students))
        idx = 0
        created = 0
        while existing_links + created < target_links and idx < len(self.students):
            student = self.students[idx]
            idx += 1
            if StudentGuardian.objects.filter(student=student).exists():
                continue
            guardian = self.guardians[idx % len(self.guardians)]
            StudentGuardian.objects.get_or_create(
                school=self.school, student=student, guardian=guardian,
                defaults={"relationship": self.rand.choice(["mother", "father", "guardian"]), "is_primary": True},
            )
            created += 1
        self.log("parents.StudentGuardian", existing_links + created)

    # ---------------------------------------------------------------- timetable
    def seed_timetable(self):
        self.stdout.write("Timetable...")
        for i in range(1, 6):
            TimetableRoom.objects.get_or_create(school=self.school, name=f"Room {i}", defaults={"capacity": 40})
        for i in range(6, 11):
            TimetableRoom.objects.get_or_create(school=self.school, name=f"Lab {i - 5}", defaults={"capacity": 30})
        self.rooms = list(TimetableRoom.objects.filter(school=self.school))

        period_specs = [
            ("Period 1", time(8, 0), time(8, 45)),
            ("Period 2", time(8, 45), time(9, 30)),
            ("Break", time(9, 30), time(9, 50)),
            ("Period 3", time(9, 50), time(10, 35)),
            ("Period 4", time(10, 35), time(11, 20)),
            ("Lunch", time(11, 20), time(12, 10)),
            ("Period 5", time(12, 10), time(12, 55)),
            ("Period 6", time(12, 55), time(13, 40)),
        ]
        for name, start, end in period_specs:
            if Period.objects.filter(school=self.school, name=name).exists():
                continue
            next_order = (Period.objects.filter(school=self.school).order_by("-order").values_list("order", flat=True).first() or 0) + 1
            Period.objects.create(
                school=self.school, name=name, start_time=start, end_time=end,
                order=next_order, is_break="Break" in name or "Lunch" in name,
            )
        self.periods = list(Period.objects.filter(school=self.school, is_break=False))

        days = ["monday", "tuesday", "wednesday", "thursday", "friday"]
        combos = [(d, p, s) for d in days for p in self.periods for s in self.sections]
        self.rand.shuffle(combos)

        def build():
            for day, period, section in combos:
                if TimetableEntry.objects.filter(section=section, day_of_week=day, period=period).exists():
                    continue
                teacher = self.rand.choice(self.teachers)
                if TimetableEntry.objects.filter(teacher=teacher, day_of_week=day, period=period).exists():
                    continue
                room = self.rand.choice(self.rooms)
                if TimetableEntry.objects.filter(room=room, day_of_week=day, period=period).exists():
                    continue
                TimetableEntry.objects.create(
                    school=self.school, section=section, day_of_week=day, period=period,
                    subject=self.rand.choice(self.subjects), teacher=teacher, room=room,
                )
                return
            raise StopIteration

        self.top_up(TimetableEntry, TARGET, build)

    # ---------------------------------------------------------------- attendance
    def seed_attendance(self):
        self.stdout.write("Attendance...")
        statuses = [AttendanceStatus.PRESENT] * 6 + [AttendanceStatus.LATE, AttendanceStatus.ABSENT, AttendanceStatus.EXCUSED]
        recorder = self.staff[0].user if self.staff else None

        def build_student():
            for _ in range(50):
                student = self.rand.choice(self.students)
                day = date.today() - timedelta(days=self.rand.randint(0, 20))
                if StudentAttendance.objects.filter(student=student, date=day, period__isnull=True).exists():
                    continue
                StudentAttendance.objects.create(
                    school=self.school, student=student, date=day, status=self.rand.choice(statuses),
                    section=student.current_section, recorded_by=recorder,
                )
                return
            raise StopIteration

        self.top_up(StudentAttendance, TARGET, build_student)

        def build_staff():
            for _ in range(50):
                staff = self.rand.choice(self.staff)
                day = date.today() - timedelta(days=self.rand.randint(0, 20))
                if StaffAttendance.objects.filter(staff=staff, date=day).exists():
                    continue
                StaffAttendance.objects.create(
                    school=self.school, staff=staff, date=day, status=self.rand.choice(statuses),
                    check_in_time=time(8, self.rand.randint(0, 15)), recorded_by=recorder,
                )
                return
            raise StopIteration

        self.top_up(StaffAttendance, TARGET, build_staff)

    # ---------------------------------------------------------------- examinations
    def seed_examinations(self):
        self.stdout.write("Examinations...")
        scale, _ = GradingScale.objects.get_or_create(
            school=self.school, name="Standard Scale", defaults={"is_default": True}
        )
        boundary_specs = [("A", 80, 100, 4.0), ("B", 65, 79.99, 3.0), ("C", 50, 64.99, 2.0), ("D", 35, 49.99, 1.0), ("F", 0, 34.99, 0.0)]
        for grade, lo, hi, gpa in boundary_specs:
            GradeBoundary.objects.get_or_create(
                school=self.school, grading_scale=scale, grade=grade,
                defaults={"min_score": Decimal(str(lo)), "max_score": Decimal(str(hi)), "gpa_value": Decimal(str(gpa))},
            )

        exam_specs = [
            ("Mid-Term Exam", Exam.ExamType.EXAM, date(2025, 10, 20), date(2025, 10, 24)),
            ("End of Term Exam", Exam.ExamType.EXAM, date(2025, 12, 1), date(2025, 12, 10)),
            ("Term 1 CAT", Exam.ExamType.CONTINUOUS_ASSESSMENT, date(2025, 9, 20), date(2025, 9, 22)),
        ]
        for name, exam_type, start, end in exam_specs:
            Exam.objects.get_or_create(
                school=self.school, term=self.current_term, name=name,
                defaults={"exam_type": exam_type, "grading_scale": scale, "start_date": start, "end_date": end},
            )
        self.exams = list(Exam.objects.filter(school=self.school, term=self.current_term))

        combos = [(exam, sc, subj) for exam in self.exams for sc in self.classes for subj in self.subjects]
        self.rand.shuffle(combos)

        def build_schedule():
            for exam, school_class, subject in combos:
                if ExamSchedule.objects.filter(exam=exam, school_class=school_class, subject=subject).exists():
                    continue
                ExamSchedule.objects.create(
                    school=self.school, exam=exam, school_class=school_class, subject=subject,
                    max_score=Decimal("100"), date=exam.start_date,
                )
                return
            raise StopIteration

        self.top_up(ExamSchedule, 15, build_schedule)
        self.exam_schedules = list(ExamSchedule.objects.filter(school=self.school, exam__term=self.current_term))

    # ---------------------------------------------------------------- finance
    def seed_finance(self):
        self.stdout.write("Finance...")
        category_names = ["Tuition", "Transport Fee", "Registration Fee", "Exam Fee", "Uniform"]
        for name in category_names:
            FeeCategory.objects.get_or_create(
                school=self.school, name=name, defaults={"is_recurring": name != "Registration Fee"}
            )
        self.fee_categories = list(FeeCategory.objects.filter(school=self.school))

        structure_specs = [("Standard Term Fees", None), ("Boarding Term Fees", None), ("Day Scholar Fees", None)]
        for name, school_class in structure_specs:
            structure, _ = FeeStructure.objects.get_or_create(
                school=self.school, name=name,
                defaults={"academic_year": self.current_year, "term": self.current_term, "school_class": school_class},
            )
            for category in self.fee_categories[:3]:
                FeeStructureItem.objects.get_or_create(
                    school=self.school, fee_structure=structure, fee_category=category,
                    defaults={"amount": Decimal(str(self.rand.randint(50, 500)))},
                )
        self.fee_structures = list(FeeStructure.objects.filter(school=self.school))

        def build_invoice():
            for _ in range(60):
                student = self.rand.choice(self.students)
                structure = self.rand.choice(self.fee_structures)
                if Invoice.objects.filter(student=student, fee_structure=structure).exists():
                    continue
                items = list(FeeStructureItem.objects.filter(fee_structure=structure))
                finance_services.create_invoice_with_line_items(
                    school=self.school, student=student, academic_year=self.current_year,
                    term=self.current_term, fee_structure=structure,
                    due_date=date.today() + timedelta(days=30),
                    line_items=[
                        {"fee_category": item.fee_category, "line_type": "charge",
                         "description": item.fee_category.name, "amount": item.amount}
                        for item in items
                    ],
                )
                return
            raise StopIteration

        self.top_up(Invoice, TARGET, build_invoice)
        self.invoices = list(Invoice.objects.filter(school=self.school))

        def build_payment():
            for _ in range(60):
                invoice = self.rand.choice(self.invoices)
                if invoice.balance <= 0:
                    continue
                amount = min(invoice.balance, Decimal(str(self.rand.randint(20, 150))))
                try:
                    finance_services.record_payment(
                        invoice=invoice, amount=amount,
                        method=self.rand.choice(["cash", "bank_transfer", "card", "mobile_money"]),
                        reference=f"REF-{self.rand.randint(100000,999999)}",
                    )
                except finance_services.FinanceError:
                    continue
                return
            raise StopIteration

        from apps.finance.models import Payment
        self.top_up(Payment, 15, build_payment)

    # ---------------------------------------------------------------- salary
    def seed_salary(self):
        self.stdout.write("Salary...")
        structure_specs = {
            "Teacher Grade B": [("basic", "Base Salary", 900), ("allowance", "Housing Allowance", 200), ("deduction", "Tax", 150)],
            "Support Staff Grade A": [("basic", "Base Salary", 500), ("allowance", "Transport Allowance", 80), ("deduction", "Tax", 60)],
            "Senior Staff Grade A": [("basic", "Base Salary", 1500), ("allowance", "Housing Allowance", 400), ("deduction", "Tax", 300)],
        }
        for name, items in structure_specs.items():
            structure, _ = SalaryStructure.objects.get_or_create(school=self.school, name=name)
            for line_type, description, amount in items:
                SalaryStructureItem.objects.get_or_create(
                    school=self.school, salary_structure=structure, line_type=line_type, description=description,
                    defaults={"amount": Decimal(str(amount))},
                )
        self.salary_structures = list(SalaryStructure.objects.filter(school=self.school))

        unassigned = [s for s in self.staff if not StaffSalaryAssignment.objects.filter(staff=s).exists()]

        def build_assignment():
            if not unassigned:
                raise StopIteration
            staff = unassigned.pop()
            StaffSalaryAssignment.objects.create(
                school=self.school, staff=staff, salary_structure=self.rand.choice(self.salary_structures),
                effective_from=date.today() - timedelta(days=90),
            )

        self.top_up(StaffSalaryAssignment, 12, build_assignment)

        for month_offset in (2, 1):
            period = date.today() - timedelta(days=30 * month_offset)
            salary_services.generate_salary_payments_for_month(
                school=self.school, period_year=period.year, period_month=period.month
            )

        pending = list(salary_services.SalaryPayment.objects.filter(school=self.school, status="pending"))
        self.rand.shuffle(pending)
        for payment in pending[: len(pending) // 2]:
            try:
                salary_services.record_salary_payment(salary_payment=payment, method="bank_transfer")
            except salary_services.SalaryError:
                pass
        self.log("salary.SalaryPayment", salary_services.SalaryPayment.objects.filter(school=self.school).count())

    # ---------------------------------------------------------------- library
    def seed_library(self):
        self.stdout.write("Library...")
        category_names = ["Fiction", "Science", "History", "Reference", "Biography"]
        for name in category_names:
            BookCategory.objects.get_or_create(school=self.school, name=name)
        self.book_categories = list(BookCategory.objects.filter(school=self.school))

        def build_book():
            title = fake.sentence(nb_words=3).rstrip(".")
            Book.objects.create(
                school=self.school, title=title, isbn=fake.isbn13(),
                author=fake.name(), publisher=fake.company(),
                category=self.rand.choice(self.book_categories),
            )

        self.top_up(Book, TARGET, build_book)
        self.books = list(Book.objects.filter(school=self.school))

        for book in self.books:
            for n in range(1, 3):
                BookCopy.objects.get_or_create(school=self.school, book=book, copy_number=f"C{n}")
        self.copies = list(BookCopy.objects.filter(school=self.school, status=BookCopy.Status.AVAILABLE))

        def build_loan():
            self.rand.shuffle(self.copies)
            for copy in self.copies:
                copy.refresh_from_db()
                if copy.status != BookCopy.Status.AVAILABLE:
                    continue
                try:
                    library_services.checkout_book(copy=copy, student=self.rand.choice(self.students))
                except library_services.LibraryError:
                    continue
                return
            raise StopIteration

        from apps.library.models import BookLoan
        self.top_up(BookLoan, 10, build_loan)

        def build_reservation():
            book = self.rand.choice(self.books)
            student = self.rand.choice(self.students)
            if BookReservation.objects.filter(book=book, student=student, status="pending").exists():
                raise StopIteration
            BookReservation.objects.create(school=self.school, book=book, student=student)

        self.top_up(BookReservation, 6, build_reservation)

    # ---------------------------------------------------------------- transport
    def seed_transport(self):
        self.stdout.write("Transport...")

        def build_vehicle():
            Vehicle.objects.create(
                school=self.school, registration_number=f"KD{self.rand.randint(100,999)}{fake.random_uppercase_letter()}",
                make_model=self.rand.choice(["Toyota Coaster", "Isuzu NPR", "Nissan Civilian"]),
                capacity=self.rand.choice([14, 25, 33]),
            )

        self.top_up(Vehicle, 5, build_vehicle)
        self.vehicles = list(Vehicle.objects.filter(school=self.school))

        route_names = ["North Route", "South Route", "East Route", "West Route", "Central Route"]
        for i, name in enumerate(route_names):
            Route.objects.get_or_create(
                school=self.school, name=name, defaults={"vehicle": self.vehicles[i % len(self.vehicles)]}
            )
        self.routes = list(Route.objects.filter(school=self.school))

        def build_stop():
            route = self.rand.choice(self.routes)
            order = Stop.objects.filter(route=route).count() + 1
            Stop.objects.create(
                school=self.school, route=route, name=f"{fake.street_name()} Stop", order=order,
                pickup_time=time(6, 30 + order),
            )

        self.top_up(Stop, 12, build_stop)
        self.stops = list(Stop.objects.filter(school=self.school))

        def build_maintenance():
            Vehicle.objects.filter(school=self.school)
            VehicleMaintenance.objects.create(
                school=self.school, vehicle=self.rand.choice(self.vehicles),
                date=fake.date_between(start_date="-1y", end_date="today"),
                description=self.rand.choice(["Oil change", "Tire replacement", "Brake service", "General inspection"]),
                cost=Decimal(str(self.rand.randint(30, 400))),
            )

        self.top_up(VehicleMaintenance, 6, build_maintenance)

        unassigned_students = [s for s in self.students if not StudentTransportAssignment.objects.filter(student=s).exists()]

        def build_assignment():
            if not unassigned_students:
                raise StopIteration
            student = unassigned_students.pop()
            stop = self.rand.choice(self.stops)
            StudentTransportAssignment.objects.create(
                school=self.school, student=student, route=stop.route, stop=stop
            )

        self.top_up(StudentTransportAssignment, 10, build_assignment)

    # ---------------------------------------------------------------- hostel
    def seed_hostel(self):
        self.stdout.write("Hostel...")
        for name, gender in (("Sunrise Hostel", Hostel.GenderRestriction.MALE), ("Sunset Hostel", Hostel.GenderRestriction.FEMALE)):
            Hostel.objects.get_or_create(
                school=self.school, name=name,
                defaults={"gender_restriction": gender, "warden": self.rand.choice(self.staff)},
            )
        self.hostels = list(Hostel.objects.filter(school=self.school))

        for hostel in self.hostels:
            for i in range(1, 5):
                room, _ = HostelRoom.objects.get_or_create(
                    school=self.school, hostel=hostel, room_number=f"{i:02d}", defaults={"capacity": 4}
                )
                for bed_letter in "ABCD":
                    Bed.objects.get_or_create(school=self.school, room=room, bed_number=bed_letter)
        self.beds = list(Bed.objects.filter(school=self.school))

        eligible_students = [s for s in self.students if not HostelAllocation.objects.filter(student=s, status="active").exists()]

        def build_allocation():
            self.rand.shuffle(self.beds)
            for bed in self.beds:
                if HostelAllocation.objects.filter(bed=bed, status="active").exists():
                    continue
                if not eligible_students:
                    raise StopIteration
                student = eligible_students.pop()
                try:
                    hostel_services.allocate_bed(bed=bed, student=student)
                except hostel_services.HostelError:
                    continue
                return
            raise StopIteration

        self.top_up(HostelAllocation, 10, build_allocation)

    # ---------------------------------------------------------------- medical
    def seed_medical(self):
        self.stdout.write("Medical...")
        students_without_profile = [s for s in self.students if not MedicalProfile.objects.filter(student=s).exists()]

        def build_profile():
            if not students_without_profile:
                raise StopIteration
            student = students_without_profile.pop()
            MedicalProfile.objects.create(
                school=self.school, student=student,
                blood_group=self.rand.choice(["A+", "B+", "O+", "AB+", "O-", "unknown"]),
                allergies=self.rand.choice(["None", "Peanuts", "Penicillin", "Pollen", ""]),
                emergency_contact_name=fake.name(), emergency_contact_phone=fake.phone_number()[:32],
            )

        self.top_up(MedicalProfile, 15, build_profile)

        def build_visit():
            MedicalVisit.objects.create(
                school=self.school, student=self.rand.choice(self.students),
                attended_by=self.rand.choice(self.staff),
                visit_type=self.rand.choice(["routine", "incident", "emergency"]),
                visited_at=timezone.now() - timedelta(days=self.rand.randint(0, 60)),
                symptoms=self.rand.choice(["Headache", "Fever", "Minor cut", "Stomach ache"]),
                treatment=self.rand.choice(["Rest", "Paracetamol", "First aid applied", "Sent home"]),
            )

        self.top_up(MedicalVisit, 10, build_visit)

    # ---------------------------------------------------------------- discipline
    def seed_discipline(self):
        self.stdout.write("Discipline...")
        categories = ["bullying", "vandalism", "tardiness", "academic_dishonesty", "fighting", "other"]

        def build():
            DisciplineIncident.objects.create(
                school=self.school, student=self.rand.choice(self.students),
                category=self.rand.choice(categories), severity=self.rand.choice(["minor", "moderate", "severe"]),
                incident_date=timezone.now() - timedelta(days=self.rand.randint(0, 90)),
                description=fake.sentence(nb_words=10),
                reported_by=self.rand.choice(self.staff).user,
                status=self.rand.choice(["reported", "under_review", "resolved"]),
            )

        self.top_up(DisciplineIncident, 10, build)

    # ---------------------------------------------------------------- communications
    def seed_communications(self):
        self.stdout.write("Communications...")
        target_types = ["school", "class", "staff", "students", "parents"]

        def build():
            Announcement.objects.create(
                school=self.school, title=fake.sentence(nb_words=6).rstrip("."),
                body=fake.paragraph(nb_sentences=4),
                target_type=self.rand.choice(target_types),
                published_by=self.rand.choice(self.staff).user,
                published_at=timezone.now() - timedelta(days=self.rand.randint(0, 30)),
            )

        self.top_up(Announcement, 10, build)

    # ---------------------------------------------------------------- assignments
    def seed_assignments(self):
        self.stdout.write("Assignments...")

        def build():
            school_class = self.rand.choice(self.classes)
            teacher = self.rand.choice(self.teachers)
            Assignment.objects.create(
                school=self.school, title=fake.sentence(nb_words=4).rstrip("."),
                description=fake.paragraph(nb_sentences=2),
                school_class=school_class, subject=self.rand.choice(self.subjects), teacher=teacher,
                term=self.current_term, due_date=timezone.now() + timedelta(days=self.rand.randint(-10, 20)),
                max_score=Decimal("100"), weight=self.rand.choice([20, 30, 50]),
            )

        self.top_up(Assignment, 15, build)
        self.assignments = list(Assignment.objects.filter(school=self.school))

        def build_submission():
            for _ in range(60):
                assignment = self.rand.choice(self.assignments)
                candidates = [s for s in self.students if s.current_class_id == assignment.school_class_id]
                if not candidates:
                    continue
                student = self.rand.choice(candidates)
                if AssignmentSubmission.objects.filter(assignment=assignment, student=student).exists():
                    continue
                score = Decimal(str(self.rand.randint(50, 100)))
                AssignmentSubmission.objects.create(
                    school=self.school, assignment=assignment, student=student,
                    attachment=ContentFile(b"Sample submission content.", name="submission.txt"),
                    status="graded", score=score, feedback="Good work.",
                    graded_by=assignment.teacher, graded_at=timezone.now(),
                )
                return
            raise StopIteration

        self.top_up(AssignmentSubmission, TARGET, build_submission)

    # ---------------------------------------------------------------- documents
    def seed_documents(self):
        self.stdout.write("Documents...")
        category_names = ["Policies", "Forms", "Circulars", "Reports", "Certificates"]
        for name in category_names:
            DocumentCategory.objects.get_or_create(school=self.school, name=name)
        self.doc_categories = list(DocumentCategory.objects.filter(school=self.school))

        def build():
            owner_type = self.rand.choice(["school", "school", "student", "staff"])
            student = staff = None
            if owner_type == "student":
                student = self.rand.choice(self.students)
            elif owner_type == "staff":
                staff = self.rand.choice(self.staff)
            Document.objects.create(
                school=self.school, title=fake.sentence(nb_words=3).rstrip("."),
                description=fake.sentence(nb_words=8),
                category=self.rand.choice(self.doc_categories), owner_type=owner_type,
                student=student, staff=staff,
                file=ContentFile(b"Sample document content.", name="document.txt"),
                uploaded_by=self.rand.choice(self.staff).user,
                is_confidential=self.rand.random() < 0.2,
            )

        self.top_up(Document, 10, build)

    # ---------------------------------------------------------------- inventory
    def seed_inventory(self):
        self.stdout.write("Inventory...")
        category_names = ["Stationery", "Sports Equipment", "Lab Equipment", "Furniture", "Electronics"]
        for name in category_names:
            InventoryCategory.objects.get_or_create(school=self.school, name=name)
        self.inventory_categories = list(InventoryCategory.objects.filter(school=self.school))

        def build_item():
            InventoryItem.objects.create(
                school=self.school, name=fake.word().capitalize() + " " + self.rand.choice(["Set", "Box", "Unit", "Pack"]),
                category=self.rand.choice(self.inventory_categories),
                sku=f"SKU-{self.rand.randint(10000,99999)}", unit=self.rand.choice(["pcs", "box", "litre"]),
                reorder_level=self.rand.randint(5, 20), is_active=True,
            )

        self.top_up(InventoryItem, 15, build_item)
        self.inventory_items = list(InventoryItem.objects.filter(school=self.school))

        recorder = self.staff[0].user if self.staff else None

        def build_txn():
            item = self.rand.choice(self.inventory_items)
            if self.rand.random() < 0.7 or item.quantity_in_stock < 5:
                inventory_services.record_stock_in(
                    item=item, quantity=self.rand.randint(10, 50), reason="Restock", recorded_by=recorder
                )
            else:
                try:
                    inventory_services.record_stock_out(
                        item=item, quantity=self.rand.randint(1, 5), reason="Classroom use", recorded_by=recorder
                    )
                except inventory_services.InventoryError:
                    inventory_services.record_stock_in(item=item, quantity=10, reason="Restock", recorded_by=recorder)

        from apps.inventory.models import InventoryTransaction
        self.top_up(InventoryTransaction, 15, build_txn)

    # ---------------------------------------------------------------- procurement
    def seed_procurement(self):
        self.stdout.write("Procurement...")

        def build_supplier():
            Supplier.objects.create(
                school=self.school, name=fake.company(), contact_person=fake.name(),
                email=fake.company_email(), phone_number=fake.phone_number()[:32],
            )

        self.top_up(Supplier, 6, build_supplier)
        self.suppliers = list(Supplier.objects.filter(school=self.school))

        requester = self.staff[0].user if self.staff else None

        def build_request():
            request = PurchaseRequest.objects.create(
                school=self.school, title=f"Request: {fake.word().capitalize()} supplies",
                notes=fake.sentence(), requested_by=requester,
                status=self.rand.choice(["draft", "submitted", "approved"]),
            )
            for _ in range(self.rand.randint(1, 3)):
                PurchaseRequestItem.objects.create(
                    school=self.school, request=request, description=fake.word().capitalize(),
                    quantity=self.rand.randint(1, 20), estimated_unit_price=Decimal(str(self.rand.randint(5, 100))),
                )

        self.top_up(PurchaseRequest, 8, build_request)

        def build_order():
            order = PurchaseOrder.objects.create(
                school=self.school, order_number=f"PO-{self.rand.randint(100000,999999)}",
                supplier=self.rand.choice(self.suppliers), created_by=requester,
                status=self.rand.choice(["draft", "sent", "received"]),
            )
            for _ in range(self.rand.randint(1, 3)):
                PurchaseOrderItem.objects.create(
                    school=self.school, order=order, description=fake.word().capitalize(),
                    quantity_ordered=self.rand.randint(1, 20), unit_price=Decimal(str(self.rand.randint(5, 100))),
                )
            order.recalculate_total()

        self.top_up(PurchaseOrder, 8, build_order)

    # ---------------------------------------------------------------- events
    def seed_events(self):
        self.stdout.write("Events...")
        categories = ["academic", "sports", "cultural", "meeting", "holiday", "other"]

        def build():
            start = timezone.now() + timedelta(days=self.rand.randint(-20, 60))
            Event.objects.create(
                school=self.school, title=fake.sentence(nb_words=4).rstrip("."),
                description=fake.paragraph(nb_sentences=2), category=self.rand.choice(categories),
                start_datetime=start, end_datetime=start + timedelta(hours=2),
                location=fake.city(), status=self.rand.choice(["draft", "published"]),
                created_by=self.rand.choice(self.staff).user,
            )

        self.top_up(Event, 10, build)

    # ---------------------------------------------------------------- complaints
    def seed_complaints(self):
        self.stdout.write("Complaints...")
        categories = ["academic", "facility", "behavioral", "administrative", "other"]
        submitters = [s.user for s in self.staff] + [g.user for g in self.guardians if g.user_id]

        def build():
            if not submitters:
                raise StopIteration
            complaint = Complaint.objects.create(
                school=self.school, submitted_by=self.rand.choice(submitters),
                category=self.rand.choice(categories), subject=fake.sentence(nb_words=5).rstrip("."),
                description=fake.paragraph(nb_sentences=3), priority=self.rand.choice(["low", "normal", "high"]),
                status=self.rand.choice(["submitted", "under_review", "resolved"]),
            )
            if self.rand.random() < 0.5:
                ComplaintResponse.objects.create(
                    school=self.school, complaint=complaint, author=self.rand.choice(self.staff).user,
                    message=fake.sentence(nb_words=10),
                )

        self.top_up(Complaint, 10, build)

    # ---------------------------------------------------------------- education
    def seed_education(self):
        self.stdout.write("Education...")

        def build():
            Lesson.objects.create(
                school=self.school, title=fake.sentence(nb_words=4).rstrip("."),
                description=fake.paragraph(nb_sentences=2),
                subject=self.rand.choice(self.subjects), school_class=self.rand.choice(self.classes),
                teacher=self.rand.choice(self.teachers), is_active=True,
            )

        self.top_up(Lesson, 10, build)

    # ---------------------------------------------------------------- live sessions
    def seed_live_sessions(self):
        self.stdout.write("Live Sessions...")

        def build():
            LiveSession.objects.create(
                school=self.school, title=fake.sentence(nb_words=4).rstrip("."),
                subject=self.rand.choice(self.subjects), school_class=self.rand.choice(self.classes),
                teacher=self.rand.choice(self.teachers),
                scheduled_start=timezone.now() + timedelta(days=self.rand.randint(-5, 14)),
            )

        self.top_up(LiveSession, 10, build)
