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
