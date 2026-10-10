from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import SchoolBrandingLookupView, SchoolSearchView, SchoolSelfView, SchoolViewSet

router = DefaultRouter()
router.register("", SchoolViewSet, basename="school")

app_name = "tenants"

# Static paths are listed before the router's bare ""-registered {pk} detail route so they
# always match first — the same collision-avoidance ordering used since Phase G/J/N.
urlpatterns = [
    path("me/", SchoolSelfView.as_view(), name="school-me"),
    path("search/", SchoolSearchView.as_view(), name="school-search"),
    path("branding/<slug:slug>/", SchoolBrandingLookupView.as_view(), name="school-branding"),
] + router.urls
