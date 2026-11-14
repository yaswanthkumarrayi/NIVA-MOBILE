/**
 * Notifications / Alert History Tab
 * Shows recent order notifications for this restaurant.
 */
import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { NIVA_COLORS, ORDER_STATUS_LABELS } from '@niva/shared';
import { useNotificationHistory } from '../../src/hooks/useNotificationHistory';
import { StatusBadge } from '../../src/components/StatusBadge';

export default function NotificationsScreen() {
  const { notifications, clearAll } = useNotificationHistory();

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Recent Alerts</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={clearAll}>
            <Text style={s.clearAll}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🔔</Text>
          <Text style={s.emptyText}>No recent notifications</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          renderItem={({ item: n }) => (
            <TouchableOpacity
              style={s.item}
              onPress={() => router.push(`/order/${n.orderId}`)}
            >
              <View style={s.itemLeft}>
                <Text style={s.itemTitle}>{n.title}</Text>
                <Text style={s.itemBody}>{n.body}</Text>
                <Text style={s.itemTime}>{formatTime(n.receivedAt)}</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: NIVA_COLORS.white, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  title: { fontSize: 17, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  clearAll: { fontSize: 14, color: NIVA_COLORS.orange, fontFamily: 'Montserrat-SemiBold' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Medium' },
  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: NIVA_COLORS.white,
    borderRadius: 14, padding: 14, marginBottom: 8, elevation: 1,
  },
  itemLeft: { flex: 1 },
  itemTitle: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  itemBody: { fontSize: 13, color: NIVA_COLORS.gray600, marginTop: 2 },
  itemTime: { fontSize: 12, color: NIVA_COLORS.gray400, marginTop: 4 },
  chevron: { fontSize: 20, color: NIVA_COLORS.gray300, marginLeft: 8 },
});
