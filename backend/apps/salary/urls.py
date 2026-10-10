from rest_framework.routers import DefaultRouter

from .views import (
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

app_name = "salary"

urlpatterns = router.urls
