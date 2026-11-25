"""SRS 4.12 platform-admin back office: search, monitoring, reports, settings, exports."""

from django.conf import settings
from django.test import TestCase

from accounts.models import User
from ticketing.models import EventReport, Order, Payment, SupportCase
from ticketing.test_phase3 import Phase3Helpers


class AdminBackOfficeHelpers(Phase3Helpers):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser("admin@example.com", "secret")

    def as_admin(self):
        self.client.force_authenticate(self.admin)

    def get_results(self, url, **params):
        self.as_admin()
        response = self.client.get(url, params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["results"]

    def refund(self, order_id):
        self.client.force_authenticate(self.owner)
        response = self.client.post(f"/api/orders/{order_id}/refund")
        self.assertEqual(response.status_code, 200, response.content)


class AdminOnlyTests(AdminBackOfficeHelpers, TestCase):
    def test_every_admin_endpoint_refuses_other_users(self):
        self.client.force_authenticate(self.owner)
        for url in (
            "/api/admin/summary",
            "/api/admin/orders",
            "/api/admin/payments",
            "/api/admin/payment-failures",
            "/api/admin/refunds",
            "/api/admin/disputes",
            "/api/admin/event-reports",
            "/api/admin/settings",
            "/api/admin/exports/orders",
        ):
            self.assertEqual(self.client.get(url).status_code, 403, url)


class OrderAndPaymentSearchTests(AdminBackOfficeHelpers, TestCase):
    def test_orders_are_found_by_email_title_id_and_payment_reference(self):
        event, kind = self.inventory()
        order = self.buy(event, kind, quantity=2)
        reference = str(Payment.objects.get(order_id=order["id"]).simulation_reference)
        for query in ("buyer@example", "concert", str(order["id"]), reference):
            results = self.get_results("/api/admin/orders", q=query)
            self.assertEqual([row["id"] for row in results], [order["id"]], query)
        row = results[0]
        self.assertEqual(row["purchaser_email"], "buyer@example.com")
        self.assertEqual(row["tickets"], 2)
        self.assertEqual(row["payment_reference"], reference)
        self.assertTrue(row["simulated"])
        self.assertEqual(self.get_results("/api/admin/orders", q="nobody@else"), [])

    def test_order_filters_by_status_and_event(self):
        event, kind = self.inventory()
        other_event, other_kind = self.inventory()
        first = self.buy(event, kind)
        self.buy(other_event, other_kind)
        self.refund(first["id"])
        refunded = self.get_results("/api/admin/orders", status="refunded")
        self.assertEqual([row["id"] for row in refunded], [first["id"]])
        self.assertEqual(len(self.get_results("/api/admin/orders", event=other_event)), 1)
        self.as_admin()
        self.assertEqual(self.client.get("/api/admin/orders", {"status": "lost"}).status_code, 400)

    def test_payments_list_shows_paid_and_refunded(self):
        event, kind = self.inventory()
        first = self.buy(event, kind)
        self.buy(event, kind)
        self.refund(first["id"])
        self.assertEqual(len(self.get_results("/api/admin/payments")), 2)
        refunded = self.get_results("/api/admin/payments", status="refunded")
        self.assertEqual([row["order"] for row in refunded], [first["id"]])
        self.assertEqual(len(self.get_results("/api/admin/payments", status="paid")), 1)


class MonitoringTests(AdminBackOfficeHelpers, TestCase):
    def test_failed_checkout_appears_in_payment_failures(self):
        event, kind = self.inventory()
        self.buy(event, kind, outcome="failure")
        failures = self.get_results("/api/admin/payment-failures")
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0]["kind"], "checkout")
        self.assertEqual(failures[0]["user_email"], "buyer@example.com")
        self.assertEqual(failures[0]["order"], Order.objects.get().pk)

    def test_refunds_list_names_who_refunded(self):
        event, kind = self.inventory()
        order = self.buy(event, kind)
        self.refund(order["id"])
        refunds = self.get_results("/api/admin/refunds")
        self.assertEqual(refunds[0]["order"], order["id"])
        self.assertEqual(refunds[0]["initiated_by_email"], "owner@example.com")

    def test_disputes_are_payment_and_refund_support_cases(self):
        event, _ = self.inventory()
        for category in ("payment", "refund", "technical"):
            SupportCase.objects.create(
                requester=self.buyer,
                kind="attendee",
                category=category,
                subject=category,
                event_id=event,
            )
        disputes = self.get_results("/api/admin/disputes")
        self.assertEqual(sorted(row["category"] for row in disputes), ["payment", "refund"])

    def test_summary_counts_what_needs_attention(self):
        event, kind = self.inventory()
        self.buy(event, kind, outcome="failure")
        self.as_admin()
        summary = self.client.get("/api/admin/summary").json()
        self.assertEqual(summary["payment_failures"], 1)
        self.assertEqual(summary["open_event_reports"], 0)
        self.assertTrue(summary["simulated"])


class EventReportTests(AdminBackOfficeHelpers, TestCase):
    def report(self, event, user=None, reason="fraud"):
        self.client.force_authenticate(user or self.buyer)
        return self.client.post(
            f"/api/events/{event}/report", {"reason": reason, "details": "Fake"}, format="json"
        )

    def test_report_review_and_report_again(self):
        event, _ = self.inventory()
        self.assertEqual(self.report(event).status_code, 201)
        self.assertEqual(self.report(event).status_code, 409)
        open_reports = self.get_results("/api/admin/event-reports", status="open")
        self.assertEqual(open_reports[0]["reporter_email"], "buyer@example.com")
        response = self.client.patch(
            f"/api/admin/event-reports/{open_reports[0]['id']}",
            {"status": "dismissed", "resolution_note": "Checked, real event"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["reviewed_by_email"], "admin@example.com")
        self.assertEqual(self.report(event).status_code, 201)
        self.assertEqual(EventReport.objects.count(), 2)

    def test_organizer_cannot_report_own_event_and_reason_is_checked(self):
        event, _ = self.inventory()
        self.assertEqual(self.report(event, user=self.owner).status_code, 400)
        self.assertEqual(self.report(event, reason="boring").status_code, 400)

    def test_hidden_event_cannot_be_reported(self):
        event, _ = self.inventory()
        self.client.force_authenticate(self.owner)
        self.client.post(f"/api/events/{event}/publish", {"published": False}, format="json")
        self.assertEqual(self.report(event).status_code, 404)


class PlatformSettingsTests(AdminBackOfficeHelpers, TestCase):
    def patch(self, **data):
        self.as_admin()
        return self.client.patch("/api/admin/settings", data, format="json")

    def test_defaults_come_from_deployment_settings(self):
        self.as_admin()
        body = self.client.get("/api/admin/settings").json()
        self.assertEqual(body["activation_fee_minor"], settings.PAID_SALES_ACTIVATION_FEE_MINOR)
        self.assertEqual(body["processing_fee_bps"], settings.PROCESSING_FEE_BPS)
        self.assertFalse(body["overridden"]["activation_fee_minor"])

    def test_new_activation_fee_is_quoted_to_organizers(self):
        response = self.patch(activation_fee_minor=700000)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["updated_by_email"], "admin@example.com")
        self.client.force_authenticate(self.owner)
        event = self.client.post(
            "/api/events",
            {
                "title": "Fresh",
                "venue": "Astana",
                "starts_at": "2030-01-01T18:00:00Z",
                "ends_at": "2030-01-01T20:00:00Z",
                "capacity": 5,
            },
            format="json",
        ).json()["id"]
        state = self.client.get(f"/api/events/{event}/activation").json()
        self.assertEqual(state["fee_minor"], 700000)

    def test_new_processing_fee_applies_to_new_payments_and_null_resets(self):
        self.patch(processing_fee_bps=500)
        self.client.force_authenticate(self.owner)
        event, kind = self.inventory(price=10000)
        order = self.buy(event, kind)
        self.assertEqual(Payment.objects.get(order_id=order["id"]).fee_minor, 500)
        body = self.patch(processing_fee_bps=None).json()
        self.assertEqual(body["processing_fee_bps"], settings.PROCESSING_FEE_BPS)
        self.assertFalse(body["overridden"]["processing_fee_bps"])

    def test_out_of_range_values_are_refused(self):
        self.assertEqual(self.patch(processing_fee_bps=20000).status_code, 400)
        self.assertEqual(self.patch(activation_fee_minor=-1).status_code, 400)


class ExportTests(AdminBackOfficeHelpers, TestCase):
    def test_orders_export_is_csv_with_header(self):
        event, kind = self.inventory()
        self.buy(event, kind)
        self.as_admin()
        response = self.client.get("/api/admin/exports/orders", {"status": "confirmed"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/csv"))
        self.assertIn("attachment", response["Content-Disposition"])
        lines = response.content.decode("utf-8-sig").splitlines()
        self.assertTrue(lines[0].startswith("id,status,event,event_title,purchaser_email"))
        self.assertEqual(len(lines), 2)
        self.assertIn("buyer@example.com", lines[1])

    def test_every_report_exports_and_unknown_is_404(self):
        self.as_admin()
        for name in (
            "orders",
            "payments",
            "payment-failures",
            "refunds",
            "disputes",
            "activations",
            "event-reports",
        ):
            self.assertEqual(self.client.get(f"/api/admin/exports/{name}").status_code, 200)
        self.assertEqual(self.client.get("/api/admin/exports/secrets").status_code, 404)
