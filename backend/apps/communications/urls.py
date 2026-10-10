from rest_framework.routers import DefaultRouter

from .views import AnnouncementRecipientViewSet, AnnouncementViewSet

router = DefaultRouter()
router.register("announcements", AnnouncementViewSet, basename="announcement")
router.register("announcement-recipients", AnnouncementRecipientViewSet, basename="announcement-recipient")

app_name = "communications"

urlpatterns = router.urls
