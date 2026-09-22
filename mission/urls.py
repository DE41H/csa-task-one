from rest_framework.routers import DefaultRouter

from .views import MissionViewSet

router = DefaultRouter()
router.register("missions", MissionViewSet, basename="mission")

urlpatterns = router.urls
