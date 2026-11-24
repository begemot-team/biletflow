"""SRS 4.8 / UC4: an accidental check-in can be reversed by authorized staff."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import OrganizerProfile, User
from ticketing.models import AuditLog, Ticket


class UndoCheckInTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner@example.com", "secret")
        OrganizerProfile.objects.create(
            user=self.owner, display_name="Host", contact_email=self.owner.email
        )
        self.organizer = APIClient()
        self.organizer.force_authenticate(self.owner)
        self.event = self.create_event("Concert")
        buyer = User.objects.create_user("buyer@example.com", "secret")
        self.attendee = APIClient()
        self.attendee.force_authenticate(buyer)
        self.ticket = self.buy(self.event)
        self.url = f"/api/tickets/{self.ticket['id']}/check-in"

    def create_event(self, title):
        response = self.organizer.post(
            "/api/events",
            {
                "title": title,
                "venue": "Almaty",
                "starts_at": (timezone.now() + timedelta(days=2)).isoformat(),
                "ends_at": (timezone.now() + timedelta(days=2, hours=2)).isoformat(),
                "capacity": 10,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        event = response.json()["id"]
        kind = self.organizer.post(
            f"/api/events/{event}/ticket-types",
            {"name": "Free", "price_minor": 0, "quantity": 5},
            format="json",
        )
        self.assertEqual(kind.status_code, 201, kind.content)
        self.organizer.post(f"/api/events/{event}/publish", {"published": True}, format="json")
        self.kind = kind.json()["id"]
        return event

    def buy(self, event):
        order = self.attendee.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": self.kind, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(order.status_code, 201, order.content)
        checkout = self.attendee.post(
            f"/api/orders/{order.json()['id']}/checkout", {"outcome": "success"}, format="json"
        )
        self.assertEqual(checkout.status_code, 200, checkout.content)
        return checkout.json()["tickets"][0]

    def payload(self, **extra):
        return {"qr_token": self.ticket["qr_token"], **extra}

    def test_undo_reopens_ticket_and_records_reason(self):
        self.assertEqual(self.organizer.post(self.url, self.payload()).status_code, 200)

        undone = self.organizer.post(f"{self.url}/undo", self.payload(reason="Wrong guest"))

        self.assertEqual(undone.status_code, 200, undone.content)
        self.assertEqual(undone.json()["status"], "valid")
        self.assertIsNone(undone.json()["checked_in_at"])
        ticket = Ticket.objects.get(pk=self.ticket["id"])
        self.assertEqual((ticket.status, ticket.checked_in_by), ("valid", None))
        entry = AuditLog.objects.get(action="ticket.check_in_reversed")
        self.assertEqual((entry.actor, entry.description), (self.owner, "Wrong guest"))
        self.assertEqual((entry.entity_type, entry.entity_id), ("Ticket", ticket.pk))
        # The reopened ticket admits again, exactly once.
        self.assertEqual(self.organizer.post(self.url, self.payload()).status_code, 200)
        self.assertEqual(self.organizer.post(self.url, self.payload()).status_code, 409)

    def test_undo_by_qr_token_with_event_scope(self):
        self.organizer.post(self.url, self.payload())
        response = self.organizer.post(
            "/api/tickets/check-in/undo", self.payload(event_id=self.event), format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        other_event = self.create_event("Other")
        response = self.organizer.post(
            "/api/tickets/check-in/undo", self.payload(event_id=other_event), format="json"
        )
        self.assertEqual(response.status_code, 404)

    def test_undo_requires_a_checked_in_ticket(self):
        response = self.organizer.post(f"{self.url}/undo", self.payload())
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "Ticket is not checked in.")
        self.assertFalse(AuditLog.objects.filter(action="ticket.check_in_reversed").exists())

    def test_undo_never_revives_a_refunded_ticket(self):
        self.organizer.post(self.url, self.payload())
        Ticket.objects.filter(pk=self.ticket["id"]).update(status="refunded")
        response = self.organizer.post(f"{self.url}/undo", self.payload())
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Ticket.objects.get(pk=self.ticket["id"]).status, "refunded")

    def test_undo_rejects_wrong_token_and_unauthorized_users(self):
        self.organizer.post(self.url, self.payload())
        self.assertEqual(
            self.organizer.post(f"{self.url}/undo", {"qr_token": "forged"}).status_code, 400
        )
        # The ticket holder cannot reopen their own ticket to get in twice.
        self.assertEqual(self.attendee.post(f"{self.url}/undo", self.payload()).status_code, 404)
        self.assertEqual(Ticket.objects.get(pk=self.ticket["id"]).status, "checked_in")

    def test_assigned_event_admin_can_undo_and_removed_one_cannot(self):
        staff = User.objects.create_user("scanner@example.com", "secret")
        added = self.organizer.post(f"/api/events/{self.event}/staff", {"email": staff.email})
        self.assertEqual(added.status_code, 201, added.content)
        scanner = APIClient()
        scanner.force_authenticate(staff)
        self.assertEqual(scanner.post(self.url, self.payload()).status_code, 200)
        self.assertEqual(scanner.post(f"{self.url}/undo", self.payload()).status_code, 200)

        self.assertEqual(scanner.post(self.url, self.payload()).status_code, 200)
        self.organizer.delete(f"/api/events/{self.event}/staff/{staff.pk}")
        self.assertEqual(scanner.post(f"{self.url}/undo", self.payload()).status_code, 404)
