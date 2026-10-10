from django.urls import path

from .views import FormOptionsView

app_name = "formoptions"

urlpatterns = [path("", FormOptionsView.as_view(), name="form-options")]
