from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DocumentCategoryViewSet, DocumentViewSet, MyDocumentsView

router = DefaultRouter()
router.register("document-categories", DocumentCategoryViewSet, basename="document-category")
router.register("documents", DocumentViewSet, basename="document")

app_name = "documents"

urlpatterns = [
    path("documents/me/", MyDocumentsView.as_view(), name="my-documents"),
] + router.urls
