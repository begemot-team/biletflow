import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import ScanScreen from './ScanScreen';
import AttendeeScreen from './AttendeeScreen';
import { API_BASE_URL } from './config';

interface AssignedEvent {
  id: string;
  title: string;
  date: string;
  venue: string;
}

const MOCK_ASSIGNED_EVENTS: AssignedEvent[] = [
  { id: '1', title: 'Tech Conference 2026', date: 'Oct 12, 2026', venue: 'Main Hall A' },
  { id: '2', title: 'BiletFlow Launch Party', date: 'Nov 05, 2026', venue: 'Auditorium' },
  { id: '3', title: 'Developer Meetup', date: 'Dec 01, 2026', venue: 'Room 302' },
];

const DEV_BYPASS_TOKEN = 'dev-bypass-token-123';
const canUseDevBypass = __DEV__ || Platform.OS !== 'web';

function formatEventDate(raw: any): string {
  const value = raw?.starts_at || raw?.date;
  if (!value) return 'Date TBA';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'LOGIN' | 'EVENTS' | 'SCAN' | 'ATTENDEES'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [assignedEvents, setAssignedEvents] = useState<AssignedEvent[]>([]);
  const [eventsRevision, setEventsRevision] = useState(0);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<{ id: string; title: string } | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    if (currentScreen !== 'EVENTS' || !authToken || authToken === DEV_BYPASS_TOKEN) return;

    const controller = new AbortController();
    const { signal } = controller;

    async function loadAssignedEvents() {
      setEventsLoading(true);
      setEventsError(null);

      try {
        const events: AssignedEvent[] = [];
        for (let page = 1; ; page += 1) {
          const response = await fetch(`${API_BASE_URL}/me/check-in-events?page=${page}`, {
            headers: { Authorization: `Bearer ${authToken}` },
            signal,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.detail || data.message || 'Failed to load assigned events');
          }
          if (!Array.isArray(data.results)) {
            throw new Error('The server returned an invalid event list.');
          }
          events.push(...data.results.map((event) => ({
            id: String(event.id),
            title: event.title,
            date: formatEventDate(event),
            venue: event.venue,
          })));
          if (!data.next) break;
        }
        if (!signal.aborted) setAssignedEvents(events);
      } catch (err: any) {
        if (signal.aborted) return;
        setEventsError(err.message || 'Could not fetch events from server.');
        setAssignedEvents([]);
      } finally {
        if (!signal.aborted) setEventsLoading(false);
      }
    }

    loadAssignedEvents();
    return () => controller.abort();
  }, [currentScreen, authToken, eventsRevision]);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        if (!data.access) {
          showAlert('Login Failed', 'Server did not return an access token.');
          return;
        }
        setAssignedEvents([]);
        setEventsLoading(true);
        setAuthToken(data.access);
        setCurrentScreen('EVENTS');
      } else {
        showAlert('Login Failed', data.detail || data.message || 'Invalid credentials');
      }
    } catch (err) {
      showAlert('Network Error', 'Could not reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDevBypass = () => {
    setAuthToken(DEV_BYPASS_TOKEN);
    setAssignedEvents(MOCK_ASSIGNED_EVENTS);
    setEventsLoading(false);
    setEventsError(null);
    setCurrentScreen('EVENTS');
  };

  const handleOpenScanner = (event: { id: string; title: string }) => {
    setSelectedEvent(event);
    setCurrentScreen('SCAN');
  };

  const handleOpenAttendees = (event: { id: string; title: string }) => {
    setSelectedEvent(event);
    setCurrentScreen('ATTENDEES');
  };

  const handleScanSuccess = (code: string) => {
    setLastScannedCode(code);
    if (Platform.OS !== 'web') {
      showAlert('QR Code Scanned', `Payload: ${code}\nEvent: ${selectedEvent?.title}`);
    }
  };

  if (currentScreen === 'SCAN' && selectedEvent) {
    return (
      <ScanScreen
        eventId={selectedEvent.id}
        authToken={authToken || DEV_BYPASS_TOKEN}
        onBack={() => setCurrentScreen('EVENTS')}
        onScanSuccess={handleScanSuccess}
      />
    );
  }

  if (currentScreen === 'ATTENDEES' && selectedEvent) {
    return (
      <AttendeeScreen
        eventId={selectedEvent.id}
        eventTitle={selectedEvent.title}
        authToken={authToken || DEV_BYPASS_TOKEN}
        onBack={() => setCurrentScreen('EVENTS')}
      />
    );
  }

  if (currentScreen === 'EVENTS') {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Assigned Events</Text>
          <View style={styles.headerActions}>
            {authToken && authToken !== DEV_BYPASS_TOKEN && (
              <TouchableOpacity onPress={() => setEventsRevision((revision) => revision + 1)}
                disabled={eventsLoading} style={styles.refreshBtn}>
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { setAuthToken(null); setCurrentScreen('LOGIN'); }}>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {lastScannedCode && (
          <View style={styles.scanBanner}>
            <Text style={styles.scanBannerText}>Last Scanned QR: {lastScannedCode}</Text>
          </View>
        )}

        {eventsError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{eventsError}</Text>
          </View>
        )}

        {eventsLoading ? (
          <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={assignedEvents}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No assigned events found for this account.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.eventCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <Text style={styles.eventDetails}>{item.date} • {item.venue}</Text>
                </View>
                <View style={styles.actionGroup}>
                  <TouchableOpacity
                    style={styles.attendeeButton}
                    onPress={() => handleOpenAttendees(item)}
                  >
                    <Text style={styles.attendeeButtonText}>Attendees</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.scanButton}
                    onPress={() => handleOpenScanner(item)}
                  >
                    <Text style={styles.scanButtonText}>Scan QR</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Event Admin Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Email / Username"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
      </TouchableOpacity>

      {canUseDevBypass && (
        <TouchableOpacity style={styles.devButton} onPress={handleDevBypass}>
          <Text style={styles.devButtonText}>⚡ Dev Bypass Login (Test Navigation)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f5f5f5', paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 24, fontWeight: 'bold' },
  refreshBtn: { paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#E3F2FD', borderRadius: 6 },
  refreshText: { color: '#007AFF', fontWeight: 'bold', fontSize: 14 },
  logoutText: { color: '#FF3B30', fontWeight: 'bold', fontSize: 16 },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  button: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  devButton: { marginTop: 20, padding: 10, alignItems: 'center' },
  devButtonText: { color: '#6c757d', fontSize: 14, textDecorationLine: 'underline' },
  eventCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#e0e0e0' },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  eventDetails: { color: '#666', fontSize: 14 },
  actionGroup: { flexDirection: 'row', gap: 6 },
  attendeeButton: { backgroundColor: '#007AFF', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6 },
  attendeeButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  scanButton: { backgroundColor: '#34C759', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6 },
  scanButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  scanBanner: { backgroundColor: '#E3F2FD', padding: 10, borderRadius: 6, marginBottom: 15 },
  scanBannerText: { color: '#0D47A1', fontWeight: 'bold', fontSize: 12 },
  errorBanner: { backgroundColor: '#FFEBEE', padding: 10, borderRadius: 6, marginBottom: 15 },
  errorBannerText: { color: '#C62828', fontWeight: 'bold', fontSize: 12 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40, fontSize: 15 },
});
