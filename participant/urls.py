from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import HostelViewSet, LeaderboardView, ParticipantViewSet

router = DefaultRouter()
router.register("hostels", HostelViewSet, basename="hostel")
router.register("participants", ParticipantViewSet, basename="participant")

urlpatterns = [
    path("leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
    *router.urls,
]
