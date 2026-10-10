from decimal import Decimal

from django.db import models

from apps.common.models import TimeStampedModel
from apps.tenants.models import TenantScopedModel

DEFAULT_FINE_PER_DAY = Decimal("0.50")
DEFAULT_LOAN_DAYS = 14
MAX_RENEWALS = 2


class BookCategory(TenantScopedModel, TimeStampedModel):
    name = models.CharField(max_length=100)

    class Meta:
        db_table = "book_categories"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_book_category_per_school"),
        ]

    def __str__(self):
        return self.name


class Book(TenantScopedModel, TimeStampedModel):
    title = models.CharField(max_length=255)
    isbn = models.CharField(max_length=20, blank=True)
    author = models.CharField(max_length=255, blank=True)
    publisher = models.CharField(max_length=255, blank=True)
    category = models.ForeignKey(
        BookCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="books"
    )
    description = models.CharField(max_length=1000, blank=True)

    class Meta:
        db_table = "library_books"
        ordering = ["title"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "isbn"], condition=~models.Q(isbn=""), name="unique_book_isbn_per_school"
            ),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.category_id and self.category.school_id != self.school_id:
            raise ValueError("Book.category must belong to the same school")
        super().save(*args, **kwargs)


class BookCopy(TenantScopedModel, TimeStampedModel):
    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        BORROWED = "borrowed", "Borrowed"
        RESERVED = "reserved", "Reserved"
        LOST = "lost", "Lost"
        DAMAGED = "damaged", "Damaged"

    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="copies")
    copy_number = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)

    class Meta:
        db_table = "library_book_copies"
        ordering = ["copy_number"]
        constraints = [
            models.UniqueConstraint(fields=["book", "copy_number"], name="unique_copy_number_per_book"),
        ]

    def __str__(self):
        return f"{self.book.title} - {self.copy_number}"

    def save(self, *args, **kwargs):
        if self.book.school_id != self.school_id:
            raise ValueError("BookCopy.book must belong to the same school")
        super().save(*args, **kwargs)


class BookLoan(TenantScopedModel, TimeStampedModel):
    class Status(models.TextChoices):
        BORROWED = "borrowed", "Borrowed"
        RETURNED = "returned", "Returned"
        LOST = "lost", "Lost"

    copy = models.ForeignKey(BookCopy, on_delete=models.CASCADE, related_name="loans")
    student = models.ForeignKey(
        "students.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="book_loans"
    )
    staff = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.CASCADE, related_name="book_loans"
    )
    borrowed_date = models.DateField()
    due_date = models.DateField()
    returned_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.BORROWED)
    renewal_count = models.PositiveIntegerField(default=0)
    fine_amount = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0.00"))

    class Meta:
        db_table = "library_book_loans"
        ordering = ["-borrowed_date"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(student__isnull=False, staff__isnull=True)
                    | models.Q(student__isnull=True, staff__isnull=False)
                ),
                name="book_loan_exactly_one_borrower",
            ),
        ]

    def __str__(self):
        return f"{self.copy} - {self.student or self.staff}"

    def save(self, *args, **kwargs):
        if self.copy.school_id != self.school_id:
            raise ValueError("BookLoan.copy must belong to the same school")
        if self.student_id and self.student.school_id != self.school_id:
            raise ValueError("BookLoan.student must belong to the same school")
        if self.staff_id and self.staff.school_id != self.school_id:
            raise ValueError("BookLoan.staff must belong to the same school")
        super().save(*args, **kwargs)

    @property
    def borrower_name(self):
        if self.student_id:
            return self.student.full_name
        if self.staff_id:
            return self.staff.user.full_name
        return None


class BookReservation(TenantScopedModel, TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        FULFILLED = "fulfilled", "Fulfilled"
        CANCELLED = "cancelled", "Cancelled"

    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="reservations")
    student = models.ForeignKey(
        "students.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="book_reservations"
    )
    staff = models.ForeignKey(
        "staff.Staff", null=True, blank=True, on_delete=models.CASCADE, related_name="book_reservations"
    )
    reserved_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    # The librarian's decision on a request made by a student or teacher.
    decision_note = models.CharField(max_length=500, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        db_table = "library_book_reservations"
        ordering = ["reserved_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(student__isnull=False, staff__isnull=True)
                    | models.Q(student__isnull=True, staff__isnull=False)
                ),
                name="book_reservation_exactly_one_requester",
            ),
        ]

    def __str__(self):
        return f"{self.book.title} reservation"

    def save(self, *args, **kwargs):
        if self.book.school_id != self.school_id:
            raise ValueError("BookReservation.book must belong to the same school")
        if self.student_id and self.student.school_id != self.school_id:
            raise ValueError("BookReservation.student must belong to the same school")
        if self.staff_id and self.staff.school_id != self.school_id:
            raise ValueError("BookReservation.staff must belong to the same school")
        super().save(*args, **kwargs)
