"""Load repeatable demo data for local development: `python manage.py seed_demo`.

Safe to run many times: accounts, events, ticket types and the promo campaign are
looked up by fixed keys, and demo orders are only created once per event.

Event dates are set relative to the day of the run. A demo event whose date has
passed is moved forward again on the next run, so a long-lived demo database (the
Heroku app) keeps sellable events; `--refresh-dates` moves every demo event.
Existing orders and tickets are kept.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import OrganizerProfile, User
from ticketing import services
from ticketing.models import Event, PromoCode, PromotionalCampaign, StaffAssignment

DEFAULT_PASSWORD = "Demo-pass-2026!"
ORGANIZER = "demo-organizer@biletflow.local"
ATTENDEE = "demo-attendee@biletflow.local"
STAFF = "demo-staff@biletflow.local"
ADMIN = "demo-admin@biletflow.local"
PROMO = "DEMO10"

EVENTS = [
    {
        "title": "[Demo] Almaty Jazz Night",
        "description": "Evening concert with two ticket tiers and a promo campaign.",
        "venue": "Kazakh Concert Hall, Almaty",
        "category": "music",
        "days": 14,
        "capacity": 300,
        "visibility": "public",
        "types": [("Standard", 800000, 250), ("VIP", 2000000, 50)],
    },
    {
        "title": "[Demo] Python Almaty Meetup",
        "description": "Free community meetup: free registration flow.",
        "venue": "Astana Hub, Almaty",
        "category": "tech",
        "days": 7,
        "capacity": 80,
        "visibility": "public",
        "types": [("Free entry", 0, 80)],
    },
    {
        "title": "[Demo] Startup Pitch Day (unlisted)",
        "description": "Reachable by direct link or Campaign QR only.",
        "venue": "SmArt.Point, Almaty",
        "category": "business",
        "days": 21,
        "capacity": 120,
        "visibility": "unlisted",
        "types": [("Participant", 500000, 120)],
    },
    {
        "title": "[Demo] «Этот удивительный цирк» — Московский цирк",
        "description": "Цирковое шоу для всей семьи, 0+. Демо-копия афиши Ticketon.",
        "venue": "Цирк Астаны, Астана",
        "category": "Шоу",
        "days": 7,
        "capacity": 1500,
        "visibility": "public",
        "types": [("Балкон", 321000, 900), ("Партер", 600000, 500), ("Первый ряд", 1000000, 100)],
    },
    {
        "title": "[Demo] Щелкунчик в «Astana Ballet»",
        "description": "Балет П. И. Чайковского, хореография Б. Баймухаметова, 5+.",
        "venue": "Театр «Astana Ballet», Астана",
        "category": "Театры",
        "days": 24,
        "capacity": 600,
        "visibility": "public",
        "types": [("Балкон", 500000, 250), ("Амфитеатр", 900000, 200), ("Партер", 1500000, 150)],
    },
    {
        "title": "[Demo] Бағжан Октябрь с концертной программой «Терапия души»",
        "description": "Сольный концерт виолончелиста, 12+.",
        "venue": "ЦКЗ «Казахстан», Астана",
        "category": "Концерты",
        "days": 9,
        "capacity": 1200,
        "visibility": "public",
        "types": [("Стандарт", 1177000, 900), ("VIP", 2500000, 300)],
    },
    {
        "title": "[Demo] Beu Awards 2026",
        "description": "Музыкальная премия: Irina Kairatovna, Ninety One, Ziruza и другие, 6+.",
        "venue": "Barys Arena, проспект Туран, 57, Астана",
        "category": "Концерты",
        "days": 17,
        "capacity": 5000,
        "visibility": "public",
        "types": [("Трибуна", 1100000, 4000), ("Танцпол", 1800000, 800), ("VIP", 4000000, 200)],
    },
    {
        "title": "[Demo] Щелкунчик (Astana Opera)",
        "description": "Балет П. И. Чайковского на сцене Astana Opera, 5+.",
        "venue": "Astana Opera, Астана",
        "category": "Театры",
        "days": 30,
        "capacity": 1250,
        "visibility": "public",
        "types": [("Галерка", 107000, 300), ("Балкон", 800000, 450), ("Партер", 2000000, 500)],
    },
    {
        "title": "[Demo] Тұрсынбек Қабатов Астанада",
        "description": "Юмористический концерт, 6+.",
        "venue": "Зал Казахконцерта, Астана",
        "category": "Юмор",
        "days": 31,
        "capacity": 700,
        "visibility": "public",
        "types": [("Стандарт", 535000, 500), ("Партер", 900000, 200)],
    },
]


class Command(BaseCommand):
    help = "Create demo accounts, events, ticket types, a promo code and sample orders."

    def add_arguments(self, parser):
        parser.add_argument("--password", default=DEFAULT_PASSWORD)
        parser.add_argument(
            "--refresh-dates",
            action="store_true",
            help="Move every demo event to its offset from today, not only past ones.",
        )

    def handle(self, *args, password, refresh_dates=False, **options):
        if not settings.DEBUG and password == DEFAULT_PASSWORD:
            raise CommandError("Pass --password when DEBUG is off; the default is public.")
        with transaction.atomic():
            organizer = self.account(ORGANIZER, password, "Aru", "Organizer")
            OrganizerProfile.objects.get_or_create(
                user=organizer,
                defaults={"display_name": "BiletFlow Demo Events", "contact_email": ORGANIZER},
            )
            attendee = self.account(ATTENDEE, password, "Dana", "Attendee")
            staff = self.account(STAFF, password, "Erlan", "Scanner")
            self.account(ADMIN, password, "Platform", "Admin", superuser=True)
            events = [self.event(organizer, spec, refresh_dates) for spec in EVENTS]
            jazz = events[0]
            StaffAssignment.objects.get_or_create(event=jazz, user=staff)
            self.campaign(jazz)
        # Orders go through the real reserve/checkout services (each in its own
        # transaction), so the demo data obeys every inventory and pricing rule.
        self.order(attendee, jazz, [(0, 2)], promo=PROMO)
        self.order(attendee, events[1], [(0, 1)])
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
        self.stdout.write(f"Password for every demo account: {password}")
        for email, role in [
            (ORGANIZER, "organizer"),
            (ATTENDEE, "attendee (has tickets)"),
            (STAFF, "event admin for Jazz Night (check-in)"),
            (ADMIN, "platform admin"),
        ]:
            self.stdout.write(f"  {email:34} {role}")
        for event in events:
            self.stdout.write(f"  event #{event.pk}: {event.title}")
        self.stdout.write(f"  promo code for Jazz Night: {PROMO} (10% off)")
        self.stdout.write(f"  Campaign QR link (backend): /c/{services.campaign_link_token(PROMO)}")

    def account(self, email, password, first, last, superuser=False):
        user = User.objects.filter(email=email).first()
        if user is None:
            create = User.objects.create_superuser if superuser else User.objects.create_user
            user = create(email, password, first_name=first, last_name=last)
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at"])
        return user

    def event(self, organizer, spec, refresh_dates=False):
        profile = organizer.organizer_profile
        start = timezone.localtime(timezone.now() + timedelta(days=spec["days"])).replace(
            hour=19, minute=0, second=0, microsecond=0
        )
        event = Event.objects.filter(organizer=profile, title=spec["title"]).first()
        if event and event.cancelled_at:
            return event
        if event is None:
            event = Event.objects.create(
                organizer=profile,
                title=spec["title"],
                description=spec["description"],
                venue=spec["venue"],
                category=spec["category"],
                starts_at=start,
                ends_at=start + timedelta(hours=3),
                capacity=spec["capacity"],
                visibility=spec["visibility"],
                published=True,
            )
            for name, price, quantity in spec["types"]:
                event.ticket_types.create(name=name, price_minor=price, quantity=quantity)
            services.record_audit(event, organizer, "event.seeded", event, "seed_demo")
        elif refresh_dates or event.starts_at <= timezone.now():
            previous = timezone.localtime(event.starts_at).strftime("%Y-%m-%d %H:%M")
            event.starts_at = start
            event.ends_at = start + timedelta(hours=3)
            event.save(update_fields=["starts_at", "ends_at"])
            services.record_audit(
                event, organizer, "event.seeded", event, f"seed_demo moved it from {previous}"
            )
        if event.ticket_types.filter(price_minor__gt=0).exists():
            # Paid events go through the real simulated activation (SRS 4.5);
            # repeating it on a second seed run changes nothing.
            services.submit_activation(
                organizer,
                event.pk,
                {
                    "identity_confirmed": True,
                    "payout_reference": "SIM-PAYOUT-DEMO",
                    "accept_terms": True,
                    "pay_fee": "success",
                },
            )
        return event

    def campaign(self, event):
        if PromoCode.objects.filter(code=PROMO).exists():
            return
        campaign = PromotionalCampaign.objects.create(
            event=event, name="Demo launch", discount_type="percent", discount_value=10
        )
        PromoCode.objects.create(
            campaign=campaign,
            code=PROMO,
            link_token_digest=services.link_token_digest(services.campaign_link_token(PROMO)),
        )

    def order(self, user, event, items, promo=None):
        if event.cancelled_at or event.orders.filter(purchaser=user, status="confirmed").exists():
            return
        kinds = list(event.ticket_types.all())
        order = services.reserve(
            user,
            event.pk,
            [{"ticket_type": kinds[index].pk, "quantity": qty} for index, qty in items],
        )
        services.checkout(user, order.pk, "success", promo)
