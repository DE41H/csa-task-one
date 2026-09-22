from django.db.models import Sum
from django.db.models.functions import Coalesce
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.viewsets import ReadOnlyModelViewSet, ModelViewSet

from mission.permissions import IsParticipant, IsReadOnly, IsStaff

from .models import Hostel, Participant
from .serializers import HostelSerializer, ParticipantSerializer, RegisterSerializer


class RegisterView(CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class HostelViewSet(ModelViewSet):
    queryset = Hostel.objects.annotate(score=Coalesce(Sum("cracked_missions__points"), 0)).order_by("-score", "name")
    serializer_class = HostelSerializer
    permission_classes = [IsReadOnly | IsStaff]


class ParticipantViewSet(ReadOnlyModelViewSet):
    queryset = Participant.objects.select_related("hostel", "user")
    serializer_class = ParticipantSerializer
    permission_classes = [IsParticipant | IsStaff]
