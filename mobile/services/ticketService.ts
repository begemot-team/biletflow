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
  ticketId?: number | string
): Promise<VerifyResponse> => {
  const url = ticketId 
    ? `${API_BASE_URL}/tickets/${ticketId}/verify` 
    : `${API_BASE_URL}/tickets/verify`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ qr_token: qrToken }),
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
  ticketId?: number | string
): Promise<Ticket> => {
  const url = ticketId 
    ? `${API_BASE_URL}/tickets/${ticketId}/check-in` 
    : `${API_BASE_URL}/tickets/check-in`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ qr_token: qrToken }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(errorData, 'Check-in failed'));
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