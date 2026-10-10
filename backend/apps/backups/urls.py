from django.urls import path

from . import views

app_name = "backups"

urlpatterns = [
    path("overview/", views.BackupOverviewView.as_view(), name="overview"),
    path("settings/", views.BackupSettingsView.as_view(), name="settings"),
    path("tick/", views.SchedulerTickView.as_view(), name="tick"),
    path("restores/", views.RestoreListView.as_view(), name="restore-list"),
    path("restores/<uuid:pk>/", views.RestoreDetailView.as_view(), name="restore-detail"),
    path("", views.BackupListView.as_view(), name="list"),
    path("<uuid:pk>/", views.BackupDetailView.as_view(), name="detail"),
    path("<uuid:pk>/verify/", views.BackupVerifyView.as_view(), name="verify"),
    path("<uuid:pk>/download/", views.BackupDownloadView.as_view(), name="download"),
    path("<uuid:pk>/restore/prepare/", views.RestorePrepareView.as_view(), name="restore-prepare"),
    path("<uuid:pk>/restore/", views.RestoreStartView.as_view(), name="restore"),
]
