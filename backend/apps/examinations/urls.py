from django.urls import path
from rest_framework.routers import DefaultRouter

from .timetable import (
    ExamScheduleRoomsView,
    ExamTimetableOptionsView,
    ExamTimetablePublishView,
    ExamTimetableView,
    MyExamTimetableView,
)
from .views import (
    ExamScheduleViewSet,
    ExamViewSet,
    GradeBoundaryViewSet,
    GradingScaleViewSet,
    MyTranscriptView,
)

router = DefaultRouter()
router.register("grading-scales", GradingScaleViewSet, basename="grading-scale")
router.register("grade-boundaries", GradeBoundaryViewSet, basename="grade-boundary")
router.register("exams", ExamViewSet, basename="exam")
router.register("schedules", ExamScheduleViewSet, basename="exam-schedule")

app_name = "examinations"

urlpatterns = [
    path("my-timetable/", MyExamTimetableView.as_view(), name="my-exam-timetable"),
    path("timetable-options/", ExamTimetableOptionsView.as_view(), name="exam-timetable-options"),
    path("exams/<uuid:pk>/timetable/", ExamTimetableView.as_view(), name="exam-timetable"),
    path("exams/<uuid:pk>/timetable/<str:action>/", ExamTimetablePublishView.as_view(), name="exam-timetable-publish"),
    path("schedules/<uuid:pk>/rooms/", ExamScheduleRoomsView.as_view(), name="exam-schedule-rooms"),
    path("schedules/<uuid:pk>/rooms/<uuid:assignment_id>/", ExamScheduleRoomsView.as_view(), name="exam-schedule-room"),
] + router.urls

# Everything that used to live under "/api/v1/results/" (Enter Marks, the Results list, the
# admin Report Card lookup) was retired — see config/urls.py's import of `result_urlpatterns` for
# where this is mounted. Only the student's own self-service transcript remains at that prefix.
result_urlpatterns = [
    path("transcript/me/", MyTranscriptView.as_view(), name="my-transcript"),
]
