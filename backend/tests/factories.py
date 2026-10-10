from datetime import date, time
from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from apps.academics.models import (
    AcademicYear,
    Assessment,
    AssessmentScore,
    Department,
    SchoolClass,
    Section,
    StudentSubjectEnrollment,
    Subject,
    SubjectOffering,
    Term,
)
from apps.assignments.models import Assignment, AssignmentSubmission
from apps.attendance.models import AttendanceStatus, StaffAttendance, StudentAttendance
from apps.communications.models import Announcement, AnnouncementRecipient
from apps.discipline.models import DisciplineIncident
from apps.documents.models import Document, DocumentCategory
from apps.inventory.models import InventoryCategory, InventoryItem, InventoryTransaction
from apps.notifications.models import Notification
from apps.examinations.models import Exam, ExamSchedule, GradeBoundary, GradingScale, Result
from apps.finance.models import FeeCategory, FeeStructure, FeeStructureItem, Invoice, InvoiceLineItem, Payment
from apps.hostel.models import Bed, Hostel, HostelAllocation
from apps.hostel.models import Room as HostelRoom
from apps.library.models import Book, BookCategory, BookCopy, BookLoan
from apps.medical.models import MedicalProfile, MedicalVisit
from apps.parents.models import Guardian
from apps.procurement.models import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem, Supplier
from apps.staff.models import Staff
from apps.students.models import Student
from apps.tenants.models import School
from apps.timetable.models import Period, Room, TimetableEntry
from apps.transport.models import Route, Stop, Vehicle
from apps.users.models import User

DEFAULT_TEST_PASSWORD = "TestPass123!secure"


class SchoolFactory(DjangoModelFactory):
    class Meta:
        model = School

    name = factory.Sequence(lambda n: f"Test School {n}")
    slug = factory.Sequence(lambda n: f"test-school-{n}")
    status = School.Status.ACTIVE


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.test")
    first_name = "Test"
    last_name = "User"
    user_type = User.UserType.SCHOOL_USER
    school = factory.SubFactory(SchoolFactory)
    is_active = True

    @factory.post_generation
    def set_password(self, create, extracted, **kwargs):
        self.set_password(extracted or DEFAULT_TEST_PASSWORD)
        if create:
            self.save(update_fields=["password"])


class AcademicYearFactory(DjangoModelFactory):
    class Meta:
        model = AcademicYear

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"AY-{n}")
    start_date = date(2025, 9, 1)
    end_date = date(2026, 7, 31)
    is_current = True


class TermFactory(DjangoModelFactory):
    class Meta:
        model = Term

    school = factory.SubFactory(SchoolFactory)
    academic_year = factory.SubFactory(AcademicYearFactory, school=factory.SelfAttribute("..school"))
    name = "Term 1"
    sequence = factory.Sequence(lambda n: n + 1)
    start_date = date(2025, 9, 1)
    end_date = date(2025, 12, 15)


class DepartmentFactory(DjangoModelFactory):
    class Meta:
        model = Department

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Department {n}")


class SubjectFactory(DjangoModelFactory):
    class Meta:
        model = Subject

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Subject {n}")


class SchoolClassFactory(DjangoModelFactory):
    class Meta:
        model = SchoolClass

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Grade {n}")
    order = factory.Sequence(lambda n: n)


class SectionFactory(DjangoModelFactory):
    class Meta:
        model = Section

    school = factory.SubFactory(SchoolFactory)
    school_class = factory.SubFactory(SchoolClassFactory, school=factory.SelfAttribute("..school"))
    academic_year = factory.SubFactory(AcademicYearFactory, school=factory.SelfAttribute("..school"))
    name = "A"


class StaffFactory(DjangoModelFactory):
    class Meta:
        model = Staff

    school = factory.SubFactory(SchoolFactory)
    user = factory.SubFactory(UserFactory, school=factory.SelfAttribute("..school"))
    job_title = "Teacher"


class SubjectOfferingFactory(DjangoModelFactory):
    class Meta:
        model = SubjectOffering

    school = factory.SubFactory(SchoolFactory)
    subject = factory.SubFactory(SubjectFactory, school=factory.SelfAttribute("..school"))
    academic_year = factory.SubFactory(AcademicYearFactory, school=factory.SelfAttribute("..school"))
    term = factory.SubFactory(
        TermFactory,
        school=factory.SelfAttribute("..school"),
        academic_year=factory.SelfAttribute("..academic_year"),
    )
    school_class = factory.SubFactory(SchoolClassFactory, school=factory.SelfAttribute("..school"))
    main_teacher = factory.SubFactory(StaffFactory, school=factory.SelfAttribute("..school"))
    ca_weight_percent = 40
    exam_weight_percent = 60
    pass_mark = 50


class StudentFactory(DjangoModelFactory):
    class Meta:
        model = Student

    school = factory.SubFactory(SchoolFactory)
    admission_number = factory.Sequence(lambda n: f"ADM{n:04d}")
    first_name = "Stu"
    last_name = "Dent"


class StudentSubjectEnrollmentFactory(DjangoModelFactory):
    class Meta:
        model = StudentSubjectEnrollment

    school = factory.SubFactory(SchoolFactory)
    subject_offering = factory.SubFactory(SubjectOfferingFactory, school=factory.SelfAttribute("..school"))
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))


class AssessmentFactory(DjangoModelFactory):
    class Meta:
        model = Assessment

    school = factory.SubFactory(SchoolFactory)
    subject_offering = factory.SubFactory(SubjectOfferingFactory, school=factory.SelfAttribute("..school"))
    name = factory.Sequence(lambda n: f"Assessment {n}")
    weight = 20
    max_score = Decimal("100")


class AssessmentScoreFactory(DjangoModelFactory):
    class Meta:
        model = AssessmentScore

    school = factory.SubFactory(SchoolFactory)
    assessment = factory.SubFactory(AssessmentFactory, school=factory.SelfAttribute("..school"))
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    raw_score = Decimal("80")


class GuardianFactory(DjangoModelFactory):
    class Meta:
        model = Guardian

    school = factory.SubFactory(SchoolFactory)
    first_name = "Gary"
    last_name = "Guardian"


class RoomFactory(DjangoModelFactory):
    class Meta:
        model = Room

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Room {n}")


class PeriodFactory(DjangoModelFactory):
    class Meta:
        model = Period

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Period {n}")
    start_time = time(8, 0)
    end_time = time(8, 45)
    order = factory.Sequence(lambda n: n)


class TimetableEntryFactory(DjangoModelFactory):
    class Meta:
        model = TimetableEntry

    school = factory.SubFactory(SchoolFactory)
    section = factory.SubFactory(SectionFactory, school=factory.SelfAttribute("..school"))
    period = factory.SubFactory(PeriodFactory, school=factory.SelfAttribute("..school"))
    day_of_week = TimetableEntry.Day.MONDAY


class StudentAttendanceFactory(DjangoModelFactory):
    class Meta:
        model = StudentAttendance

    school = factory.SubFactory(SchoolFactory)
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    date = date(2026, 1, 15)
    status = AttendanceStatus.PRESENT


class StaffAttendanceFactory(DjangoModelFactory):
    class Meta:
        model = StaffAttendance

    school = factory.SubFactory(SchoolFactory)
    staff = factory.SubFactory(StaffFactory, school=factory.SelfAttribute("..school"))
    date = date(2026, 1, 15)
    status = AttendanceStatus.PRESENT


class GradingScaleFactory(DjangoModelFactory):
    class Meta:
        model = GradingScale

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Grading Scale {n}")


class GradeBoundaryFactory(DjangoModelFactory):
    class Meta:
        model = GradeBoundary

    school = factory.SubFactory(SchoolFactory)
    grading_scale = factory.SubFactory(GradingScaleFactory, school=factory.SelfAttribute("..school"))
    grade = "A"
    min_score = 80
    max_score = 100


class ExamFactory(DjangoModelFactory):
    class Meta:
        model = Exam

    school = factory.SubFactory(SchoolFactory)
    term = factory.SubFactory(TermFactory, school=factory.SelfAttribute("..school"))
    name = factory.Sequence(lambda n: f"Exam {n}")
    start_date = date(2025, 11, 1)
    end_date = date(2025, 11, 10)


class ExamScheduleFactory(DjangoModelFactory):
    class Meta:
        model = ExamSchedule

    school = factory.SubFactory(SchoolFactory)
    exam = factory.SubFactory(ExamFactory, school=factory.SelfAttribute("..school"))
    school_class = factory.SubFactory(SchoolClassFactory, school=factory.SelfAttribute("..school"))
    subject = factory.SubFactory(SubjectFactory, school=factory.SelfAttribute("..school"))
    max_score = 100


class ResultFactory(DjangoModelFactory):
    class Meta:
        model = Result

    school = factory.SubFactory(SchoolFactory)
    exam_schedule = factory.SubFactory(ExamScheduleFactory, school=factory.SelfAttribute("..school"))
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    score = 85


class FeeCategoryFactory(DjangoModelFactory):
    class Meta:
        model = FeeCategory

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Fee Category {n}")


class FeeStructureFactory(DjangoModelFactory):
    class Meta:
        model = FeeStructure

    school = factory.SubFactory(SchoolFactory)
    academic_year = factory.SubFactory(AcademicYearFactory, school=factory.SelfAttribute("..school"))
    name = factory.Sequence(lambda n: f"Fee Structure {n}")


class FeeStructureItemFactory(DjangoModelFactory):
    class Meta:
        model = FeeStructureItem

    school = factory.SubFactory(SchoolFactory)
    fee_structure = factory.SubFactory(FeeStructureFactory, school=factory.SelfAttribute("..school"))
    fee_category = factory.SubFactory(FeeCategoryFactory, school=factory.SelfAttribute("..school"))
    amount = Decimal("100.00")


class InvoiceFactory(DjangoModelFactory):
    """
    Sets subtotal/total directly for test-setup convenience rather than via
    line items + recalculate_amounts() — tests that care about the real
    line-item-driven computation should create line items explicitly and
    call recalculate_amounts(), or go through services.create_invoice_with_line_items().
    """

    class Meta:
        model = Invoice

    school = factory.SubFactory(SchoolFactory)
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    academic_year = factory.SubFactory(AcademicYearFactory, school=factory.SelfAttribute("..school"))
    invoice_number = factory.Sequence(lambda n: f"INV-{n:06d}")
    subtotal = Decimal("100.00")
    total = Decimal("100.00")
    amount_paid = Decimal("0.00")
    # Must track total - amount_paid explicitly: the model field defaults to
    # 0 and nothing recomputes it for a factory-built invoice (real code
    # paths only update balance via Invoice.recalculate_amounts() or the
    # payment/refund services) — leaving it at the model default caused
    # record_payment()'s "amount exceeds balance" check to reject every
    # payment against a factory-built invoice, since balance read as 0
    # regardless of `total`.
    balance = factory.LazyAttribute(lambda o: o.total - o.amount_paid)


class InvoiceLineItemFactory(DjangoModelFactory):
    class Meta:
        model = InvoiceLineItem

    school = factory.SubFactory(SchoolFactory)
    invoice = factory.SubFactory(InvoiceFactory, school=factory.SelfAttribute("..school"))
    line_type = InvoiceLineItem.LineType.CHARGE
    amount = Decimal("100.00")


class PaymentFactory(DjangoModelFactory):
    class Meta:
        model = Payment

    school = factory.SubFactory(SchoolFactory)
    invoice = factory.SubFactory(InvoiceFactory, school=factory.SelfAttribute("..school"))
    receipt_number = factory.Sequence(lambda n: f"RCT-{n:06d}")
    amount = Decimal("50.00")
    method = Payment.Method.CASH


class BookCategoryFactory(DjangoModelFactory):
    class Meta:
        model = BookCategory

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Category {n}")


class BookFactory(DjangoModelFactory):
    class Meta:
        model = Book

    school = factory.SubFactory(SchoolFactory)
    title = factory.Sequence(lambda n: f"Book {n}")


class BookCopyFactory(DjangoModelFactory):
    class Meta:
        model = BookCopy

    school = factory.SubFactory(SchoolFactory)
    book = factory.SubFactory(BookFactory, school=factory.SelfAttribute("..school"))
    copy_number = factory.Sequence(lambda n: f"C-{n:04d}")


class BookLoanFactory(DjangoModelFactory):
    class Meta:
        model = BookLoan

    school = factory.SubFactory(SchoolFactory)
    copy = factory.SubFactory(BookCopyFactory, school=factory.SelfAttribute("..school"))
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    borrowed_date = date(2026, 1, 1)
    due_date = date(2026, 1, 15)


class VehicleFactory(DjangoModelFactory):
    class Meta:
        model = Vehicle

    school = factory.SubFactory(SchoolFactory)
    registration_number = factory.Sequence(lambda n: f"VEH-{n:04d}")


class RouteFactory(DjangoModelFactory):
    class Meta:
        model = Route

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Route {n}")


class StopFactory(DjangoModelFactory):
    class Meta:
        model = Stop

    school = factory.SubFactory(SchoolFactory)
    route = factory.SubFactory(RouteFactory, school=factory.SelfAttribute("..school"))
    name = factory.Sequence(lambda n: f"Stop {n}")
    order = factory.Sequence(lambda n: n)


class HostelFactory(DjangoModelFactory):
    class Meta:
        model = Hostel

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Hostel {n}")


class HostelRoomFactory(DjangoModelFactory):
    class Meta:
        model = HostelRoom

    school = factory.SubFactory(SchoolFactory)
    hostel = factory.SubFactory(HostelFactory, school=factory.SelfAttribute("..school"))
    room_number = factory.Sequence(lambda n: f"R-{n:03d}")


class BedFactory(DjangoModelFactory):
    class Meta:
        model = Bed

    school = factory.SubFactory(SchoolFactory)
    room = factory.SubFactory(HostelRoomFactory, school=factory.SelfAttribute("..school"))
    bed_number = factory.Sequence(lambda n: f"B-{n}")


class HostelAllocationFactory(DjangoModelFactory):
    class Meta:
        model = HostelAllocation

    school = factory.SubFactory(SchoolFactory)
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    bed = factory.SubFactory(BedFactory, school=factory.SelfAttribute("..school"))
    check_in_date = date(2026, 1, 1)


class MedicalProfileFactory(DjangoModelFactory):
    class Meta:
        model = MedicalProfile

    school = factory.SubFactory(SchoolFactory)
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))


class MedicalVisitFactory(DjangoModelFactory):
    class Meta:
        model = MedicalVisit

    school = factory.SubFactory(SchoolFactory)
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    visited_at = "2026-01-01T09:00:00Z"


class DisciplineIncidentFactory(DjangoModelFactory):
    class Meta:
        model = DisciplineIncident

    school = factory.SubFactory(SchoolFactory)
    student = factory.SubFactory(StudentFactory, school=factory.SelfAttribute("..school"))
    incident_date = "2026-01-01T09:00:00Z"
    description = "Test incident"


class NotificationFactory(DjangoModelFactory):
    class Meta:
        model = Notification

    school = factory.SubFactory(SchoolFactory)
    recipient = factory.SubFactory(UserFactory, school=factory.SelfAttribute("..school"))
    category = "general"
    title = factory.Sequence(lambda n: f"Notification {n}")
    message = "Test notification message"


class AnnouncementFactory(DjangoModelFactory):
    class Meta:
        model = Announcement

    school = factory.SubFactory(SchoolFactory)
    title = factory.Sequence(lambda n: f"Announcement {n}")
    body = "Test announcement body"
    target_type = Announcement.TargetType.SCHOOL


class AnnouncementRecipientFactory(DjangoModelFactory):
    class Meta:
        model = AnnouncementRecipient

    school = factory.SubFactory(SchoolFactory)
    announcement = factory.SubFactory(AnnouncementFactory, school=factory.SelfAttribute("..school"))
    user = factory.SubFactory(UserFactory, school=factory.SelfAttribute("..school"))


class AssignmentFactory(DjangoModelFactory):
    class Meta:
        model = Assignment

    school = factory.SubFactory(SchoolFactory)
    school_class = factory.SubFactory(SchoolClassFactory, school=factory.SelfAttribute("..school"))
    subject = factory.SubFactory(SubjectFactory, school=factory.SelfAttribute("..school"))
    teacher = factory.SubFactory(StaffFactory, school=factory.SelfAttribute("..school"))
    title = factory.Sequence(lambda n: f"Assignment {n}")
    due_date = "2026-02-01T23:59:00Z"
    max_score = Decimal("100.00")


class AssignmentSubmissionFactory(DjangoModelFactory):
    class Meta:
        model = AssignmentSubmission

    school = factory.SubFactory(SchoolFactory)
    assignment = factory.SubFactory(AssignmentFactory, school=factory.SelfAttribute("..school"))
    student = factory.SubFactory(
        StudentFactory,
        school=factory.SelfAttribute("..school"),
        current_class=factory.SelfAttribute("..assignment.school_class"),
    )
    attachment = factory.django.FileField(filename="submission.pdf", data=b"test submission content")


class DocumentCategoryFactory(DjangoModelFactory):
    class Meta:
        model = DocumentCategory

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Category {n}")


class DocumentFactory(DjangoModelFactory):
    class Meta:
        model = Document

    school = factory.SubFactory(SchoolFactory)
    title = factory.Sequence(lambda n: f"Document {n}")
    owner_type = Document.OwnerType.SCHOOL
    file = factory.django.FileField(filename="document.pdf", data=b"test document content")


class InventoryCategoryFactory(DjangoModelFactory):
    class Meta:
        model = InventoryCategory

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Inventory Category {n}")


class InventoryItemFactory(DjangoModelFactory):
    class Meta:
        model = InventoryItem

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Item {n}")
    unit = "pcs"
    quantity_in_stock = 10
    reorder_level = 5


class InventoryTransactionFactory(DjangoModelFactory):
    class Meta:
        model = InventoryTransaction

    school = factory.SubFactory(SchoolFactory)
    item = factory.SubFactory(InventoryItemFactory, school=factory.SelfAttribute("..school"))
    transaction_type = InventoryTransaction.TransactionType.STOCK_IN
    quantity = 5


class SupplierFactory(DjangoModelFactory):
    class Meta:
        model = Supplier

    school = factory.SubFactory(SchoolFactory)
    name = factory.Sequence(lambda n: f"Supplier {n}")


class PurchaseRequestFactory(DjangoModelFactory):
    class Meta:
        model = PurchaseRequest

    school = factory.SubFactory(SchoolFactory)
    title = factory.Sequence(lambda n: f"Purchase Request {n}")


class PurchaseRequestItemFactory(DjangoModelFactory):
    class Meta:
        model = PurchaseRequestItem

    school = factory.SubFactory(SchoolFactory)
    request = factory.SubFactory(PurchaseRequestFactory, school=factory.SelfAttribute("..school"))
    description = "Whiteboard markers"
    quantity = 10
    estimated_unit_price = Decimal("5.00")


class PurchaseOrderFactory(DjangoModelFactory):
    class Meta:
        model = PurchaseOrder

    school = factory.SubFactory(SchoolFactory)
    order_number = factory.Sequence(lambda n: f"PO-{n:06d}")
    supplier = factory.SubFactory(SupplierFactory, school=factory.SelfAttribute("..school"))


class PurchaseOrderItemFactory(DjangoModelFactory):
    class Meta:
        model = PurchaseOrderItem

    school = factory.SubFactory(SchoolFactory)
    order = factory.SubFactory(PurchaseOrderFactory, school=factory.SelfAttribute("..school"))
    description = "A4 Paper Ream"
    quantity_ordered = 20
    unit_price = Decimal("3.50")


class PlatformAdminFactory(DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"admin{n}@platform.test")
    first_name = "Platform"
    last_name = "Admin"
    user_type = User.UserType.PLATFORM_ADMIN
    school = None
    is_active = True
    is_staff = True

    @factory.post_generation
    def set_password(self, create, extracted, **kwargs):
        self.set_password(extracted or DEFAULT_TEST_PASSWORD)
        if create:
            self.save(update_fields=["password"])
