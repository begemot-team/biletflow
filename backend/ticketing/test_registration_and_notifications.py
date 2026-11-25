"""SRS 4.2 event registration window and SRS 4.10 payment-failure / event-update emails."""

from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from ticketing.models import Event, Order
from ticketing.test_phase3 import Phase3Helpers


class RegistrationWindowTests(Phase3Helpers, TestCase):
    def reserve(self, event, kind):
        self.client.force_authenticate(self.buyer)
        return self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": 1}]},
            format="json",
        )

    def set_window(self, event, **window):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(
            f"/api/events/{event}",
            {k: v.isoformat() if v else None for k, v in window.items()},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_window_is_returned_and_open_window_sells(self):
        event, kind = self.inventory()
        now = timezone.now()
        body = self.set_window(
            event,
            registration_opens_at=now - timedelta(hours=1),
            registration_closes_at=now + timedelta(hours=1),
        )
        self.assertIsNotNone(body["registration_opens_at"])
        self.assertEqual(self.reserve(event, kind).status_code, 201)

    def test_not_yet_open_is_refused(self):
        event, kind = self.inventory()
        self.set_window(event, registration_opens_at=timezone.now() + timedelta(hours=1))
        response = self.reserve(event, kind)
        self.assertEqual(response.status_code, 409)
        self.assertIn("not opened", response.json()["detail"])
        self.assertFalse(Order.objects.exists())

    def test_closed_is_refused(self):
        event, kind = self.inventory()
        Event.objects.filter(pk=event).update(
            registration_closes_at=timezone.now() - timedelta(minutes=1)
        )
        response = self.reserve(event, kind)
        self.assertEqual(response.status_code, 409)
        self.assertIn("closed", response.json()["detail"])

    def test_free_tickets_follow_the_window_too(self):
        event, kind = self.inventory(price=0)
        Event.objects.filter(pk=event).update(
            registration_closes_at=timezone.now() - timedelta(minutes=1)
        )
        self.assertEqual(self.reserve(event, kind).status_code, 409)

    def test_close_must_follow_open_and_open_precede_start(self):
        event, _ = self.inventory()
        self.client.force_authenticate(self.owner)
        now = timezone.now()
        bad_order = self.client.patch(
            f"/api/events/{event}",
            {
                "registration_opens_at": (now + timedelta(hours=2)).isoformat(),
                "registration_closes_at": (now + timedelta(hours=1)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(bad_order.status_code, 400)
        self.assertIn("registration_closes_at", bad_order.json())
        after_start = self.client.patch(
            f"/api/events/{event}",
            {"registration_opens_at": (now + timedelta(days=3)).isoformat()},
            format="json",
        )
        self.assertEqual(after_start.status_code, 400)
        self.assertIn("registration_opens_at", after_start.json())

    def test_duplicate_keeps_the_window(self):
        event, _ = self.inventory()
        opens = timezone.now() + timedelta(hours=1)
        self.set_window(event, registration_opens_at=opens)
        copy = self.client.post(f"/api/events/{event}/duplicate").json()
        self.assertEqual(
            Event.objects.get(pk=copy["id"]).registration_opens_at,
            Event.objects.get(pk=event).registration_opens_at,
        )


class PaymentFailedEmailTests(Phase3Helpers, TestCase):
    def test_failed_payment_tells_the_buyer_and_issues_nothing(self):
        event, kind = self.inventory()
        self.buy(event, kind, outcome="failure")
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["buyer@example.com"])
        self.assertIn("payment failed", message.subject)
        self.assertIn("No tickets were issued", message.body)
        self.assertIn(f"/checkout/{Order.objects.get().pk}", message.body)
        self.assertEqual(Order.objects.get().status, "pending")


class EventUpdatedEmailTests(Phase3Helpers, TestCase):
    def edit(self, event, **changes):
        self.client.force_authenticate(self.owner)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(f"/api/events/{event}", changes, format="json")
        self.assertEqual(response.status_code, 200, response.content)

    def test_time_or_venue_change_emails_ticket_holders(self):
        event, kind = self.inventory()
        self.buy(event, kind)
        mail.outbox.clear()
        self.edit(event, venue="Astana Arena")
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["buyer@example.com"])
        self.assertIn("has changed", message.subject)
        self.assertIn("Venue: Astana Arena", message.body)

    def test_resubmitting_the_same_values_or_other_fields_sends_nothing(self):
        event, kind = self.inventory()
        self.buy(event, kind)
        mail.outbox.clear()
        current = self.client.get(f"/api/events/{event}").json()
        self.edit(
            event,
            title=current["title"],
            venue=current["venue"],
            starts_at=Event.objects.get(pk=event).starts_at.isoformat(),
            description="New description",
            capacity=9,
        )
        self.assertEqual(mail.outbox, [])

    def test_no_ticket_holders_no_email(self):
        event, _ = self.inventory()
        self.edit(event, venue="Somewhere else")
        self.assertEqual(mail.outbox, [])

    def test_refunded_buyers_are_not_emailed(self):
        event, kind = self.inventory()
        order = self.buy(event, kind)
        self.client.force_authenticate(self.owner)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(f"/api/orders/{order['id']}/refund")
        mail.outbox.clear()
        self.edit(event, venue="Somewhere else")
        self.assertEqual(mail.outbox, [])
