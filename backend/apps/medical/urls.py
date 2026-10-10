from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import MedicalProfileViewSet, MedicalVisitViewSet, MyMedicalView

router = DefaultRouter()
router.register("profiles", MedicalProfileViewSet, basename="medical-profile")
router.register("visits", MedicalVisitViewSet, basename="medical-visit")

app_name = "medical"

urlpatterns = [
    path("my-medical/", MyMedicalView.as_view(), name="my-medical"),
] + router.urls
