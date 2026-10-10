from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.authorization.permissions import require_permission
from apps.common.views import TenantScopedModelViewSet
from apps.notifications.services import notify

from . import services
from .models import Book, BookCategory, BookCopy, BookLoan, BookReservation
from .serializers import (
    BookCategorySerializer,
    BookCopySerializer,
    BookLoanSerializer,
    BookReservationSerializer,
    BookSerializer,
)

_ACTION_SUFFIX = {
    "list": "view",
    "retrieve": "view",
    "create": "create",
    "update": "update",
    "partial_update": "update",
    "destroy": "delete",
    "return_loan": "update",
    "renew": "update",
    "fulfill": "update",
    "cancel": "update",
    "approve": "update",
    "reject": "update",
}


def _ok(message="", **extra):
    return Response({"success": True, "message": message, "code": "OK", "errors": [], **extra})


class LibraryModelViewSet(TenantScopedModelViewSet):
    """Shared permission wiring for the library.* codes across every library resource."""

    def get_permissions(self):
        code = f"library.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]


class BookCategoryViewSet(LibraryModelViewSet):
    serializer_class = BookCategorySerializer
    search_fields = ["name"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return BookCategory.objects.all()


class BookViewSet(LibraryModelViewSet):
    serializer_class = BookSerializer
    filterset_fields = ["category"]
    search_fields = ["title", "author", "isbn", "publisher"]
    summary_stats = {
        "total": {},
    }

    def get_queryset(self):
        return Book.objects.select_related("category").prefetch_related("copies").all()


class BookCopyViewSet(LibraryModelViewSet):
    serializer_class = BookCopySerializer
    filterset_fields = ["book", "status"]
    summary_stats = {
        "total": {},
        "available": {"status": BookCopy.Status.AVAILABLE},
        "borrowed": {"status": BookCopy.Status.BORROWED},
        "by_status": {"groupby": "status"},
    }

    def get_queryset(self):
        return BookCopy.objects.select_related("book").all()


class BookLoanViewSet(TenantScopedModelViewSet):
    """`create()` is `checkout_book()` — locks the copy row so two simultaneous
    checkouts of the same physical copy can't both succeed. `DELETE` is
    disabled; a loan is returned, never removed."""

    serializer_class = BookLoanSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["copy", "student", "staff", "status"]
    summary_stats = {
        "total": {},
        "borrowed": {"status": BookLoan.Status.BORROWED},
        "overdue": {"status": BookLoan.Status.BORROWED, "due_date__lt": lambda: timezone.now().date()},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        code = f"library.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return BookLoan.objects.select_related("copy__book", "student", "staff__user").all()

    def create(self, request, *args, **kwargs):
        serializer = BookLoanSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            loan = services.checkout_book(copy=data["copy"], student=data.get("student"), staff=data.get("staff"))
        except services.LibraryError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"success": True, "message": "Book checked out.", "code": "OK", "errors": [], "loan": BookLoanSerializer(loan).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="return")
    def return_loan(self, request, pk=None):
        loan = self.get_object()
        try:
            loan = services.return_book(loan=loan)
        except services.LibraryError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _ok("Book returned.", loan=BookLoanSerializer(loan).data)

    @action(detail=True, methods=["post"])
    def renew(self, request, pk=None):
        loan = self.get_object()
        try:
            loan = services.renew_loan(loan=loan)
        except services.LibraryError as exc:
            return Response(
                {"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return _ok("Loan renewed.", loan=BookLoanSerializer(loan).data)


class BookReservationViewSet(TenantScopedModelViewSet):
    serializer_class = BookReservationSerializer
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["book", "student", "staff", "status"]
    summary_stats = {
        "total": {},
        "pending": {"status": BookReservation.Status.PENDING},
        "fulfilled": {"status": BookReservation.Status.FULFILLED},
        "by_status": {"groupby": "status"},
    }

    def get_permissions(self):
        code = f"library.{_ACTION_SUFFIX.get(self.action, 'view')}"
        return [require_permission(code)()]

    def get_queryset(self):
        return BookReservation.objects.select_related("book", "student", "staff__user").all()

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        reservation = self.get_object()
        try:
            reservation = services.decide_reservation(reservation, approve=True, by=request.user, note=request.data.get("note", ""))
        except services.LibraryError as exc:
            return Response({"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []}, status=status.HTTP_400_BAD_REQUEST)
        return _ok("Reservation approved.", reservation=BookReservationSerializer(reservation).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        reservation = self.get_object()
        try:
            reservation = services.decide_reservation(reservation, approve=False, by=request.user, note=request.data.get("note", ""))
        except services.LibraryError as exc:
            return Response({"success": False, "message": str(exc), "code": "VALIDATION_ERROR", "errors": []}, status=status.HTTP_400_BAD_REQUEST)
        return _ok("Reservation rejected.", reservation=BookReservationSerializer(reservation).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        reservation.status = BookReservation.Status.CANCELLED
        reservation.save(update_fields=["status", "updated_at"])
        return _ok("Reservation cancelled.", reservation=BookReservationSerializer(reservation).data)

    @action(detail=True, methods=["post"])
    def fulfill(self, request, pk=None):
        reservation = self.get_object()
        reservation.status = BookReservation.Status.FULFILLED
        reservation.save(update_fields=["status", "updated_at"])
        recipient_user = (
            reservation.student.user if reservation.student_id and reservation.student.user_id
            else reservation.staff.user if reservation.staff_id
            else None
        )
        if recipient_user:
            notify(
                recipient=recipient_user,
                category="library",
                title="Your reserved book is ready",
                message=f"\"{reservation.book.title}\" is ready for pickup.",
                link="/library/reservations",
                email_subject=f"Ready for pickup: {reservation.book.title}",
                email_html=(
                    f"<p>Your reserved copy of \"{reservation.book.title}\" is now ready for pickup "
                    f"from the library.</p>"
                ),
            )
        return _ok("Reservation fulfilled.", reservation=BookReservationSerializer(reservation).data)
