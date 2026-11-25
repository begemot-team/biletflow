"""Attendee email and printable tickets (SRS 4.4 and 4.7).

Development defaults to console email and tests use the in-memory backend.
Deployments can enable SMTP.
"""

from datetime import UTC
from io import BytesIO
from pathlib import Path

import qrcode
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, send_mass_mail
from django.utils import timezone
from django.utils.html import escape
from qrcode.image.svg import SvgPathImage
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepInFrame, Paragraph

from .models import Event, Order, SupportCase, Ticket

TICKET_FONT_NAME = "NotoSans"
TICKET_FONT_PATH = Path(__file__).with_name("fonts") / "NotoSans-Regular.ttf"


def ticket_qr_svg(token):
    output = BytesIO()
    qrcode.make(token, image_factory=SvgPathImage).save(output)
    return output.getvalue()


def ticket_pdf(ticket, token):
    """Render one canonical admission ticket as a printable A4 PDF."""
    event = ticket.order_item.order.event
    ticket_type = ticket.order_item.ticket_type
    output = BytesIO()
    font_name = TICKET_FONT_NAME
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, TICKET_FONT_PATH))

    document = canvas.Canvas(output, pagesize=A4, pageCompression=0)
    width, height = A4
    green = HexColor("#183b30")
    text_color = HexColor("#1f291f")
    margin = 48
    qr_size = 225
    qr_left = width - margin - qr_size
    document.setTitle(f"BiletFlow ticket {ticket.identifier}")
    document.setAuthor("BiletFlow")
    document.setFillColor(green)
    document.rect(0, height - 108, width, 108, fill=1, stroke=0)
    document.setFillColorRGB(1, 1, 1)
    document.setFont(font_name, 28)
    document.drawString(48, height - 67, "biletflow")
    document.setFont(font_name, 10)
    document.drawString(49, height - 89, "ADMISSION TICKET • NOT A CAMPAIGN QR")

    title_style = ParagraphStyle(
        "Ticket title", fontName=font_name, fontSize=22, leading=27, textColor=text_color
    )
    title_width = width - 2 * margin
    title = KeepInFrame(title_width, 144, [Paragraph(escape(event.title), title_style)])
    _, title_height = title.wrapOn(document, title_width, 144)
    title_top = height - 136
    title.drawOn(document, margin, title_top - title_height)

    starts = timezone.localtime(event.starts_at).strftime("%d.%m.%Y %H:%M")
    details = [
        ("Date and time", starts),
        ("Venue", event.venue),
        ("Ticket type", ticket_type.name),
        ("Attendee", ticket.attendee_name or "—"),
        ("Ticket ID", str(ticket.identifier)),
        ("Status", ticket.status.replace("_", " ").title()),
    ]
    label_style = ParagraphStyle(
        "Ticket label",
        fontName=font_name,
        fontSize=9,
        leading=12,
        textColor=HexColor("#596659"),
        spaceAfter=3,
    )
    value_style = ParagraphStyle(
        "Ticket value",
        fontName=font_name,
        fontSize=12,
        leading=16,
        textColor=text_color,
        spaceAfter=18,
    )
    paragraphs = []
    for label, value in details:
        paragraphs.append(Paragraph(label.upper(), label_style))
        paragraphs.append(Paragraph(escape(value), value_style))

    details_top = title_top - title_height - 24
    # Reserve a separate text column and keep even long values inside the printable area.
    details_width = qr_left - margin - 24
    max_details_height = details_top - 116
    detail_column = KeepInFrame(details_width, max_details_height, paragraphs)
    _, details_height = detail_column.wrapOn(document, details_width, max_details_height)
    detail_column.drawOn(document, margin, details_top - details_height)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
    qr.add_data(token)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    cell = qr_size / len(matrix)
    bottom = details_top - qr_size
    document.setFillColor(green)
    for row, values in enumerate(matrix):
        for column, enabled in enumerate(values):
            if enabled:
                document.rect(
                    qr_left + column * cell,
                    bottom + (len(matrix) - row - 1) * cell,
                    cell + 0.2,
                    cell + 0.2,
                    fill=1,
                    stroke=0,
                )

    document.setFillColorRGB(0.12, 0.16, 0.12)
    document.setFont(font_name, 11)
    document.drawCentredString(width / 2, 82, "Present this admission QR at the event entrance.")
    document.setFont(font_name, 8)
    document.setFillColorRGB(0.4, 0.45, 0.4)
    document.drawCentredString(
        width / 2,
        62,
        "Generated from the BiletFlow ticket record. No payment-card data is included.",
    )
    document.showPage()
    document.save()
    return output.getvalue()


def money(minor, currency):
    return f"{minor / 100:,.2f} {currency}".replace(",", " ")


def send_order_confirmation(order_id):
    from .serializers import qr_token

    order = Order.objects.select_related("event", "purchaser").get(pk=order_id)
    if order.status != "confirmed":
        return
    event = order.event
    account_url = f"{settings.FRONTEND_BASE_URL}/account"
    tickets = list(
        Ticket.objects.filter(order_item__order=order)
        .select_related("order_item__ticket_type")
        .order_by("pk")
    )
    starts = timezone.localtime(event.starts_at).strftime("%d.%m.%Y %H:%M")
    kind = "Free registration" if order.total_minor == 0 else "Simulated payment"
    lines = [
        f"Your BiletFlow order #{order.pk} is confirmed.",
        "",
        f"Event: {event.title}",
        f"When: {starts}",
        f"Venue: {event.venue}",
        f"{kind}: {money(order.total_minor, order.currency)}"
        + (
            f" (discount {money(order.discount_minor, order.currency)})"
            if order.discount_minor
            else ""
        ),
        "",
        "Tickets (each QR code is also attached as an SVG file):",
    ]
    for ticket in tickets:
        lines.append(
            f"- {ticket.order_item.ticket_type.name} · {ticket.attendee_name}"
            f" · ticket {ticket.identifier}"
        )
    lines += [
        "",
        f"All tickets are in your account: {account_url}",
        "Demo environment: no real money was charged.",
    ]
    html_items = "".join(
        f"<li>{escape(t.order_item.ticket_type.name)} · {escape(t.attendee_name)}"
        f" · <code>{t.identifier}</code></li>"
        for t in tickets
    )
    html = (
        f"<p>Your BiletFlow order #{order.pk} is confirmed.</p>"
        f"<p><b>{escape(event.title)}</b><br>{starts}<br>{escape(event.venue)}</p>"
        f"<ul>{html_items}</ul>"
        f'<p><a href="{escape(account_url)}">View your tickets</a></p>'
        "<p>QR codes are attached. Demo environment: no real money was charged.</p>"
    )
    message = EmailMultiAlternatives(
        subject=f"BiletFlow: your tickets for {event.title}",
        body="\n".join(lines) + "\n",
        to=[order.purchaser.email],
    )
    message.attach_alternative(html, "text/html")
    for ticket in tickets:
        svg = ticket_qr_svg(qr_token(ticket))
        message.attach(f"ticket-{ticket.identifier}.svg", svg, "image/svg+xml")
    message.send()


def send_order_closed(order_id):
    """Tell the attendee their tickets were refunded or cancelled (SRS 4.9)."""
    order = Order.objects.select_related("event", "purchaser", "payment__refund").get(pk=order_id)
    if order.status not in ("refunded", "cancelled"):
        return
    event = order.event
    identifiers = Ticket.objects.filter(order_item__order=order).values_list(
        "identifier", flat=True
    )
    if order.status == "refunded":
        subject = f"BiletFlow: refund for {event.title}"
        summary = (
            f"Your BiletFlow order #{order.pk} was refunded in full: "
            f"{money(order.payment.refund.amount_minor, order.currency)} (simulated)."
        )
    else:
        subject = f"BiletFlow: registration cancelled for {event.title}"
        summary = f"Your free registration #{order.pk} was cancelled."
    lines = [
        summary,
        "",
        f"Event: {event.title}",
        f"When: {timezone.localtime(event.starts_at).strftime('%d.%m.%Y %H:%M')}",
        "",
        "These tickets are no longer valid for entry:",
        *(f"- ticket {identifier}" for identifier in identifiers),
        "",
        "Demo environment: no real money was moved.",
    ]
    EmailMultiAlternatives(
        subject=subject, body="\n".join(lines) + "\n", to=[order.purchaser.email]
    ).send()


def send_event_cancelled(event, recipients):
    subject = "BiletFlow: event cancelled"
    body = (
        f"{event.title} has been cancelled. Its tickets can no longer be used for entry.\n\n"
        "If you paid for a ticket, contact the organizer about a refund.\n\n"
        "The attached calendar update removes or marks the earlier event as cancelled."
    )
    calendar = cancelled_event_ics(event)
    for recipient in recipients:
        message = EmailMultiAlternatives(subject=subject, body=body, to=[recipient])
        message.attach(f"biletflow-event-{event.pk}-cancelled.ics", calendar, "text/calendar")
        message.send()


def _ics_text(value):
    return (
        str(value or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _ics_date(value):
    return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def cancelled_event_ics(event, now=None):
    """RFC 5545 cancellation using the same stable event UID as calendar exports."""
    stamp = now or timezone.now()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Begemot//BiletFlow//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:CANCEL",
        "BEGIN:VEVENT",
        f"UID:event-{event.pk}@biletflow",
        f"DTSTAMP:{_ics_date(stamp)}",
        f"DTSTART:{_ics_date(event.starts_at)}",
        f"DTEND:{_ics_date(event.ends_at)}",
        "SEQUENCE:1",
        "STATUS:CANCELLED",
        f"SUMMARY:{_ics_text(event.title)}",
        f"LOCATION:{_ics_text(event.venue)}",
        f"URL:{settings.FRONTEND_BASE_URL}/events/{event.pk}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"


def send_payment_failed(order_id):
    """The simulated payment did not go through: no tickets were issued (SRS 4.10)."""
    order = Order.objects.select_related("event", "purchaser").get(pk=order_id)
    if order.status != "pending":
        return
    event = order.event
    lines = [
        f"The payment for your BiletFlow order #{order.pk} did not go through.",
        "",
        f"Event: {event.title}",
        f"Amount: {money(order.total_minor, order.currency)}",
        "",
        "No tickets were issued and nothing was charged. Your tickets stay reserved "
        f"until {timezone.localtime(order.expires_at).strftime('%d.%m.%Y %H:%M')}; "
        f"you can try again here: {settings.FRONTEND_BASE_URL}/checkout/{order.pk}",
        "",
        "Demo environment: no real money is involved.",
    ]
    EmailMultiAlternatives(
        subject=f"BiletFlow: payment failed for {event.title}",
        body="\n".join(lines) + "\n",
        to=[order.purchaser.email],
    ).send()


EVENT_FIELD_LABELS = {
    "title": "Name",
    "venue": "Venue",
    "starts_at": "Starts",
    "ends_at": "Ends",
}


def send_event_updated(event_id, fields, recipients):
    """Tell ticket holders that the time, place or name of their event changed (SRS 4.10)."""
    event = Event.objects.get(pk=event_id)
    if event.cancelled_at:
        return
    when = timezone.localtime(event.starts_at).strftime("%d.%m.%Y %H:%M")
    ends = timezone.localtime(event.ends_at).strftime("%d.%m.%Y %H:%M")
    current = {"title": event.title, "venue": event.venue, "starts_at": when, "ends_at": ends}
    body = "\n".join(
        [
            f"The organizer changed the details of {event.title}:",
            "",
            *(f"- {EVENT_FIELD_LABELS[f]}: {current[f]}" for f in fields),
            "",
            f"Event: {event.title}",
            f"When: {when} – {ends}",
            f"Venue: {event.venue}",
            "",
            "Your tickets stay valid. If you added the event to your calendar, "
            f"add it again from {settings.FRONTEND_BASE_URL}/events/{event.pk} to update it.",
        ]
    )
    send_mass_mail(
        (f"BiletFlow: {event.title} has changed", body + "\n", None, [recipient])
        for recipient in recipients
    )


def send_support_notification(case_id, recipient, summary):
    """Email for new replies, assignment and status changes on a support case (SRS 4.13)."""
    case = SupportCase.objects.select_related("event").get(pk=case_id)
    context = f"Event: {case.event.title}\n" if case.event else "Platform support\n"
    EmailMultiAlternatives(
        subject=f"BiletFlow support #{case.pk}: {summary}",
        body=(
            f'{summary} on support case #{case.pk} "{case.subject}".\n\n'
            f"{context}Status: {case.status}\n\n"
            f"Open the conversation: {settings.FRONTEND_BASE_URL}/support/{case.pk}\n"
        ),
        to=[recipient],
    ).send()
