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
import { fetchEventAttendees, checkInTicket, Ticket } from './services/ticketService';

interface AttendeeScreenProps {
  eventId: string;
  eventTitle: string;
  authToken: string;
  onBack: () => void;
}

export default function AttendeeScreen({
  eventId,
  eventTitle,
  authToken,
  onBack,
}: AttendeeScreenProps) {
  const [attendees, setAttendees] = useState<Ticket[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadAttendees();
  }, [eventId]);

  const loadAttendees = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchEventAttendees(eventId, authToken);
      setAttendees(data);
    } catch (err: any) {
      // Show the real failure instead of placeholder attendees, so staff never
      // check people in against a list that is not the event's.
      setAttendees([]);
      setLoadError(err.message || 'Could not load attendees.');
    } finally {
      setLoading(false);
    }
  };

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleManualCheckIn = async (ticket: Ticket) => {
    const key = String(ticket.id);
    if (!ticket.qr_token) {
      notify('Check-In Failed', 'This ticket has no admission token.');
      return;
    }
    setActionLoading(key);
    try {
      const updated = await checkInTicket(ticket.qr_token, authToken, eventId, ticket.id);
      setAttendees((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, ...updated } : t))
      );
      notify('Check-In Success', `Checked in ${ticket.attendee_name || ticket.identifier}`);
    } catch (err: any) {
      // Keep the list as the server has it; e.g. 409 "already checked in".
      notify('Check-In Failed', err.message || 'Check-in failed');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredAttendees = attendees.filter((t) => {
    const query = searchQuery.toLowerCase();
    const nameMatch = t.attendee_name?.toLowerCase().includes(query) ?? false;
    const emailMatch = t.attendee_email?.toLowerCase().includes(query) ?? false;
    const idMatch = t.identifier.toLowerCase().includes(query);
    return nameMatch || emailMatch || idMatch;
  });

  const renderBadge = (status: Ticket['status']) => {
    const badgeStyles = {
      valid: styles.badgeValid,
      checked_in: styles.badgeUsed,
      cancelled: styles.badgeCancelled,
      refunded: styles.badgeCancelled,
    };
    return (
      <View style={[styles.badge, badgeStyles[status] || styles.badgeUsed]}>
        <Text style={styles.badgeText}>{status.replace('_', ' ').toUpperCase()}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {eventTitle}
        </Text>
      </View>

      <Text style={styles.subtitle}>Attendee Management</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by name, email, or ticket ID..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredAttendees}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {loadError || `No attendees found matching "${searchQuery}"`}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.name}>{item.attendee_name || 'Anonymous Guest'}</Text>
                <Text style={styles.email}>{item.attendee_email || item.identifier}</Text>
                <Text style={styles.ticketType}>
                  {item.order_item?.ticket_type?.name || 'Ticket'} • ID: {item.identifier}
                </Text>
              </View>

              <View style={styles.actionColumn}>
                {renderBadge(item.status)}
                {item.status === 'valid' && (
                  <TouchableOpacity
                    style={styles.checkInBtn}
                    onPress={() => handleManualCheckIn(item)}
                    disabled={actionLoading === String(item.id)}
                  >
                    {actionLoading === String(item.id) ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.checkInBtnText}>Check In</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', paddingTop: 50 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backButton: { marginRight: 15 },
  backText: { fontSize: 16, color: '#007AFF', fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: 'bold', flex: 1 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 15 },
  searchInput: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 15,
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cardInfo: { flex: 1, marginRight: 10 },
  name: { fontSize: 16, fontWeight: 'bold' },
  email: { color: '#555', fontSize: 13, marginTop: 2 },
  ticketType: { color: '#888', fontSize: 12, marginTop: 4 },
  actionColumn: { alignItems: 'flex-end', justifyContent: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6 },
  badgeValid: { backgroundColor: '#d4edda' },
  badgeUsed: { backgroundColor: '#e2e3e5' },
  badgeCancelled: { backgroundColor: '#f8d7da' },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  checkInBtn: { backgroundColor: '#28a745', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  checkInBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 30 },
});
