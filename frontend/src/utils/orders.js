// Refunds and cancellations (SRS 4.9), see POST /orders/{id}/refund and
// /orders/{id}/cancel in docs/BACKEND_MVP_API.md. The organizer's order list
// (GET /events/{id}/orders) already says which action each order allows.

import { formatAmount } from './money.js'

export const ORDER_STATUS = {
  pending: 'Awaiting payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  expired: 'Expired',
}

export const ACTION_LABEL = { refund: 'Refund', cancel: 'Cancel registration' }

// The endpoint for the action the API allows, or null when nothing is allowed.
export function actionPath(order) {
  return ACTION_LABEL[order?.action] ? `/orders/${order.id}/${order.action}` : null
}

// The second button, after confirmText.
export const CONFIRM_LABEL = { refund: 'Yes, refund', cancel: 'Yes, cancel registration' }

// Shown on the second click, so nobody refunds by accident: { text, values } for t().
export function confirmText(order) {
  const one = order.tickets === 1
  if (order.action === 'refund') {
    return {
      text: one ? 'Refund {amount} and invalidate 1 ticket?' : 'Refund {amount} and invalidate {count} tickets?',
      values: { amount: formatAmount(order.total_minor), count: order.tickets },
    }
  }
  return {
    text: one ? 'Cancel this registration and invalidate 1 ticket?' : 'Cancel this registration and invalidate {count} tickets?',
    values: { count: order.tickets },
  }
}

// Attendee side: only a confirmed order that cost nothing can be cancelled by
// its purchaser; paid orders are refunded by the organizer. The API refuses it
// once the event has started and explains why.
export function attendeeCanCancel(order) {
  return order?.status === 'confirmed' && order.total_minor === 0
}
