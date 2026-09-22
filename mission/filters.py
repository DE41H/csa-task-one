from django.db.models import Q
from django.utils.timezone import now
import django_filters

from .models import Mission, Status


class MissionFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(
        choices=[
            (Status.UNCLAIMED, Status.UNCLAIMED),
            (Status.IN_PROGRESS, Status.IN_PROGRESS),
            (Status.CRACKED, Status.CRACKED),
            (Status.EXPIRED, Status.EXPIRED),
        ],
        method="filter_status",
    )
    hostel = django_filters.NumberFilter(method="filter_hostel")

    class Meta:
        model = Mission
        fields = ["status", "difficulty", "hostel"]

    def filter_status(self, queryset, name, value):
        current = now()
        if value == Status.UNCLAIMED:
            return queryset.filter(completed_by__isnull=True, claimed_by__isnull=True, deadline__gt=current)
        elif value == Status.IN_PROGRESS:
            return queryset.filter(completed_by__isnull=True, claimed_by__isnull=False, deadline__gt=current)
        elif value == Status.CRACKED:
            return queryset.filter(completed_by__isnull=False)
        elif value == Status.EXPIRED:
            return queryset.filter(completed_by__isnull=True, deadline__lte=current)
        return queryset

    def filter_hostel(self, queryset, name, value):
        return queryset.filter(Q(claimed_by__hostel_id=value) | Q(completed_hostel_id=value))
