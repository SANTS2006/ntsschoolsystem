from django.urls import path
from rest_framework.routers import DefaultRouter

from .year_views import AcademicYearContextView, MyYearHistoryView, RolloverExecuteView, RolloverPreviewView, RolloverRunsView

from .submissions import MyAssessmentFileDetailView, MyAssessmentFilesView
from .views import (
    AcademicYearViewSet,
    AssessmentViewSet,
    BulkPromoteView,
    ClassOverallResultsView,
    ClassTermResultsView,
    DepartmentViewSet,
    LockTermResultsView,
    ManualPromoteView,
    MyGraduationStatusView,
    MyResultsView,
    MySubjectCAView,
    MySubjectMaterialsView,
    MySubjectMessagesView,
    MySubjectPrivateMessagesView,
    MySubjectsView,
    MyTermResultDetailView,
    PromotionRecordViewSet,
    PublishTermResultsView,
    SchoolClassViewSet,
    SectionViewSet,
    StudentGraduationStatusView,
    StudentSubjectEnrollmentViewSet,
    StudentTermReportView,
    SubjectMaterialViewSet,
    SubjectMessageViewSet,
    SubjectOfferingViewSet,
    SubjectPrivateMessageViewSet,
    SubjectViewSet,
    TermResultPublicationViewSet,
    TermViewSet,
    VerifyTermResultsView,
)

router = DefaultRouter()
router.register("academic-years", AcademicYearViewSet, basename="academic-year")
router.register("terms", TermViewSet, basename="term")
router.register("departments", DepartmentViewSet, basename="department")
router.register("subjects", SubjectViewSet, basename="subject")
router.register("subject-offerings", SubjectOfferingViewSet, basename="subject-offering")
router.register("subject-enrollments", StudentSubjectEnrollmentViewSet, basename="subject-enrollment")
router.register("assessments", AssessmentViewSet, basename="assessment")
router.register("classes", SchoolClassViewSet, basename="school-class")
router.register("sections", SectionViewSet, basename="section")
router.register("promotion-records", PromotionRecordViewSet, basename="promotion-record")
router.register("result-publications", TermResultPublicationViewSet, basename="result-publication")
router.register("subject-materials", SubjectMaterialViewSet, basename="subject-material")
router.register("subject-messages", SubjectMessageViewSet, basename="subject-message")
router.register("subject-private-messages", SubjectPrivateMessageViewSet, basename="subject-private-message")

app_name = "academics"

urlpatterns = [
    path("my-assessment-files/", MyAssessmentFilesView.as_view(), name="my-assessment-files"),
    path("my-assessment-files/<uuid:pk>/", MyAssessmentFileDetailView.as_view(), name="my-assessment-file"),
    path("my-subjects/", MySubjectsView.as_view(), name="my-subjects"),
    path("my-subjects/<uuid:subject_offering_id>/ca/", MySubjectCAView.as_view(), name="my-subject-ca"),
    path(
        "my-subjects/<uuid:subject_offering_id>/materials/",
        MySubjectMaterialsView.as_view(),
        name="my-subject-materials",
    ),
    path(
        "my-subjects/<uuid:subject_offering_id>/messages/",
        MySubjectMessagesView.as_view(),
        name="my-subject-messages",
    ),
    path(
        "my-subjects/<uuid:subject_offering_id>/private-messages/",
        MySubjectPrivateMessagesView.as_view(),
        name="my-subject-private-messages",
    ),
    path("classes/<uuid:school_class_id>/term-results/", ClassTermResultsView.as_view(), name="class-term-results"),
    path(
        "classes/<uuid:school_class_id>/overall-results/",
        ClassOverallResultsView.as_view(),
        name="class-overall-results",
    ),
    path("year-context/", AcademicYearContextView.as_view(), name="year-context"),
    path("my-year-history/", MyYearHistoryView.as_view(), name="my-year-history"),
    path("year-rollover/preview/", RolloverPreviewView.as_view(), name="year-rollover-preview"),
    path("year-rollover/execute/", RolloverExecuteView.as_view(), name="year-rollover-execute"),
    path("year-rollover/runs/", RolloverRunsView.as_view(), name="year-rollover-runs"),
    path("promotions/bulk-promote/", BulkPromoteView.as_view(), name="bulk-promote"),
    path("promotions/manual-promote/", ManualPromoteView.as_view(), name="manual-promote"),
    path("results/verify/", VerifyTermResultsView.as_view(), name="results-verify"),
    path("results/publish/", PublishTermResultsView.as_view(), name="results-publish"),
    path("results/lock/", LockTermResultsView.as_view(), name="results-lock"),
    path(
        "results/students/<uuid:student_id>/classes/<uuid:school_class_id>/terms/<uuid:term_id>/",
        StudentTermReportView.as_view(),
        name="student-term-report",
    ),
    path("my-results/", MyResultsView.as_view(), name="my-results"),
    path(
        "my-results/classes/<uuid:school_class_id>/terms/<uuid:term_id>/",
        MyTermResultDetailView.as_view(),
        name="my-result-detail",
    ),
    path(
        "students/<uuid:student_id>/graduation-status/",
        StudentGraduationStatusView.as_view(),
        name="student-graduation-status",
    ),
    path("my-graduation-status/", MyGraduationStatusView.as_view(), name="my-graduation-status"),
] + router.urls
