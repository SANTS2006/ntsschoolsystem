from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import IdCardViewSet, PublicVerifyCardView

router = DefaultRouter()
router.register("", IdCardViewSet, basename="idcard")

app_name = "idcards"

# Static public path first, same collision-avoidance ordering as apps.admissions.urls.
urlpatterns = [
    path("verify/<str:token>/", PublicVerifyCardView.as_view(), name="public-verify"),
] + router.urls
