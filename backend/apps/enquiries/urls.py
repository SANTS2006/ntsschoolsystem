from django.urls import path

from .views import PublicEnquiryView

app_name = "enquiries"

urlpatterns = [path("", PublicEnquiryView.as_view(), name="public-enquiry")]
