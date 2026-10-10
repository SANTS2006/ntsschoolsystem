from rest_framework import serializers

from .models import Book, BookCategory, BookCopy, BookLoan, BookReservation


class BookCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = BookCategory
        fields = ["id", "name", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        # `school` is never a serializer field (set server-side in perform_create), so DRF's
        # automatic unique-together validator never fires for `unique_book_category_per_school`
        # — same gap already fixed for Timetable's Room/Period (Phase 20) and Finance's
        # FeeCategory/FeeStructure (Phase 23). Checked explicitly here instead.
        school = self.context["request"].user.school
        qs = BookCategory.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A book category with this name already exists.")
        return value


class BookSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    available_copies = serializers.SerializerMethodField()
    # Only used when adding a book: how many copies the library holds, and (optionally) the library's own number for
    # each. Numbers not given are generated; copies can still be added or removed one by one afterwards.
    copy_count = serializers.IntegerField(write_only=True, required=False, min_value=0, max_value=500, default=0)
    copy_numbers = serializers.ListField(
        child=serializers.CharField(max_length=50, allow_blank=False), write_only=True, required=False, allow_empty=True
    )

    class Meta:
        model = Book
        fields = [
            "id", "title", "isbn", "author", "publisher", "category", "category_name",
            "description", "available_copies", "copy_count", "copy_numbers", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_copy_numbers(self, value):
        cleaned = [v.strip() for v in value if v and v.strip()]
        if len(set(n.lower() for n in cleaned)) != len(cleaned):
            raise serializers.ValidationError("Each copy needs its own number; two of them are the same.")
        return cleaned

    def create(self, validated_data):
        count = validated_data.pop("copy_count", 0)
        numbers = validated_data.pop("copy_numbers", [])
        book = super().create(validated_data)
        total = max(count, len(numbers))
        if total:
            prefix = (book.isbn or f"BK{str(book.id)[:4].upper()}").replace(" ", "")
            used = {n.lower() for n in numbers}
            chosen = list(numbers)
            n = 1
            while len(chosen) < total:
                candidate = f"{prefix}-{n:03d}"
                n += 1
                if candidate.lower() not in used:
                    chosen.append(candidate)
                    used.add(candidate.lower())
            BookCopy.objects.bulk_create([BookCopy(school=book.school, book=book, copy_number=c) for c in chosen])
        return book

    def update(self, instance, validated_data):
        validated_data.pop("copy_count", None)
        validated_data.pop("copy_numbers", None)
        return super().update(instance, validated_data)

    def get_available_copies(self, obj):
        return obj.copies.filter(status=BookCopy.Status.AVAILABLE).count()

    def validate_category(self, value):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError("Category must belong to your own school.")
        return value

    def validate_isbn(self, value):
        # Same gap as BookCategorySerializer.validate_name, compounded: `unique_book_isbn_per_school`
        # is also a *conditional* constraint (`condition=~Q(isbn="")`), and DRF's automatic
        # validator generation skips conditional constraints entirely even when every field is
        # present — so this needs the same blank-skipping shape the DB partial index uses.
        if not value:
            return value
        school = self.context["request"].user.school
        qs = Book.objects.filter(school=school, isbn=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A book with this ISBN already exists.")
        return value


class BookCopySerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source="book.title", read_only=True)

    class Meta:
        model = BookCopy
        fields = ["id", "book", "book_title", "copy_number", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def validate_book(self, value):
        request = self.context["request"]
        if value.school_id != request.user.school_id:
            raise serializers.ValidationError("Book must belong to your own school.")
        return value


class BookLoanSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source="copy.book.title", read_only=True)
    copy_number = serializers.CharField(source="copy.copy_number", read_only=True)
    borrower_name = serializers.CharField(read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = BookLoan
        fields = [
            "id", "copy", "book_title", "copy_number", "student", "staff", "borrower_name",
            "borrowed_date", "due_date", "returned_date", "status", "renewal_count",
            "fine_amount", "is_overdue", "created_at", "updated_at",
        ]
        read_only_fields = [
            # borrowed_date/due_date are computed by services.checkout_book()
            # (today, and today + loan_days) — never client-supplied, same as
            # the other server-managed fields below.
            "id", "borrowed_date", "due_date", "returned_date", "status", "renewal_count",
            "fine_amount", "created_at", "updated_at",
        ]

    def get_is_overdue(self, obj):
        from django.utils import timezone

        return obj.status == BookLoan.Status.BORROWED and obj.due_date < timezone.now().date()

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_copy(self, value):
        return self._same_school(value, "Copy")

    def validate_student(self, value):
        return self._same_school(value, "Student")

    def validate_staff(self, value):
        return self._same_school(value, "Staff")

    def validate(self, attrs):
        student = attrs.get("student")
        staff = attrs.get("staff")
        if bool(student) == bool(staff):
            raise serializers.ValidationError("Exactly one of student or staff must be set.")
        return attrs


class BookReservationSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source="book.title", read_only=True)
    requester_name = serializers.SerializerMethodField()

    def get_requester_name(self, obj):
        if obj.student_id:
            return obj.student.full_name
        return obj.staff.user.full_name if obj.staff_id else None

    class Meta:
        model = BookReservation
        fields = [
            "id", "book", "book_title", "student", "staff", "requester_name", "reserved_at", "status",
            "decision_note", "decided_at",
        ]
        read_only_fields = ["id", "reserved_at", "status", "decision_note", "decided_at", "requester_name"]

    def _same_school(self, value, label):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError(f"{label} must belong to your own school.")
        return value

    def validate_book(self, value):
        return self._same_school(value, "Book")

    def validate_student(self, value):
        return self._same_school(value, "Student")

    def validate_staff(self, value):
        return self._same_school(value, "Staff")

    def validate(self, attrs):
        student = attrs.get("student")
        staff = attrs.get("staff")
        if bool(student) == bool(staff):
            raise serializers.ValidationError("Exactly one of student or staff must be set.")
        return attrs
