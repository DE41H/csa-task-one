from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import HostelViewSet, ParticipantViewSet

router = DefaultRouter()
router.register("hostels", HostelViewSet, basename="hostel")
router.register("participants", ParticipantViewSet, basename="participant")

urlpatterns = router.urls + [
    path("leaderboard/", HostelViewSet.as_view({"get": "list"}), name="leaderboard"),
]
