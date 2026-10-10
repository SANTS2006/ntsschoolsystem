from rest_framework.routers import DefaultRouter

from .views import StudentViewSet

router = DefaultRouter()
router.register("", StudentViewSet, basename="student")

app_name = "students"

urlpatterns = router.urls
