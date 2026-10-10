from django.contrib import admin

from .models import Book, BookCategory, BookCopy, BookLoan, BookReservation


class BookCopyInline(admin.TabularInline):
    model = BookCopy
    extra = 0


@admin.register(BookCategory)
class BookCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "school")
    list_filter = ("school",)

    def get_queryset(self, request):
        return BookCategory.unscoped_objects.all()


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "isbn", "school", "category")
    list_filter = ("school", "category")
    search_fields = ("title", "author", "isbn")
    inlines = [BookCopyInline]

    def get_queryset(self, request):
        return Book.unscoped_objects.all()


@admin.register(BookLoan)
class BookLoanAdmin(admin.ModelAdmin):
    list_display = ("copy", "borrower_name", "borrowed_date", "due_date", "status", "fine_amount")
    list_filter = ("school", "status")

    def get_queryset(self, request):
        return BookLoan.unscoped_objects.all()


@admin.register(BookReservation)
class BookReservationAdmin(admin.ModelAdmin):
    list_display = ("book", "reserved_at", "status")
    list_filter = ("school", "status")

    def get_queryset(self, request):
        return BookReservation.unscoped_objects.all()
