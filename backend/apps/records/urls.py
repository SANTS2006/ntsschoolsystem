from rest_framework.routers import DefaultRouter

from .views import RecordViewSet

router = DefaultRouter()
router.register("records", RecordViewSet, basename="record")

app_name = "records"

urlpatterns = router.urls
