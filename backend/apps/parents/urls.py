from rest_framework.routers import DefaultRouter

from .views import GuardianViewSet

router = DefaultRouter()
router.register("", GuardianViewSet, basename="guardian")

app_name = "parents"

urlpatterns = router.urls
