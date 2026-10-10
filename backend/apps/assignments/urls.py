from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AssignmentSubmissionViewSet, AssignmentViewSet, MyAssignmentsView, SubmitAssignmentView

router = DefaultRouter()
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("assignment-submissions", AssignmentSubmissionViewSet, basename="assignment-submission")

app_name = "assignments"

urlpatterns = [
    path("my-assignments/", MyAssignmentsView.as_view(), name="my-assignments"),
    path("assignments/<uuid:assignment_id>/submit/", SubmitAssignmentView.as_view(), name="submit-assignment"),
] + router.urls
