from rest_framework.routers import DefaultRouter

from .views import HostelViewSet, ParticipantViewSet

router = DefaultRouter()
router.register("hostels", HostelViewSet, basename="hostel")
router.register("participants", ParticipantViewSet, basename="participant")

urlpatterns = router.urls
