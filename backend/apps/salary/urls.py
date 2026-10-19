from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import (
    MySalaryReceiptView,
    MySalaryView,
    SalaryAdjustmentViewSet,
    SalaryPaymentViewSet,
    SalaryStructureItemViewSet,
    SalaryStructureViewSet,
    StaffSalaryAssignmentViewSet,
)

router = DefaultRouter()
router.register("salary-structures", SalaryStructureViewSet, basename="salary-structure")
router.register("salary-structure-items", SalaryStructureItemViewSet, basename="salary-structure-item")
router.register("staff-salary-assignments", StaffSalaryAssignmentViewSet, basename="staff-salary-assignment")
router.register("payments", SalaryPaymentViewSet, basename="salary-payment")
router.register("adjustments", SalaryAdjustmentViewSet, basename="salary-adjustment")

app_name = "salary"

urlpatterns = [
    path("my-salary/", MySalaryView.as_view(), name="my-salary"),
    path("my-payments/<uuid:pk>/", MySalaryReceiptView.as_view(), name="my-salary-receipt"),
] + router.urls
