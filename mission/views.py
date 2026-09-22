from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.viewsets import ModelViewSet

from .filters import MissionFilter
from .models import Mission
from .permissions import IsParticipant, IsReadOnly, IsStaff
from .serializers import MissionSerializer


class MissionActionRateThrottle(UserRateThrottle):
    scope = "claim"


class MissionViewSet(ModelViewSet):
    queryset = Mission.objects.select_related("claimed_by__hostel", "completed_by__hostel")
    serializer_class = MissionSerializer
    permission_classes = [IsReadOnly | IsStaff]
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = MissionFilter
    search_fields = ["codename", "brief"]

    @action(detail=True, methods=["post"], permission_classes=[IsParticipant], throttle_classes=[MissionActionRateThrottle])
    def claim(self, request, pk=None):
        mission = self.get_object()
        if not mission.claim(request.user.participant.pk):
            return Response({"detail": "Mission is not available to claim."}, status=status.HTTP_409_CONFLICT)
        mission.refresh_from_db()
        return Response(self.get_serializer(mission).data)

    @action(detail=True, methods=["post"], permission_classes=[IsParticipant], throttle_classes=[MissionActionRateThrottle])
    def drop(self, request, pk=None):
        mission = self.get_object()
        if not mission.drop(request.user.participant.pk):
            return Response({"detail": "You have not claimed this mission or it is already cracked."}, status=status.HTTP_409_CONFLICT)
        mission.refresh_from_db()
        return Response(self.get_serializer(mission).data)

    @action(detail=True, methods=["post"], permission_classes=[IsParticipant], throttle_classes=[MissionActionRateThrottle])
    def complete(self, request, pk=None):
        mission = self.get_object()
        if not mission.complete(request.user.participant.pk):
            return Response({"detail": "You have not claimed this mission, or it is expired/cracked."}, status=status.HTTP_409_CONFLICT)
        mission.refresh_from_db()
        return Response(self.get_serializer(mission).data)
