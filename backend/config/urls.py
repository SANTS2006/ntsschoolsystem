from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from apps.common.files import StoredFileView
from apps.common.client_errors import ClientErrorView
from apps.common.audience_views import AudienceOptionsView, AudiencePeopleView
from apps.common.spa import spa_index
from apps.examinations.urls import result_urlpatterns


def health_check(request):
    return JsonResponse({"success": True, "message": "ok", "code": "HEALTHY", "errors": []})


urlpatterns = [
    path("api/v1/health/", health_check, name="health-check"),
    path("api/v1/files/", StoredFileView.as_view(), name="stored-file"),
    path("api/v1/client-errors/", ClientErrorView.as_view(), name="client-errors"),
    path("api/v1/public/enquiries/", include("apps.enquiries.urls")),
    path("api/v1/platform/backups/", include("apps.backups.urls")),
    path("api/v1/auth/", include("apps.authentication.urls")),
    path("api/v1/schools/", include("apps.tenants.urls")),
    path("api/v1/users/", include("apps.users.urls")),
    path("api/v1/roles/", include("apps.authorization.urls")),
    path("api/v1/platform/", include("apps.platform_admin.urls")),
    path("api/v1/audit/", include("apps.audit.urls")),
    path("api/v1/academics/", include("apps.academics.urls")),
    path("api/v1/staff/", include("apps.staff.urls")),
    path("api/v1/students/", include("apps.students.urls")),
    path("api/v1/parents/", include("apps.parents.urls")),
    path("api/v1/timetable/", include("apps.timetable.urls")),
    path("api/v1/attendance/", include("apps.attendance.urls")),
    path("api/v1/examinations/", include("apps.examinations.urls")),
    path("api/v1/results/", include(result_urlpatterns)),
    path("api/v1/finance/", include("apps.finance.urls")),
    path("api/v1/salary/", include("apps.salary.urls")),
    path("api/v1/library/", include("apps.library.urls")),
    path("api/v1/transport/", include("apps.transport.urls")),
    path("api/v1/hostel/", include("apps.hostel.urls")),
    path("api/v1/medical/", include("apps.medical.urls")),
    path("api/v1/discipline/", include("apps.discipline.urls")),
    path("api/v1/notifications/", include("apps.notifications.urls")),
    path("api/v1/communications/", include("apps.communications.urls")),
    path("api/v1/", include("apps.assignments.urls")),
    path("api/v1/", include("apps.documents.urls")),
    path("api/v1/", include("apps.records.urls")),
    path("api/v1/inventory/", include("apps.inventory.urls")),
    path("api/v1/procurement/", include("apps.procurement.urls")),
    path("api/v1/reports/", include("apps.reports.urls")),
    path("api/v1/", include("apps.events.urls")),
    path("api/v1/audience/options/", AudienceOptionsView.as_view(), name="audience-options"),
    path("api/v1/audience/people/", AudiencePeopleView.as_view(), name="audience-people"),
    path("api/v1/", include("apps.complaints.urls")),
    path("api/v1/", include("apps.education.urls")),
    path("api/v1/", include("apps.live_sessions.urls")),
    path("api/v1/admissions/", include("apps.admissions.urls")),
    path("api/v1/quizzes/", include("apps.quizzes.urls")),
    path("api/v1/idcards/", include("apps.idcards.urls")),
    path("api/v1/meetings/", include("apps.meetings.urls")),
    path("api/v1/form-options/", include("apps.formoptions.urls")),
]

# See ADMIN_URL in settings: never exposed at the guessable default path in production.
if settings.DEBUG or settings.ADMIN_URL:
    urlpatterns.insert(0, path(settings.ADMIN_URL or "admin/", admin.site.urls))

# Everything that isn't the API, static files or the (optional) admin is the React app; client-side
# routing resolves it in the browser. An unknown /api/... path deliberately stays a real 404.
handler404 = "apps.common.spa.not_found"

urlpatterns.append(re_path(r"^(?!api/|static/).*$", spa_index))
