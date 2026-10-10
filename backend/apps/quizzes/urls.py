from rest_framework.routers import DefaultRouter

from .views import QuizViewSet, StudentQuizViewSet

router = DefaultRouter()
router.register("my-quizzes", StudentQuizViewSet, basename="my-quiz")
router.register("", QuizViewSet, basename="quiz")

app_name = "quizzes"

urlpatterns = router.urls
