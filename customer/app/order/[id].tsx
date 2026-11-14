/**
 * NIVA — Order Detail & Live Tracking Screen
 *
 * Shows order details and subscribes to Supabase Realtime for live status.
 * Order is fetched from the customer orders list (no single-order endpoint).
 * Partner phone is revealed as soon as a partner is assigned.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { theme } from '../../src/theme';
import { useCustomerStore } from '../../src/services/customerStore';
import { StatusBadge } from '../../src/components/ui/Badge';
import { ordersApi } from '../../src/services/nivaApi';
import { subscribeToOrders, unsubscribeAll, ORDER_STATUS_LABELS } from '@niva/shared';

function parseItems(items: any): Array<{ name: string; quantity: number; price: number }> {
  if (Array.isArray(items)) return items;
  try { return JSON.parse(items); } catch { return []; }
}

function formatDate(ds?: string) {
  if (!ds) return '';
  return new Date(ds).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_STEPS = ['placed', 'taken', 'prepared', 'arrived_at_campus', 'out_for_delivery', 'delivered'];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, customer } = useCustomerStore();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    if (!session || !customer) return;
    try {
      const res = await ordersApi.getMyOrders(customer.id, session.token);
      if (res.success) {
        const found = (res.data ?? []).find((o: any) => o.id === id);
        if (found) setOrder(found);
        else setError('Order not found.');
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load order.');
    } finally { setLoading(false); }
  }, [session, customer, id]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  // Subscribe to real-time order status updates
  useEffect(() => {
    if (!id) return;
    const channel = subscribeToOrders(
      `customer-order-${id}`,
      () => {}, // INSERT — not needed here
      (payload) => {
        if (payload.new && (payload.new as any).id === id) {
          setOrder((prev: any) => ({ ...prev, ...(payload.new as any) }));
        }
      },
    );
    return () => { unsubscribeAll(); };
  }, [id]);

  if (!session) {
    router.replace('/(auth)/login');
    return null;
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle}>Order Details</Text>
        </View>
        <View style={s.loadingWrap}><ActivityIndicator color={theme.colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle}>Order Details</Text>
        </View>
        <View style={s.loadingWrap}>
          <Text style={s.errorText}>{error ?? 'Order not found'}</Text>
          <TouchableOpacity onPress={loadOrder} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const items = parseItems(order.items);
  const statusIdx = STATUS_STEPS.indexOf(order.status);
  const isActive = !['delivered', 'cancelled'].includes(order.status);
  const orderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.navInfo}>
          <Text style={s.navTitle}>#{orderNum}</Text>
          <Text style={s.navSub}>{formatDate(order.created_at || order.placed_at)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Status card */}
        <View style={s.statusCard}>
          <View style={s.statusTop}>
            <StatusBadge status={order.status} />
            {isActive && (
              <View style={s.liveIndicator}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>Live</Text>
              </View>
            )}
          </View>
          <Text style={s.statusDisplay}>{order.status_display ?? ORDER_STATUS_LABELS[order.status] ?? order.status}</Text>

          {/* Progress stepper */}
          {order.status !== 'cancelled' && (
            <View style={s.stepper}>
              {STATUS_STEPS.map((step, i) => (
                <React.Fragment key={step}>
                  <View style={s.stepWrap}>
                    <View style={[s.stepCircle, i <= statusIdx && s.stepCircleActive, i === statusIdx && s.stepCircleCurrent]}>
                      {i < statusIdx ? (
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      ) : i === statusIdx ? (
                        <View style={s.stepDotInner} />
                      ) : null}
                    </View>
                    <Text style={[s.stepLabel, i <= statusIdx && s.stepLabelActive]} numberOfLines={2}>
                      {ORDER_STATUS_LABELS[step]?.replace(/ /g, '\n') ?? step}
                    </Text>
                  </View>
                  {i < STATUS_STEPS.length - 1 && (
                    <View style={[s.stepLine, i < statusIdx && s.stepLineActive]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          )}
        </View>

        {/* Partner info */}
        {order.partner_name && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Delivery Partner</Text>
            <View style={s.partnerRow}>
              <View style={s.partnerAvatar}>
                <Text style={s.partnerAvatarText}>{order.partner_name[0]}</Text>
              </View>
              <View style={s.partnerInfo}>
                <Text style={s.partnerName}>{order.partner_name}</Text>
                {order.partner_phone && (
                  <Text style={s.partnerPhone}>{order.partner_phone}</Text>
                )}
              </View>
              {order.partner_phone && (
                <TouchableOpacity
                  style={s.callBtn}
                  onPress={() => Linking.openURL(`tel:${order.partner_phone}`)}
                >
                  <Ionicons name="call" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Delivery address */}
        {(order.hostel_name || order.delivery_block) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Delivery Location</Text>
            <View style={s.addrRow}>
              <Ionicons name="location" size={16} color={theme.colors.primary} />
              <Text style={s.addrText}>
                {order.hostel_name ? `${order.hostel_name}, Room ${order.room_number}` : order.delivery_block}
              </Text>
            </View>
          </View>
        )}

        {/* Items */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Order Items</Text>
          {items.map((item: any, i: number) => (
            <View key={i} style={s.itemRow}>
              <Text style={s.itemQty}>{item.quantity}×</Text>
              <Text style={s.itemName}>{item.name}</Text>
              <Text style={s.itemPrice}>₹{item.price * item.quantity}</Text>
            </View>
          ))}
        </View>

        {/* Bill */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Payment Summary</Text>
          <View style={s.billRow}>
            <Text style={s.billLabel}>Food amount</Text>
            <Text style={s.billValue}>₹{order.food_amount ?? order.total_amount}</Text>
          </View>
          {order.room_delivery_charge > 0 && (
            <View style={s.billRow}>
              <Text style={s.billLabel}>Delivery fee</Text>
              <Text style={s.billValue}>₹{order.room_delivery_charge}</Text>
            </View>
          )}
          {order.block_delivery_charge > 0 && (
            <View style={s.billRow}>
              <Text style={s.billLabel}>Block delivery</Text>
              <Text style={s.billValue}>₹{order.block_delivery_charge}</Text>
            </View>
          )}
          <View style={[s.billRow, s.totalRow]}>
            <Text style={s.totalLabel}>Total paid</Text>
            <Text style={s.totalValue}>₹{order.total_amount}</Text>
          </View>
          <View style={s.billRow}>
            <Text style={s.billLabel}>Payment</Text>
            <Text style={s.billValue}>{order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online'}</Text>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: 10, gap: 10 },
  backBtn: { padding: 6 },
  navInfo: { flex: 1 },
  navTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textPrimary },
  navSub: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { ...theme.typography.bodyMuted },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.sm },
  retryText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.primary },
  scroll: { paddingHorizontal: theme.spacing.lg, gap: 12, paddingTop: 8 },
  statusCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg, ...theme.shadows.card },
  statusTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  liveText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.success },
  statusDisplay: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.xl, color: theme.colors.textPrimary, marginBottom: 16 },
  stepper: { flexDirection: 'row', alignItems: 'flex-start' },
  stepWrap: { flex: 1, alignItems: 'center', gap: 4 },
  stepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { backgroundColor: theme.colors.primary },
  stepCircleCurrent: { backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.primaryDark },
  stepDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  stepLine: { flex: 1, height: 2, backgroundColor: theme.colors.border, marginTop: 11 },
  stepLineActive: { backgroundColor: theme.colors.primary },
  stepLabel: { fontFamily: theme.fonts.regular, fontSize: 9, color: theme.colors.textMuted, textAlign: 'center' },
  stepLabelActive: { color: theme.colors.primary, fontFamily: theme.fonts.medium },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg, ...theme.shadows.card },
  cardTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary, marginBottom: 12 },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  partnerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  partnerAvatarText: { fontFamily: theme.fonts.bold, fontSize: 18, color: '#fff' },
  partnerInfo: { flex: 1 },
  partnerName: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  partnerPhone: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 2 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.success, alignItems: 'center', justifyContent: 'center' },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addrText: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  itemQty: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textMuted, width: 28 },
  itemName: { flex: 1, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  itemPrice: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  billLabel: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  billValue: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  totalRow: { paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 4 },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  totalValue: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.primary },
});
