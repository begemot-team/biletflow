import { API_BASE_URL } from '../config';

// Mirrors TicketSerializer in backend/ticketing/serializers.py.
export interface Ticket {
  id: number | string;
  identifier: string;
  status: 'valid' | 'checked_in' | 'cancelled' | 'refunded';
  attendee_name?: string;
  attendee_email?: string;
  qr_token?: string;
  order_item?: {
    ticket_type?: {
      name: string;
    };
  };
}

export interface VerifyResponse {
  valid: boolean;
  ticket: Ticket;
}

// DRF errors arrive as {detail: "..."} or as field errors like {qr_token: ["..."]}.
export const apiErrorMessage = (data: any, fallback: string): string => {
  if (!data || typeof data !== 'object') return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const first = Object.values(data)[0];
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  if (typeof first === 'string') return first;
  return fallback;
};

export const verifyTicket = async (
  qrToken: string,
  authToken: string,
  eventId: string
): Promise<VerifyResponse> => {
  const response = await fetch(`${API_BASE_URL}/tickets/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ qr_token: qrToken, event_id: eventId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(errorData, 'Ticket verification failed'));
  }

  return response.json();
};

export const checkInTicket = async (
  qrToken: string,
  authToken: string,
  eventId: string,
  ticketId: number | string
): Promise<Ticket> => {
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/check-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ qr_token: qrToken, event_id: eventId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(errorData, 'Check-in failed'));
  }

  return response.json();
};

// Reverses an accidental check-in (SRS 4.8); the backend records it in the audit log.
export const undoCheckIn = async (
  qrToken: string,
  authToken: string,
  eventId: string,
  ticketId: number | string,
  reason = ''
): Promise<Ticket> => {
  const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/check-in/undo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ qr_token: qrToken, event_id: eventId, reason }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(errorData, 'Undo check-in failed'));
  }

  return response.json();
};

export const fetchEventAttendees = async (
  eventId: string,
  authToken: string
): Promise<Ticket[]> => {
  const response = await fetch(`${API_BASE_URL}/events/${eventId}/attendees`, {
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(errorData, 'Failed to fetch event attendees'));
  }

  // The attendee list is paginated: {count, next, previous, results}.
  const data = await response.json();
  return Array.isArray(data) ? data : data.results || [];
};
