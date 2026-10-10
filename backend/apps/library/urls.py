from django.urls import path
from rest_framework.routers import DefaultRouter

from .patron import LibraryBorrowView, LibraryCatalogView, LibraryReserveView, MyLibraryView, MyReservationCancelView

from .views import BookCategoryViewSet, BookCopyViewSet, BookLoanViewSet, BookReservationViewSet, BookViewSet

router = DefaultRouter()
router.register("categories", BookCategoryViewSet, basename="book-category")
router.register("books", BookViewSet, basename="book")
router.register("copies", BookCopyViewSet, basename="book-copy")
router.register("loans", BookLoanViewSet, basename="book-loan")
router.register("reservations", BookReservationViewSet, basename="book-reservation")

app_name = "library"

urlpatterns = [
    path("catalog/", LibraryCatalogView.as_view(), name="library-catalog"),
    path("catalog/<uuid:pk>/reserve/", LibraryReserveView.as_view(), name="library-reserve"),
    path("catalog/<uuid:pk>/borrow/", LibraryBorrowView.as_view(), name="library-borrow"),
    path("my/", MyLibraryView.as_view(), name="library-my"),
    path("my/reservations/<uuid:pk>/cancel/", MyReservationCancelView.as_view(), name="library-my-reservation-cancel"),
] + router.urls
