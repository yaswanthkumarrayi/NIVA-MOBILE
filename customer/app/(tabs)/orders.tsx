/**
 * NIVA — Orders Screen
 * Shows the authenticated customer's order history and live tracking.
 * Requires login.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../../src/theme';
import { useCustomerStore } from '../../src/services/customerStore';
import { StatusBadge } from '../../src/components/ui/Badge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ORDER_STATUS_LABELS } from '@niva/shared';
import { ordersApi } from '../../src/services/nivaApi';

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseItems(items: any): Array<{ name: string; quantity: number; price: number }> {
  if (Array.isArray(items)) return items;
  try { return JSON.parse(items); } catch { return []; }
}

export default function OrdersScreen() {
  const { session, authState } = useCustomerStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!session) return;
    if (!silent) setLoading(true);
    try {
      const res = await ordersApi.getMyOrders(session.customer.id, session.token);
      if (res.success) setOrders((res as any).data ?? []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  useEffect(() => {
    if (authState === 'unauthenticated') return;
    load();
  }, [load, authState]);

  // Not logged in
  if (authState !== 'loading' && !session) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}><Text style={s.headerTitle}>Orders</Text></View>
        <EmptyState
          icon="receipt-outline"
          title="Sign in to view orders"
          subtitle="Your order history will appear here after you sign in."
          action={{ label: 'Sign In', onPress: () => router.push('/(auth)/login') }}
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}><Text style={s.headerTitle}>Orders</Text></View>
        <View style={s.loadingWrap}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>Orders</Text></View>

      {orders.length === 0 ? (
        <EmptyState
          icon="bag-outline"
          title="No orders yet"
          subtitle="Browse restaurants and place your first order!"
          action={{ label: 'Explore Restaurants', onPress: () => router.push('/(tabs)') }}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={s.list}
        />
      )}
    </SafeAreaView>
  );
}

function OrderCard({ order }: { order: any }) {
  const items = parseItems(order.items);
  const isActive = !['delivered', 'cancelled'].includes(order.status);

  return (
    <TouchableOpacity style={s.card} onPress={() => router.push(`/order/${order.id}`)}>
      <View style={s.cardTop}>
        <View style={s.orderNum}>
          <Text style={s.orderNumText}>#{order.order_number || order.id.slice(0, 8).toUpperCase()}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      {/* Items summary */}
      <Text style={s.itemsSummary} numberOfLines={2}>
        {items.slice(0, 3).map((i: any) => `${i.name} ×${i.quantity}`).join(', ')}
        {items.length > 3 ? ` +${items.length - 3} more` : ''}
      </Text>

      <View style={s.cardBottom}>
        <Text style={s.amount}>₹{order.total_amount?.toFixed(0)}</Text>
        <Text style={s.date}>{formatDate(order.created_at || order.placed_at)}</Text>
      </View>

      {isActive && (
        <View style={s.trackBanner}>
          <Ionicons name="location" size={13} color={theme.colors.primary} />
          <Text style={s.trackText}>Tap to track live</Text>
          <Ionicons name="chevron-forward" size={13} color={theme.colors.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: 14 },
  headerTitle: { fontFamily: theme.fonts.bold, fontSize: 22, color: theme.colors.textPrimary },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: theme.spacing.lg, gap: 12, paddingBottom: 80 },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    padding: theme.spacing.lg, ...theme.shadows.card,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNum: {},
  orderNumText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  itemsSummary: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  date: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textMuted },
  trackBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  trackText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.primary, flex: 1 },
});
