from datetime import UTC, datetime, timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from ticketing.models import AuditLog, Event, Order, Refund, Ticket
from ticketing.test_phase3 import Phase3Helpers


class EventCancellationTests(Phase3Helpers, TestCase):
    def test_cancel_event_closes_sales_and_keeps_existing_check_ins_and_refunds(self):
        event, paid_type = self.inventory()
        free_type = self.client.post(
            f"/api/events/{event}/ticket-types", {"name": "Free", "quantity": 5}, format="json"
        ).json()["id"]
        paid = self.buy(event, paid_type)
        free = self.buy(event, free_type)
        already_admitted = self.buy(event, free_type, quantity=2)
        reserved = self.client.post(
            "/api/orders",
            {"event": event, "items": [{"ticket_type": paid_type, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(reserved.status_code, 201, reserved.content)
        hold = reserved.json()
        cancel_url = f"/api/events/{event}/cancel"
        self.assertEqual(self.client.post(cancel_url).status_code, 404)

        self.client.force_authenticate(self.owner)
        admitted, unused = already_admitted["tickets"]
        self.assertEqual(
            self.client.post(
                "/api/tickets/check-in", {"qr_token": admitted["qr_token"]}
            ).status_code,
            200,
        )
        previous_emails = len(mail.outbox)
        with self.captureOnCommitCallbacks(execute=True):
            cancelled = self.client.post(cancel_url)
            repeated = self.client.post(cancel_url)
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertIsNotNone(cancelled.json()["cancelled_at"])
        self.assertEqual(cancelled.json(), repeated.json())
        self.assertEqual(len(mail.outbox), previous_emails + 1)
        self.assertEqual(mail.outbox[-1].to, [self.buyer.email])
        self.assertIn("has been cancelled", mail.outbox[-1].body)
        self.assertEqual(len(mail.outbox[-1].attachments), 1)
        calendar = mail.outbox[-1].attachments[0]
        self.assertEqual(calendar[0], f"biletflow-event-{event}-cancelled.ics")
        self.assertEqual(calendar[2], "text/calendar")
        self.assertIn("METHOD:CANCEL\r\n", calendar[1])
        self.assertIn(f"UID:event-{event}@biletflow\r\n", calendar[1])
        self.assertIn("STATUS:CANCELLED\r\n", calendar[1])
        self.assertEqual(
            AuditLog.objects.filter(event_id=event, action="event.cancelled").count(), 1
        )
        self.assertEqual(Refund.objects.count(), 0)
        self.assertEqual(Order.objects.get(pk=paid["id"]).status, "confirmed")
        self.assertEqual(Order.objects.get(pk=free["id"]).status, "cancelled")
        self.assertEqual(Order.objects.get(pk=hold["id"]).status, "cancelled")
        self.assertEqual(Ticket.objects.get(pk=admitted["id"]).status, "checked_in")
        self.assertEqual(Ticket.objects.get(pk=unused["id"]).status, "cancelled")

        payload = {"qr_token": paid["tickets"][0]["qr_token"]}
        verified = self.client.post("/api/tickets/verify", payload).json()
        self.assertFalse(verified["valid"])
        self.assertEqual(verified["ticket"]["status"], "cancelled")
        self.assertEqual(self.client.post("/api/tickets/check-in", payload).status_code, 409)
        self.assertEqual(
            self.client.post(f"/api/events/{event}/publish", {"published": True}).status_code, 409
        )
        self.assertFalse(self.client.get(f"/api/events/{event}/activation").json()["sales_open"])
        inventory = self.client.get(f"/api/events/{event}/analytics").json()["inventory"]
        self.assertEqual(inventory["remaining"], 0)
        self.assertEqual(inventory["checked_in"], 1)

        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get("/api/events").json()["count"], 0)
        self.assertIsNotNone(self.client.get(f"/api/events/{event}").json()["cancelled_at"])
        self.assertEqual(
            self.client.post(
                "/api/orders",
                {"event": event, "items": [{"ticket_type": paid_type, "quantity": 1}]},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                f"/api/orders/{hold['id']}/checkout", {"outcome": "success"}
            ).status_code,
            409,
        )

        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f"/api/orders/{paid['id']}/refund").status_code, 200)
        copied = self.client.post(f"/api/events/{event}/duplicate")
        self.assertEqual(copied.status_code, 201, copied.content)
        draft = Event.objects.get(pk=copied.json()["id"])
        self.assertIsNone(draft.cancelled_at)
        self.assertFalse(draft.published)
        self.assertEqual(draft.ticket_types.count(), 2)
        self.assertFalse(draft.orders.exists())

    def test_completed_event_can_be_duplicated_and_cannot_be_cancelled(self):
        event, _ = self.inventory()
        now = timezone.now()
        Event.objects.filter(pk=event).update(
            starts_at=now - timedelta(days=2), ends_at=now - timedelta(days=1)
        )
        self.assertEqual(self.client.post(f"/api/events/{event}/cancel").status_code, 409)
        draft = self.client.post(f"/api/events/{event}/duplicate")
        self.assertEqual(draft.status_code, 201, draft.content)
        self.assertFalse(draft.json()["published"])

    def test_audit_filters_are_inclusive_in_almaty_and_authorized(self):
        event_id, _ = self.inventory()
        event = Event.objects.get(pk=event_id)
        timestamps = [
            ("event.cancelled", datetime(2026, 10, 1, 18, 59, tzinfo=UTC)),
            ("event.cancelled", datetime(2026, 10, 1, 19, 0, tzinfo=UTC)),
            ("event.cancelled", datetime(2026, 10, 2, 18, 59, tzinfo=UTC)),
            ("event.published", datetime(2026, 10, 2, 18, 59, tzinfo=UTC)),
            ("event.cancelled", datetime(2026, 10, 2, 19, 0, tzinfo=UTC)),
        ]
        ids = []
        for action, timestamp in timestamps:
            entry = AuditLog.objects.create(
                event=event,
                actor=self.owner,
                action=action,
                entity_type="Event",
                entity_id=event_id,
            )
            AuditLog.objects.filter(pk=entry.pk).update(created_at=timestamp)
            ids.append(entry.pk)
        url = f"/api/events/{event_id}/audit-log"
        filters = {"date_from": "2026-10-02", "date_to": "2026-10-02", "action": "event.cancelled"}
        response = self.client.get(url, filters)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([entry["id"] for entry in response.json()["results"]], [ids[2], ids[1]])
        self.assertEqual(self.client.get(url, {"date_from": "bad"}).status_code, 400)
        self.assertEqual(self.client.get(url, filters | {"date_to": "2026-10-01"}).status_code, 400)
        self.client.force_authenticate(self.buyer)
        self.assertEqual(self.client.get(url, filters).status_code, 404)
