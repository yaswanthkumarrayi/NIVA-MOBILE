/**
 * Available Deliveries Tab
 *
 * Layout:
 *   - Stats bar: available / today count / today earned
 *   - Section tabs: NIVA Foods | NIVA Deliveries
 *   - Order cards with "Details" (bottom-sheet) + "Take Order" (accept)
 *   - Details opens the shared <OrderDetailSheet> — the SAME bottom-to-top
 *     Active-style sheet (src/components/OrderDetailSheet.tsx). Opening it has
 *     NO side effects: the order stays AVAILABLE until the partner explicitly
 *     presses "Accept Order" (Take Order) inside the sheet or on the card.
 *
 * Sound behaviour:
 *   - New order FCM/realtime → alertManager.startAlert()
 *   - Partner accepts → alertManager.stopAlert(id, 'accepted') BEFORE any fetch
 *   - Other partner claims → alertManager.handleOrderUnavailable() on realtime UPDATE
 *     AND alertManager.syncWithOrders() on every fetchOrders result (belt-and-suspenders)
 *   - Polling every 10s syncs any alerts the realtime path missed
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, RefreshControl, ActivityIndicator,
  StyleSheet, TouchableOpacity, Alert, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { partnerApi } from '@niva/shared';
import { subscribeToOrders, unsubscribeAll } from '@niva/shared';
import { alertManager } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import type { Order } from '@niva/shared';
import { usePartnerStore } from '../../src/services/partnerStore';
import {
  OrderDetailSheet, parseItems, partnerEarning, callNumber, fmtTime, orderLabel,
} from '../../src/components/OrderDetailSheet';

type Section = 'niva_foods' | 'niva_deliveries';

// ─── Order Card ───────────────────────────────────────────────────────────────

interface CardProps {
  order: Order;
  onDetails: () => void;
  onAccept: () => void;
  accepting: boolean;
}

function OrderCard({ order, onDetails, onAccept, accepting }: CardProps) {
  const items = parseItems(order.items);
  const earning = partnerEarning(order);
  const isNivaFoods = !!order.restaurant_id;
  const pkts = order.number_of_packets ?? items.length ?? 1;

  return (
    <View style={c.card}>
      <View style={c.topRow}>
        <Text style={c.orderNum}>#{orderLabel(order)}</Text>
        <Text style={c.earning}>+₹{earning}</Text>
      </View>

      <View style={c.restaurantRow}>
        <View style={c.restaurantIcon}>
          <Ionicons name="storefront" size={15} color={NIVA_COLORS.gray600} />
        </View>
        <Text style={c.restaurantName} numberOfLines={1}>
          {order.vendor_name ?? (isNivaFoods ? 'NIVA Foods Restaurant' : 'Vendor')}
        </Text>
        {order.restaurant_phone && (
          <TouchableOpacity style={c.callBtn} onPress={() => callNumber(order.restaurant_phone)}>
            <Ionicons name="call-outline" size={12} color={NIVA_COLORS.gray600} />
            <Text style={c.callBtnText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={c.customerRow}>
        <Ionicons name="person-outline" size={13} color={NIVA_COLORS.gray400} />
        <Text style={c.customerName}>{order.customer_name}</Text>
      </View>

      {(order.hostel_name || order.room_number) && (
        <View style={c.addressRow}>
          <Ionicons name="location-outline" size={13} color={NIVA_COLORS.gray400} />
          <Text style={c.addressText}>
            {[order.hostel_name, order.room_number ? `Room ${order.room_number}` : null]
              .filter(Boolean).join(' · ')}
          </Text>
        </View>
      )}

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

      <Text style={c.timeText}>{fmtTime(order.placed_at ?? order.created_at)}</Text>

      <View style={c.actionsRow}>
        <TouchableOpacity style={c.detailsBtn} onPress={onDetails}>
          <Text style={c.detailsBtnText}>Details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[c.takeBtn, accepting && c.takeBtnDisabled]}
          onPress={onAccept}
          disabled={accepting}
        >
          {accepting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={c.takeBtnText}>Take Order</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AvailableScreen() {
  const { session, partner } = usePartnerStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<Section>('niva_foods');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const appStateRef = useRef(AppState.currentState);
  const fetchingRef = useRef(false);
  const sessionRef = useRef(session);
  const isOnlineRef = useRef(partner?.is_online ?? false);
  const partnerLoadedRef = useRef(partner !== null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks order IDs from the previous fetch so syncWithOrders can detect
  // orders that disappeared (taken by another partner) even when the JS
  // alertManager map has no entry (background FCM case).
  const prevOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => {
    isOnlineRef.current = partner?.is_online ?? false;
    if (partner !== null) partnerLoadedRef.current = true;
  }, [partner]);

  const openDetail = useCallback((order: Order) => {
    setDetailOrder(order);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOrder(null);
  }, []);

  const fetchOrders = useCallback(async (silent = false) => {
    if (fetchingRef.current) return;
    const cur = sessionRef.current;
    if (!cur) { if (!silent) setLoading(false); return; }
    if (partnerLoadedRef.current && !isOnlineRef.current) {
      setOrders([]); if (!silent) setLoading(false); return;
    }
    if (!partnerLoadedRef.current) { if (!silent) setLoading(false); return; }
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const res = await partnerApi.getAvailableOrders(cur.token);
      const fetched = res.orders || [];
      setOrders(fetched);

      // Stop siren for any order that is no longer available (taken by someone else
      // or no longer placed). Pass previous IDs so background-FCM-started sirens
      // (not tracked in JS alertManager map) are also stopped.
      alertManager.syncWithOrders(fetched, prevOrderIdsRef.current);

      // Update previous order IDs for the next fetch comparison
      prevOrderIdsRef.current = new Set(fetched.map(o => o.id));

      // Keep detail sheet in sync — update order data if still available,
      // close sheet if order was taken by another partner
      setDetailOrder(prev => {
        if (!prev) return null;
        const still = fetched.find(o => o.id === prev.id);
        return still ?? null; // close sheet if order disappeared
      });
    } catch { /* non-fatal */ }
    finally { fetchingRef.current = false; setLoading(false); setRefreshing(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchOrders(true);
    }, 1200);
  }, [fetchOrders]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => () => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
  }, []);

  // Online status change
  const prevIsOnline = useRef(partner?.is_online);
  useEffect(() => {
    if (prevIsOnline.current !== partner?.is_online) {
      prevIsOnline.current = partner?.is_online;
      fetchOrders(true);
    }
  }, [partner?.is_online, fetchOrders]);

  // Partner hydration
  const prevLoaded = useRef(partner !== null);
  useEffect(() => {
    if (!prevLoaded.current && partner !== null) { prevLoaded.current = true; fetchOrders(true); }
  }, [partner, fetchOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!session || !partner?.id) return;
    subscribeToOrders(
      `partner-avail-${partner.id}`,
      // INSERT — new order
      () => { scheduleRefetch(); },
      // UPDATE — order changed (accepted by someone else, status changed, etc.)
      (payload) => {
        const u = payload.new as Partial<Order>;
        // If another partner claimed this order, stop its siren immediately
        // (don't wait for the coalesced refetch).
        if (u.id && u.status && u.status !== 'placed') {
          alertManager.handleOrderUnavailable(u.id);
        }
        if (u.id && u.assigned_partner_id && u.assigned_partner_id !== partner.id) {
          alertManager.handleOrderUnavailable(u.id);
        }
        scheduleRefetch();
      }
    );
    return () => { unsubscribeAll(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, partner?.id]);

  // Foreground recovery
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/background|inactive/) && next === 'active') {
        fetchOrders(true); alertManager.pruneStale();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [fetchOrders]);

  // Safety polling every 10s — syncs alerts and data when realtime/FCM are unavailable
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => fetchOrders(true), 10000);
    return () => clearInterval(id);
  }, [session, fetchOrders]);

  const handleAccept = useCallback(async (orderId: string) => {
    if (!session || acceptingId) return;

    // Stop the siren IMMEDIATELY before the API call — don't wait for the
    // network round-trip. This is what makes the sound feel instant.
    alertManager.stopAlert(orderId, 'accepted');

    setAcceptingId(orderId);
    // Optimistically remove from list so the card disappears at once
    setOrders(prev => prev.filter(o => o.id !== orderId));
    closeDetail();

    try {
      await partnerApi.acceptOrder(orderId, session.token);
      // Order accepted — stay on the Available screen. The card has already
      // been removed optimistically and the siren stopped above.
      // The Active tab will pick up the new order on its next fetch/poll.
      setAcceptingId(null);
    } catch (e: any) {
      const code = e?.data?.error_code ?? e?.data?.code;
      if (code === 'ORDER_ALREADY_CLAIMED') {
        Alert.alert('Already Taken', 'This order was taken by another partner.');
        alertManager.handleOrderUnavailable(orderId);
      } else {
        const msg = e?.data?.message ?? e?.message ?? 'Failed to accept order. Please try again.';
        Alert.alert('Error', msg);
        // Re-add order back if accept failed (restore optimistic removal)
        // Also restart the siren so the partner can retry
        alertManager.startAlert(orderId, '', 'partner_new_delivery');
        fetchOrders(true);
      }
      setAcceptingId(null);
    }
  }, [session, acceptingId, closeDetail, fetchOrders]);

  // Section counts
  const nivaFoodsOrders = orders.filter(o => !!o.restaurant_id && o.delivery_type === 'room');
  const nivaDelOrders   = orders.filter(o => !o.restaurant_id  && o.delivery_type === 'room');
  const filtered = section === 'niva_foods' ? nivaFoodsOrders : nivaDelOrders;
  const isOnline = partner?.is_online ?? false;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter(o =>
    (o.placed_at ?? o.created_at ?? '').startsWith(todayStr)
  ).length;
  const todayEarned = orders
    .filter(o => (o.placed_at ?? o.created_at ?? '').startsWith(todayStr))
    .reduce((s, o) => s + partnerEarning(o), 0);

  return (
    <View style={st.container}>
      {/* Stats bar */}
      <View style={st.statsBar}>
        <View style={st.statItem}>
          <Text style={st.statValue}>{orders.length}</Text>
          <Text style={st.statLabel}>Available</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={st.statValue}>{todayOrders}</Text>
          <Text style={st.statLabel}>Today</Text>
        </View>
        <View style={st.statDivider} />
        <View style={st.statItem}>
          <Text style={st.statValue}>₹{todayEarned.toFixed(0)}</Text>
          <Text style={st.statLabel}>Earned</Text>
        </View>
      </View>

      {/* Section tabs */}
      <View style={st.tabBar}>
        {(['niva_foods', 'niva_deliveries'] as Section[]).map(sec => {
          const count = sec === 'niva_foods' ? nivaFoodsOrders.length : nivaDelOrders.length;
          const active = section === sec;
          return (
            <TouchableOpacity
              key={sec}
              style={[st.tab, active && st.tabActive]}
              onPress={() => setSection(sec)}
            >
              <Text style={[st.tabText, active && st.tabTextActive]}>
                {sec === 'niva_foods' ? 'NIVA Foods' : 'NIVA Deliveries'}
              </Text>
              {count > 0 && (
                <View style={[st.badge, active ? st.badgeActive : st.badgeInactive]}>
                  <Text style={st.badgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {!isOnline ? (
        <View style={st.center}>
          <Text style={st.stateTitle}>You are offline</Text>
          <Text style={st.stateSub}>Use the toggle in the header to go online.</Text>
        </View>
      ) : loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={NIVA_COLORS.orange} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={st.center}>
          <Text style={st.stateTitle}>No available deliveries</Text>
          <Text style={st.stateSub}>New eligible orders will appear here automatically.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onDetails={() => openDetail(item)}
              onAccept={() => handleAccept(item.id)}
              accepting={acceptingId === item.id}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchOrders(); }}
              tintColor={NIVA_COLORS.orange}
            />
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        />
      )}

      {/* Detail sheet — the SAME shared Active-style bottom sheet. Rendered
           conditionally so the slide-up animation always fires reliably.
           Opening it does NOT accept the order; the "Accept Order" button
           inside only fires when explicitly pressed. */}
      {detailOrder && (
        <OrderDetailSheet
          order={detailOrder}
          onClose={closeDetail}
          primaryAction={detailOrder.status === 'placed' ? {
            label: 'Accept Order',
            color: NIVA_COLORS.black,
            busy: acceptingId === detailOrder.id,
            onPress: () => handleAccept(detailOrder.id),
          } : null}
        />
      )}
    </View>
  );
}

// ─── Card styles ──────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  card: {
    backgroundColor: NIVA_COLORS.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  orderNum: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray400, letterSpacing: 0.5 },
  earning: { fontSize: 15, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  restaurantRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: NIVA_COLORS.gray50, borderRadius: 10, padding: 8, marginBottom: 8, gap: 8 },
  restaurantIcon: { width: 28, height: 28, borderRadius: 6, backgroundColor: NIVA_COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  restaurantName: { flex: 1, fontSize: 13, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray800 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: NIVA_COLORS.gray300, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  callBtnText: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray600 },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  customerName: { fontSize: 14, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  addressText: { fontSize: 13, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Regular' },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
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
  takeBtn: {
    flex: 2, backgroundColor: NIVA_COLORS.black,
    borderRadius: 12, paddingVertical: 11, alignItems: 'center',
  },
  takeBtnDisabled: { opacity: 0.5 },
  takeBtnText: { fontSize: 13, fontFamily: 'Montserrat-Bold', color: '#fff' },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  statsBar: {
    flexDirection: 'row', backgroundColor: NIVA_COLORS.white,
    paddingVertical: 12, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  statLabel: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: NIVA_COLORS.gray100, marginVertical: 4 },
  tabBar: {
    flexDirection: 'row', backgroundColor: NIVA_COLORS.white,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6,
  },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: NIVA_COLORS.black },
  tabText: { fontSize: 13, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Medium' },
  tabTextActive: { color: NIVA_COLORS.black, fontFamily: 'Montserrat-Bold' },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 22, alignItems: 'center' },
  badgeActive: { backgroundColor: NIVA_COLORS.black },
  badgeInactive: { backgroundColor: NIVA_COLORS.gray200 },
  badgeText: { color: NIVA_COLORS.white, fontSize: 11, fontFamily: 'Montserrat-Bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  stateTitle: { fontSize: 17, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray700 },
  stateSub: { fontSize: 13, color: NIVA_COLORS.gray400, textAlign: 'center', marginTop: 6 },
});
