from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import LessonEnrollmentViewSet, LessonMaterialViewSet, LessonViewSet, MyLessonsView

router = DefaultRouter()
router.register("education/lessons", LessonViewSet, basename="lesson")
router.register("education/materials", LessonMaterialViewSet, basename="lesson-material")
router.register("education/enrollments", LessonEnrollmentViewSet, basename="lesson-enrollment")

app_name = "education"

urlpatterns = [
    path("education/my-lessons/", MyLessonsView.as_view(), name="my-lessons"),
] + router.urls
