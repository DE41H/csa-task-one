from django.core.management.base import BaseCommand

from participant.models import Hostel

HOSTELS = [
    "Ram Bhawan",
    "Budh Bhawan",

    "Krishna Bhawan",
    "Gandhi Bhawan",

    "Shankar Bhawan",
    "Vyas Bhawan",

    "Vishwakarma Bhawan",
    "Bhagirath Bhawan",

    "Malaviya Bhawan C-Block",
    "Malaviya Bhawan B-Block",
    "Malaviya Bhawan A-Block",
    "Malaviya Studio Apartments",
    "C V Raman Bhawan",

    "Ashok Bhawan",
    "Rana Pratap Bhawan",

    "Meera Bhawan",
    "Srinivasa Ramanujan Bhawan",
]


class Command(BaseCommand):
    def handle(self, *args, **options):
        hostels = [ Hostel(name=name) for name in HOSTELS ]
        Hostel.objects.bulk_create(hostels, ignore_conflicts=True)
        self.stdout.write(self.style.SUCCESS(f"Finished seeding {len(HOSTELS)} hostels."))
