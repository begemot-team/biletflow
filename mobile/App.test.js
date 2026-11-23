import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import App from './App';
import { API_BASE_URL } from './config';

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

describe('<App />', () => {
  it('renders login screen correctly', async () => {
    await render(<App />);
    expect(screen.getByText('Event Admin Login')).toBeTruthy();
  });

  it('loads all assigned events from the check-in API after login', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access: 'staff-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        results: [{ id: 40, title: 'Assigned event', venue: 'Main Hall' }],
        next: `${API_BASE_URL}/me/check-in-events?page=2`,
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        results: [{ id: 50, title: 'Another assigned event', venue: 'Small Hall' }],
        next: null,
      }) });
    try {
      await render(<App />);
      await fireEvent.changeText(screen.getByPlaceholderText('Email / Username'), 'staff@example.com');
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
      await fireEvent.press(screen.getByText('Login'));

      expect(await screen.findByText('Assigned event')).toBeTruthy();
      expect(screen.getByText('Another assigned event')).toBeTruthy();
      expect(screen.queryByText('Tech Conference 2026')).toBeNull();
      for (const page of [1, 2]) {
        expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/me/check-in-events?page=${page}`,
          expect.objectContaining({ headers: { Authorization: 'Bearer staff-token' } }));
      }
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('sends the event selected from the list when verifying a QR', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Ticket not found for this event.' }),
    });
    try {
      await render(<App />);
      await fireEvent.press(screen.getByText(/Dev Bypass Login/));
      await fireEvent.press(screen.getAllByText('Scan QR')[1]);
      await fireEvent.changeText(screen.getByTestId('manual-input'), 'OTHER-EVENT-QR');
      await fireEvent.press(screen.getByTestId('simulate-button'));

      expect(await screen.findByText('Ticket not found for this event.')).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/tickets/verify`, expect.objectContaining({
        body: JSON.stringify({ qr_token: 'OTHER-EVENT-QR', event_id: '2' }),
      }));
    } finally {
      fetchMock.mockRestore();
    }
  });
});
