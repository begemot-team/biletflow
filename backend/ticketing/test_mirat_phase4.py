from django.test import TestCase
from reportlab.pdfbase import pdfmetrics

from accounts.models import User
from ticketing.models import Event, Ticket, TicketType
from ticketing.notifications import TICKET_FONT_NAME
from ticketing.test_phase3 import Phase3Helpers


class PrintableTicketTests(Phase3Helpers, TestCase):
    def test_buyer_downloads_canonical_ticket_pdf(self):
        event, kind = self.inventory()
        order = self.buy(event, kind)
        ticket = order["tickets"][0]

        response = self.client.get(f"/api/tickets/{ticket['id']}/pdf")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn(f"biletflow-ticket-{ticket['id']}.pdf", response["Content-Disposition"])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertIn(b"ADMISSION TICKET", response.content)
        self.assertIn(str(ticket["identifier"]).encode(), response.content)
        self.assertGreater(len(response.content), 4000)

    def test_printed_ticket_embeds_cyrillic_glyphs_and_keeps_the_full_address(self):
        event, kind = self.inventory()
        ticket = self.buy(event, kind)["tickets"][0]
        title = "Қазақша концерт и русская ёлка"
        venue = "Алматы, проспект Райымбек, " + "длинный адрес " * 12 + "FLOOR-37"
        attendee = "Әлия Төлегенова"
        Event.objects.filter(pk=event).update(title=title, venue=venue)
        TicketType.objects.filter(pk=kind).update(name="Кіру билеті")
        Ticket.objects.filter(pk=ticket["id"]).update(attendee_name=attendee)

        response = self.client.get(f"/api/tickets/{ticket['id']}/pdf")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"/FontFile2", response.content)
        glyphs = pdfmetrics.getFont(TICKET_FONT_NAME).face.charToGlyph
        for letter in "ЁёӘәҒғҚқҢңӨөҰұҮүҺһІі":
            self.assertTrue(glyphs.get(ord(letter)), letter)
        self.assertIn(b"FLOOR-37", response.content)

    def test_unrelated_attendee_cannot_download_ticket_pdf(self):
        event, kind = self.inventory()
        ticket = self.buy(event, kind)["tickets"][0]
        stranger = User.objects.create_user("stranger@example.com", "secret")
        self.client.force_authenticate(stranger)

        self.assertEqual(self.client.get(f"/api/tickets/{ticket['id']}/pdf").status_code, 404)

    def test_campaign_qr_is_labelled_as_campaign_link(self):
        event, _ = self.inventory()
        campaign = self.client.post(
            f"/api/events/{event}/campaigns",
            {"name": "Launch", "discount_type": "percent", "discount_value": 10},
            format="json",
        ).json()

        response = self.client.get(f"/api/campaigns/{campaign['id']}/qr")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertEqual(response["X-BiletFlow-QR-Kind"], "campaign-link")
        self.assertIn(b"<svg", response.content)
