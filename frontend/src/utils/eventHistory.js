export function eventStatus(event, now = new Date()) {
  if (event.cancelled_at) return 'cancelled'
  if (event.suspended_at) return 'suspended'
  if (!event.published) return 'draft'
  const start = new Date(event.starts_at)
  const end = new Date(event.ends_at)
  if (now < start) return 'upcoming'
  if (now <= end) return 'active'
  return 'completed'
}

export const ACTIVITY_LABELS = {
  'event.created': 'Event created',
  'event.updated': 'Event details updated',
  'event.published': 'Event published',
  'event.unpublished': 'Event unpublished',
  'event.cancelled': 'Event cancelled',
  'event.suspended': 'Event suspended',
  'event.unsuspended': 'Event suspension lifted',
  'event.restored': 'Event restored',
  'event.seeded': 'Demo event prepared',
  'ticket_type.created': 'Ticket type created',
  'ticket_type.updated': 'Ticket type updated',
  'ticket_type.deleted': 'Ticket type deleted',
  'order.created': 'Ticket reservation created',
  'order.cancelled': 'Order cancelled',
  'payment.completed': 'Payment completed',
  'payment.failed': 'Payment failed',
  'order.refunded': 'Order refunded',
  'promo.redeemed': 'Promo code redeemed',
  'campaign.created': 'Campaign created',
  'campaign.updated': 'Campaign updated',
  'ticket.checked_in': 'Ticket checked in',
  'ticket.attendee_updated': 'Ticket holder updated',
  'staff.assigned': 'Event Admin assigned',
  'staff.removed': 'Event Admin removed',
  'support.opened': 'Support case opened',
  'support.assigned': 'Support case assigned',
  'support.status_changed': 'Support status changed',
  'activation.identity_verified': 'Identity check completed',
  'activation.payout_connected': 'Payout account connected',
  'activation.terms_accepted': 'Paid-sales terms accepted',
  'activation.fee_paid': 'Activation fee paid',
  'activation.fee_failed': 'Activation fee payment failed',
  'activation.activated': 'Paid sales activated',
  'activation.suspended': 'Paid sales suspended',
  'activation.unsuspended': 'Paid-sales suspension lifted',
  'activation.restored': 'Paid sales restored',
}

export function actionLabel(action) {
  return ACTIVITY_LABELS[action] ?? action.split('.').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export const statusLabel = (status) => ({
  draft: 'Draft',
  upcoming: 'Upcoming',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
}[status] ?? status)
