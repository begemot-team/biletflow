"""Platform-admin back office (SRS 4.12).

Search across orders and payments, monitoring of payment failures, refunds and
disputes, event reports, platform settings and CSV exports. Every endpoint here
is for platform admins only. All money is simulated (SRS 3.2).
"""

import csv
import uuid

from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPlatformAdmin

from . import services
from .models import (
    AuditLog,
    EventReport,
    Order,
    PaidSalesActivation,
    Payment,
    PlatformSettings,
    Refund,
    SupportCase,
)
from .permissions import visible_events

FAILURE_ACTIONS = {"payment.failed": "checkout", "activation.fee_failed": "activation_fee"}
# Payments are simulated, so there are no card-network chargebacks. A dispute is an
# attendee's or organizer's support case about a payment or a refund (SRS 4.13).
DISPUTE_CATEGORIES = ("payment", "refund")


class AdminFilterSerializer(serializers.Serializer):
    q = serializers.CharField(max_length=200, required=False, allow_blank=True)
    status = serializers.CharField(max_length=20, required=False, allow_blank=True)
    event = serializers.IntegerField(min_value=1, required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


def _filters(params):
    serializer = AdminFilterSerializer(data=params)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def _dated(queryset, data, field="created_at"):
    if "date_from" in data:
        queryset = queryset.filter(**{f"{field}__date__gte": data["date_from"]})
    if "date_to" in data:
        queryset = queryset.filter(**{f"{field}__date__lte": data["date_to"]})
    return queryset


def _status(data, allowed):
    status = data.get("status") or ""
    if status and status not in allowed:
        raise ValidationError({"status": f"Must be one of: {', '.join(allowed)}."})
    return status


def _related(obj, name):
    # Reverse one-to-one access raises when the row is missing; None reads better.
    try:
        return getattr(obj, name)
    except ObjectDoesNotExist:
        return None


def _search(q, *text_fields, id_field="pk", uuid_field=None):
    q = q.strip()
    condition = Q()
    for field in text_fields:
        condition |= Q(**{f"{field}__icontains": q})
    if q.isdigit():
        condition |= Q(**{id_field: int(q)})
    if uuid_field:
        try:
            condition |= Q(**{uuid_field: uuid.UUID(q)})
        except ValueError:
            pass
    return condition


# ---------- Rows: one dict per record, shared by the JSON lists and the CSV exports ----------


def order_row(order):
    payment = _related(order, "payment")
    refund = _related(payment, "refund") if payment else None
    return {
        "id": order.pk,
        "status": order.status,
        "event": order.event_id,
        "event_title": order.event.title,
        "purchaser_email": order.purchaser.email,
        "tickets": getattr(order, "ticket_count", None),
        "subtotal_minor": order.subtotal_minor,
        "discount_minor": order.discount_minor,
        "total_minor": order.total_minor,
        "currency": order.currency,
        "created_at": order.created_at,
        "confirmed_at": order.confirmed_at,
        "payment_reference": payment.simulation_reference if payment else None,
        "processing_fee_minor": payment.fee_minor if payment else None,
        "refunded_minor": refund.amount_minor if refund else None,
        "refunded_at": refund.created_at if refund else None,
        "simulated": True,
    }


def payment_row(payment):
    order = payment.order
    refund = _related(payment, "refund")
    return {
        "id": payment.pk,
        "reference": payment.simulation_reference,
        "status": "refunded" if refund else "paid",
        "order": order.pk,
        "event": order.event_id,
        "event_title": order.event.title,
        "purchaser_email": order.purchaser.email,
        "amount_minor": payment.amount_minor,
        "processing_fee_minor": payment.fee_minor,
        "currency": order.currency,
        "paid_at": payment.created_at,
        "refunded_at": refund.created_at if refund else None,
        "simulated": True,
    }


def failure_row(entry):
    return {
        "id": entry.pk,
        "kind": FAILURE_ACTIONS.get(entry.action, entry.action),
        "event": entry.event_id,
        "event_title": entry.event.title,
        "order": entry.entity_id if entry.entity_type == "Order" else None,
        "user_email": entry.actor.email if entry.actor else None,
        "description": entry.description,
        "created_at": entry.created_at,
    }


def refund_row(refund):
    order = refund.payment.order
    return {
        "id": refund.pk,
        "order": order.pk,
        "event": order.event_id,
        "event_title": order.event.title,
        "purchaser_email": order.purchaser.email,
        "amount_minor": refund.amount_minor,
        "currency": order.currency,
        "initiated_by_email": refund.initiated_by.email if refund.initiated_by else None,
        "created_at": refund.created_at,
    }


def dispute_row(case):
    return {
        "id": case.pk,
        "kind": case.kind,
        "category": case.category,
        "subject": case.subject,
        "status": case.status,
        "event": case.event_id,
        "order": case.order_id,
        "requester_email": case.requester.email,
        "created_at": case.created_at,
    }


def activation_row(activation):
    state = services.activation_state(activation.event, activation)
    return {
        "id": activation.pk,
        "event": activation.event_id,
        "event_title": activation.event.title,
        "organizer_email": activation.event.organizer.user.email,
        "status": state["status"],
        "fee_minor": state["fee_minor"],
        "activated_at": activation.activated_at,
        "suspended_at": activation.suspended_at,
        "suspension_reason": activation.suspension_reason,
    }


def report_row(report):
    return {
        "id": report.pk,
        "event": report.event_id,
        "event_title": report.event.title,
        "event_suspended": report.event.suspended_at is not None,
        "reporter_email": report.reporter.email,
        "reason": report.reason,
        "details": report.details,
        "status": report.status,
        "resolution_note": report.resolution_note,
        "reviewed_by_email": report.reviewed_by.email if report.reviewed_by else None,
        "reviewed_at": report.reviewed_at,
        "created_at": report.created_at,
    }


# ---------- Querysets, filtered by the request's query parameters ----------


def orders(params):
    data = _filters(params)
    status = _status(data, ("pending", "confirmed", "cancelled", "refunded"))
    items = Order.objects.select_related(
        "event", "purchaser", "payment", "payment__refund"
    ).annotate(ticket_count=Count("items__tickets"))
    if status:
        items = items.filter(status=status)
    if "event" in data:
        items = items.filter(event_id=data["event"])
    if data.get("q", "").strip():
        items = items.filter(
            _search(
                data["q"],
                "purchaser__email",
                "event__title",
                uuid_field="payment__simulation_reference",
            )
        )
    return _dated(items, data)


def payments(params):
    data = _filters(params)
    status = _status(data, ("paid", "refunded"))
    items = Payment.objects.select_related("order__event", "order__purchaser", "refund").order_by(
        "-created_at", "-pk"
    )
    if status:
        items = items.filter(refund__isnull=(status == "paid"))
    if "event" in data:
        items = items.filter(order__event_id=data["event"])
    if data.get("q", "").strip():
        items = items.filter(
            _search(
                data["q"],
                "order__purchaser__email",
                "order__event__title",
                id_field="order_id",
                uuid_field="simulation_reference",
            )
        )
    return _dated(items, data)


def payment_failures(params):
    data = _filters(params)
    items = AuditLog.objects.filter(action__in=FAILURE_ACTIONS).select_related("event", "actor")
    if "event" in data:
        items = items.filter(event_id=data["event"])
    return _dated(items, data)


def refunds(params):
    data = _filters(params)
    items = Refund.objects.select_related(
        "payment__order__event", "payment__order__purchaser", "initiated_by"
    )
    if "event" in data:
        items = items.filter(payment__order__event_id=data["event"])
    return _dated(items, data)


def disputes(params):
    data = _filters(params)
    status = _status(data, SupportCase.STATUSES)
    items = SupportCase.objects.filter(category__in=DISPUTE_CATEGORIES).select_related("requester")
    if status:
        items = items.filter(status=status)
    if "event" in data:
        items = items.filter(event_id=data["event"])
    return _dated(items, data)


def activations(params):
    data = _filters(params)
    items = PaidSalesActivation.objects.select_related("event__organizer__user")
    if "event" in data:
        items = items.filter(event_id=data["event"])
    return _dated(items, data)


def event_reports(params):
    data = _filters(params)
    status = _status(data, EventReport.STATUSES)
    items = EventReport.objects.select_related("event", "reporter", "reviewed_by")
    if status:
        items = items.filter(status=status)
    if "event" in data:
        items = items.filter(event_id=data["event"])
    return _dated(items, data)


REPORTS = {
    "orders": (orders, order_row),
    "payments": (payments, payment_row),
    "payment-failures": (payment_failures, failure_row),
    "refunds": (refunds, refund_row),
    "disputes": (disputes, dispute_row),
    "activations": (activations, activation_row),
    "event-reports": (event_reports, report_row),
}


class AdminReportList(APIView):
    """Paginated JSON list; `report` is set per URL in config/urls.py."""

    permission_classes = [IsPlatformAdmin]
    report = None

    def get(self, request):
        queryset, row = REPORTS[self.report]
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(queryset(request.query_params), request, view=self)
        return paginator.get_paginated_response([row(item) for item in page])


class AdminReportExport(APIView):
    """The same lists as CSV, unpaginated, for spreadsheets (SRS 4.12 basic reports)."""

    permission_classes = [IsPlatformAdmin]

    def get(self, request, name):
        if name not in REPORTS:
            raise NotFound(f"Unknown report. Available: {', '.join(REPORTS)}.")
        queryset, row = REPORTS[name]
        rows = [row(item) for item in queryset(request.query_params)]
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        stamp = timezone.localdate().isoformat()
        response["Content-Disposition"] = f'attachment; filename="biletflow-{name}-{stamp}.csv"'
        # Excel opens UTF-8 CSV correctly only with a byte-order mark (Cyrillic titles).
        response.write("﻿")
        writer = csv.writer(response)
        if rows:
            writer.writerow(list(rows[0]))
        for item in rows:
            writer.writerow(["" if value is None else value for value in item.values()])
        return response


class AdminSummary(APIView):
    """Counts for the admin dashboard: what needs attention right now."""

    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        return Response(
            {
                "orders": Order.objects.count(),
                "payments": Payment.objects.count(),
                "payment_failures": AuditLog.objects.filter(action__in=FAILURE_ACTIONS).count(),
                "refunds": Refund.objects.count(),
                "open_disputes": SupportCase.objects.filter(category__in=DISPUTE_CATEGORIES)
                .exclude(status="resolved")
                .count(),
                "open_event_reports": EventReport.objects.filter(status="open").count(),
                "simulated": True,
            }
        )


# ---------- Event reports ----------


class ReportEventSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=EventReport.REASONS)
    details = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class ReviewReportSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=EventReport.STATUSES)
    resolution_note = serializers.CharField(max_length=300, required=False, allow_blank=True)


class ReportEvent(APIView):
    """Any signed-in user who can see an event can report it to the platform admins."""

    def post(self, request, pk):
        event = get_object_or_404(visible_events(request.user), pk=pk)
        if event.organizer.user_id == request.user.pk:
            raise ValidationError({"detail": "You cannot report your own event."})
        serializer = ReportEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                report = EventReport.objects.create(
                    event=event, reporter=request.user, **serializer.validated_data
                )
        except IntegrityError:
            raise services.Conflict("You have already reported this event.") from None
        return Response(
            {"id": report.pk, "event": event.pk, "reason": report.reason, "status": report.status},
            status=201,
        )


class AdminEventReportDetail(APIView):
    permission_classes = [IsPlatformAdmin]

    def patch(self, request, pk):
        serializer = ReviewReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        report = get_object_or_404(EventReport.objects.select_related("event", "reporter"), pk=pk)
        report.status = data["status"]
        report.resolution_note = data.get("resolution_note", report.resolution_note)
        if report.status == "open":
            report.reviewed_by, report.reviewed_at = None, None
        else:
            report.reviewed_by, report.reviewed_at = request.user, timezone.now()
        try:
            with transaction.atomic():
                report.save()
        except IntegrityError:
            raise services.Conflict(
                "This user already has another open report for this event."
            ) from None
        return Response(report_row(report))


# ---------- Platform settings ----------


class SettingsSerializer(serializers.Serializer):
    # null resets a value to the deployment default.
    activation_fee_minor = serializers.IntegerField(
        min_value=0, max_value=100_000_000, allow_null=True, required=False
    )
    processing_fee_bps = serializers.IntegerField(
        min_value=0, max_value=10_000, allow_null=True, required=False
    )


def settings_payload(row):
    effective = services.platform_settings()
    return effective | {
        "currency": "KZT",
        "overridden": {
            "activation_fee_minor": bool(row and row.activation_fee_minor is not None),
            "processing_fee_bps": bool(row and row.processing_fee_bps is not None),
        },
        "updated_by_email": row.updated_by.email if row and row.updated_by else None,
        "updated_at": row.updated_at if row else None,
        "simulated": True,
    }


class AdminPlatformSettings(APIView):
    """SRS 4.12: configure the activation fee and platform settings.

    A new fee applies to activations paid after the change; events already
    activated keep the fee they paid.
    """

    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        return Response(settings_payload(PlatformSettings.objects.filter(pk=1).first()))

    @transaction.atomic
    def patch(self, request):
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row, _ = PlatformSettings.objects.select_for_update().get_or_create(pk=1)
        for field, value in serializer.validated_data.items():
            setattr(row, field, value)
        row.updated_by = request.user
        row.save()
        return Response(settings_payload(row))
