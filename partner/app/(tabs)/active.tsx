/**
 * Active Deliveries Tab
 * Same card + bottom-sheet detail design as the available tab.
 * Shows in-progress orders assigned to this partner.
 *
 * The order-details bottom sheet is the shared <OrderDetailSheet> component
 * (src/components/OrderDetailSheet.tsx) — the single source of truth shared
 * with the Available tab. This screen only supplies the status-based primary
 * action (Scan QR / Out for Delivery / Delivered …).
 *
 * Action buttons per status:
 *   - NIVA Foods room: arrived_at_campus → "Scan QR" (purple)
 *                      out_for_delivery  → "Delivered" (green)
 *   - NIVA Deliveries: taken             → "Out for Delivery" (black)
 *                      out_for_delivery  → "Delivered" (green)
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, RefreshControl, ActivityIndicator,
  StyleSheet, TouchableOpacity, AppState, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { partnerApi } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import type { Order } from '@niva/shared';
import { usePartnerStore } from '../../src/services/partnerStore';
import {
  OrderDetailSheet, parseItems, partnerEarning, fmtTime, orderLabel,
} from '../../src/components/OrderDetailSheet';

// ─── Status label above card (matches screenshot) ────────────────────────────

function statusBarLabel(order: Order): { text: string; color: string } | null {
  const isNivaFoods = !!order.restaurant_id;
  if (order.status === 'arrived_at_campus') return { text: 'Scan QR to confirm handover', color: '#7C3AED' };
  if (order.status === 'out_for_delivery')  return { text: 'Delivering to room', color: '#16A34A' };
  if (order.status === 'taken' && isNivaFoods) return { text: 'Waiting for restaurant', color: NIVA_COLORS.amber };
  if (order.status === 'prepared') return { text: 'Restaurant is preparing', color: NIVA_COLORS.amber };
  return null;
}

// ─── Action button config per status ─────────────────────────────────────────

function getAction(order: Order): { label: string; status?: string; color: string; scanQr?: boolean } | null {
  const isNivaFoods = !!order.restaurant_id;
  switch (order.status) {
    case 'arrived_at_campus':
      return { label: 'Scan QR', color: '#7C3AED', scanQr: true };
    case 'out_for_delivery':
      return { label: 'Delivered', status: 'delivered', color: NIVA_COLORS.green };
    case 'taken':
      if (!isNivaFoods) return { label: 'Out for Delivery', status: 'out_for_delivery', color: NIVA_COLORS.black };
      return null; // waiting for restaurant, no partner action
    default:
      return null;
  }
}

// ─── Active Order Card ────────────────────────────────────────────────────────

interface CardProps {
  order: Order;
  onDetails: () => void;
  onAction: (order: Order) => void;
  updatingId: string | null;
}

function ActiveCard({ order, onDetails, onAction, updatingId }: CardProps) {
  const items = parseItems(order.items);
  const earning = partnerEarning(order);
  const pkts = order.number_of_packets ?? items.length ?? 1;
  const action = getAction(order);
  const bar = statusBarLabel(order);
  const isUpdating = updatingId === order.id;

  return (
    <View style={c.cardWrapper}>
      {/* Status bar above card */}
      {bar && (
        <View style={[c.statusBar, { borderLeftColor: bar.color }]}>
          <View style={[c.statusDot, { backgroundColor: bar.color }]} />
          <Text style={[c.statusBarText, { color: bar.color }]}>{bar.text}</Text>
          <Text style={c.statusBarEarning}>+₹{earning}</Text>
        </View>
      )}

      <View style={c.card}>
        {/* order number + earning */}
        <View style={c.topRow}>
          <Text style={c.orderNum}>#{orderLabel(order)}</Text>
          <Text style={c.earning}>+₹{earning}</Text>
        </View>

        {/* customer name */}
        <View style={c.infoRow}>
          <Ionicons name="person-outline" size={13} color={NIVA_COLORS.gray400} />
          <Text style={c.infoText}>{order.customer_name ?? '—'}</Text>
        </View>

        {/* hostel + room */}
        {(order.hostel_name || order.room_number) && (
          <View style={c.infoRow}>
            <Ionicons name="location-outline" size={13} color={NIVA_COLORS.gray400} />
            <Text style={c.infoText}>
              {[order.hostel_name, order.room_number ? `Room ${order.room_number}` : null]
                .filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {/* tags */}
        <View style={c.tagsRow}>
          <View style={c.tag}><Text style={c.tagText}>{pkts} pkt</Text></View>
          <View style={c.tag}><Text style={c.tagText}>{items.length} item{items.length !== 1 ? 's' : ''}</Text></View>
          <View style={[c.tag, c.tagGreen]}>
            <Text style={[c.tagText, c.tagTextGreen]}>
              {order.payment_method === 'cod' ? 'COD' : 'Prepaid'}
            </Text>
          </View>
          {order.delivery_slot && (
            <View style={c.tag}><Text style={c.tagText}>{order.delivery_slot}</Text></View>
          )}
        </View>

        <Text style={c.timeText}>Accepted {fmtTime(order.taken_at ?? order.created_at)}</Text>

        {/* action buttons */}
        <View style={c.actionsRow}>
          <TouchableOpacity style={c.detailsBtn} onPress={onDetails}>
            <Text style={c.detailsBtnText}>Details</Text>
          </TouchableOpacity>
          {action && (
            <TouchableOpacity
              style={[c.actionBtn, { backgroundColor: action.color }, isUpdating && c.btnDisabled]}
              onPress={() => onAction(order)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : action.scanQr ? (
                <View style={c.scanQrContent}>
                  <Ionicons name="qr-code-outline" size={15} color="#fff" />
                  <Text style={c.actionBtnText}>{action.label}</Text>
                </View>
              ) : (
                <Text style={c.actionBtnText}>{action.label}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ActiveScreen() {
  const { session, partner } = usePartnerStore();
  const { openOrderId } = useLocalSearchParams<{ openOrderId?: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const fetchingRef = useRef(false);
  const sessionRef = useRef(session);
  // Track whether we've already consumed the openOrderId param so we don't
  // reopen the sheet on every subsequent render.
  const openedParamRef = useRef<string | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const fetchActive = useCallback(async (silent = false) => {
    if (fetchingRef.current) return;
    const cur = sessionRef.current;
    if (!cur) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const res = await partnerApi.getMyOrders(cur.token, 'active');
      const fetched = res.orders || [];
      setOrders(fetched);
      // Keep detail sheet in sync
      setDetailOrder(prev => prev ? (fetched.find(o => o.id === prev.id) ?? null) : null);
    } catch { /* non-fatal */ }
    finally { fetchingRef.current = false; setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  // When navigated here from the QR scanner with an orderId param,
  // open that order's detail sheet as soon as the orders list is loaded.
  useEffect(() => {
    if (!openOrderId || openOrderId === openedParamRef.current) return;
    if (orders.length === 0) return; // wait for the first fetch to complete
    const target = orders.find(o => o.id === openOrderId);
    if (target) {
      openedParamRef.current = openOrderId; // consume — don't re-open
      setDetailOrder(target);
    }
  }, [openOrderId, orders]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/background|inactive/) && next === 'active') fetchActive(true);
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [fetchActive]);

  const handleAction = useCallback(async (order: Order) => {
    if (!session || updatingId) return;
    const action = getAction(order);
    if (!action) return;

    if (action.scanQr) {
      router.push('/(tabs)/scanner');
      return;
    }

    Alert.alert('Confirm', `${action.label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdatingId(order.id);
          try {
            await partnerApi.updateOrderStatus(order.id, action.status!, session.token);
            // If delivered, close sheet and remove from list
            if (action.status === 'delivered') {
              setDetailOrder(null);
              setOrders(prev => prev.filter(o => o.id !== order.id));
            } else {
              await fetchActive(true);
            }
          } catch (e: any) {
            Alert.alert('Error', e?.data?.message ?? 'Failed to update status. Please try again.');
          } finally { setUpdatingId(null); }
        },
      },
    ]);
  }, [session, updatingId, fetchActive]);

  if (loading) {
    return <View style={s.loader}><ActivityIndicator size="large" color={NIVA_COLORS.orange} /></View>;
  }

  // Build the status-based primary action for the shared detail sheet.
  const detailAction = detailOrder ? getAction(detailOrder) : null;

  return (
    <View style={s.container}>
      {orders.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyTitle}>No active deliveries</Text>
          <Text style={s.emptySubtitle}>Accepted orders will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <ActiveCard
              order={item}
              onDetails={() => setDetailOrder(item)}
              onAction={handleAction}
              updatingId={updatingId}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchActive(true); }}
              tintColor={NIVA_COLORS.orange}
            />
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        />
      )}

      {detailOrder && (
        <OrderDetailSheet
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          primaryAction={detailAction ? {
            label: detailAction.label,
            color: detailAction.color,
            icon: detailAction.scanQr ? 'qr-code-outline' : undefined,
            busy: updatingId === detailOrder.id,
            onPress: () => handleAction(detailOrder),
          } : null}
        />
      )}
    </View>
  );
}

// ─── Card styles ──────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  cardWrapper: { marginBottom: 10 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: NIVA_COLORS.white,
    borderLeftWidth: 3, borderTopLeftRadius: 12, borderTopRightRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBarText: { flex: 1, fontSize: 12, fontFamily: 'Montserrat-SemiBold' },
  statusBarEarning: { fontSize: 12, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray700 },
  card: {
    backgroundColor: NIVA_COLORS.white,
    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    padding: 14,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderNum: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray400, letterSpacing: 0.5 },
  earning: { fontSize: 15, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoText: { fontSize: 13, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray700, flex: 1 },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 6 },
  tag: { backgroundColor: NIVA_COLORS.gray100, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagGreen: { backgroundColor: '#ECFDF5' },
  tagText: { fontSize: 11, color: NIVA_COLORS.gray600, fontFamily: 'Montserrat-Medium' },
  tagTextGreen: { color: '#166534' },
  timeText: { fontSize: 11, color: NIVA_COLORS.gray400, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  detailsBtn: {
    flex: 1, borderWidth: 1.5, borderColor: NIVA_COLORS.gray200,
    borderRadius: 12, paddingVertical: 11, alignItems: 'center',
  },
  detailsBtnText: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },
  actionBtn: {
    flex: 2, borderRadius: 12, paddingVertical: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  scanQrContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtnText: { fontSize: 13, fontFamily: 'Montserrat-Bold', color: '#fff' },
  btnDisabled: { opacity: 0.5 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray700 },
  emptySubtitle: { fontSize: 13, color: NIVA_COLORS.gray400, textAlign: 'center', marginTop: 6 },
});
