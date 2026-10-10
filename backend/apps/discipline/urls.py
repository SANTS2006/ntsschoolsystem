from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DisciplineIncidentViewSet, MyDisciplineView

router = DefaultRouter()
router.register("incidents", DisciplineIncidentViewSet, basename="discipline-incident")

app_name = "discipline"

urlpatterns = [
    path("my-discipline/", MyDisciplineView.as_view(), name="my-discipline"),
] + router.urls
