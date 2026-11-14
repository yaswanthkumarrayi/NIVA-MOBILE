/**
 * Orders Tab
 *
 * "View Details" opens an inline bottom sheet instead of navigating
 * to a separate screen, matching the web portal behaviour.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, RefreshControl, ActivityIndicator,
  StyleSheet, TouchableOpacity, AppState, Modal, ScrollView,
  Linking, Alert, Animated,
} from 'react-native';
import { restaurantApi } from '@niva/shared';
import { subscribeToOrders, unsubscribeAll } from '@niva/shared';
import { alertManager } from '@niva/shared';
import { NIVA_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_TYPE_LABELS } from '@niva/shared';
import type { Order, OrderItem } from '@niva/shared';
import { useRestaurantStore } from '../../src/services/restaurantStore';
import { OrderCard } from '../../src/components/OrderCard';
import { UpdateBanner } from '../../src/components/UpdateBanner';
import { OrderQrDisplay } from '../../src/components/OrderQrDisplay';

type Tab = 'new' | 'active' | 'history';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseItems(items: any): any[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try { return JSON.parse(items); } catch { return []; }
}

function restaurantEarning(order: Order): number {
  const fa = parseFloat(String(order.food_amount ?? 0));
  if (fa > 0) return fa;
  const items = parseItems(order.items);
  return items.reduce((s: number, it: any) =>
    s + (parseFloat(it.price || 0) * (parseInt(it.quantity) || 1)), 0);
}

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

async function callNumber(phone: string) {
  const num = phone.replace(/\D/g, '');
  if (!num) {
    Alert.alert('No number', 'No phone number available.');
    return;
  }
  // Skip canOpenURL — on Android it returns false for tel: unless the app
  // declares a <queries> intent in AndroidManifest.xml. Just openURL directly;
  // Android always supports tel: on real devices.
  Linking.openURL(`tel:${num}`).catch(() =>
    Alert.alert('Could not open dialler', 'Please dial ' + phone + ' manually.')
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const color = ORDER_STATUS_COLORS[status] ?? NIVA_COLORS.gray400;
  return (
    <View style={[sp.wrap, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <View style={[sp.dot, { backgroundColor: color }]} />
      <Text style={[sp.label, { color }]}>{ORDER_STATUS_LABELS[status] ?? status}</Text>
    </View>
  );
}
const sp = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontFamily: 'Montserrat-SemiBold' },
});

// ─── Timeline item ────────────────────────────────────────────────────────────

function TimelineRow({ label, time, done }: { label: string; time?: string | null; done: boolean }) {
  return (
    <View style={tl.row}>
      <View style={[tl.circle, done ? tl.circleDone : tl.circlePending]}>
        {done && <Text style={tl.check}>✓</Text>}
      </View>
      <View style={tl.content}>
        <Text style={[tl.label, done && tl.labelDone]}>{label}</Text>
        {time ? <Text style={tl.time}>{fmt(time)}</Text> : null}
      </View>
    </View>
  );
}
const tl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  circle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1 },
  circleDone: { backgroundColor: NIVA_COLORS.green },
  circlePending: { backgroundColor: NIVA_COLORS.gray200 },
  check: { color: '#fff', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  label: { fontSize: 13, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray400 },
  labelDone: { color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-SemiBold' },
  time: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 1 },
});

// ─── Contact row ──────────────────────────────────────────────────────────────

function ContactRow({ name, role, phone }: { name: string; role: string; phone?: string }) {
  return (
    <View style={ct.row}>
      <View style={ct.avatar}><Text style={ct.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
      <View style={ct.info}>
        <Text style={ct.name}>{name}</Text>
        <Text style={ct.role}>{role}</Text>
      </View>
      {phone ? (
        <TouchableOpacity style={ct.callBtn} onPress={() => callNumber(phone)}>
          <Text style={ct.callText}>📞 Call</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
const ct = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginBottom: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: NIVA_COLORS.gray200, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray600 },
  info: { flex: 1 },
  name: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900 },
  role: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 1 },
  callBtn: { borderWidth: 1, borderColor: NIVA_COLORS.gray300, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: NIVA_COLORS.white },
  callText: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },
});

// ─── Bottom sheet detail ──────────────────────────────────────────────────────

interface DetailSheetProps {
  order: Order | null;
  onClose: () => void;
  onRefresh: () => void;
  session: any;
}

function DetailSheet({ order, onClose, onRefresh, session }: DetailSheetProps) {
  const [updating, setUpdating] = useState(false);

  if (!order) return null;

  const items = parseItems(order.items);
  const earned = restaurantEarning(order);
  const isRoom = order.delivery_type === 'room';
  const isCod = order.payment_method === 'cod';
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? NIVA_COLORS.gray400;

  const nextAction = (): { status: string; label: string } | null => {
    if (order.status === 'placed')                     return { status: 'taken',            label: 'Accept Order' };
    if (order.status === 'taken' && isRoom)             return { status: 'prepared',          label: 'Mark Prepared' };
    if (order.status === 'prepared' && isRoom)          return { status: 'arrived_at_campus', label: 'Arrived at Campus' };
    if (order.status === 'taken' && !isRoom)            return { status: 'out_for_delivery',  label: 'Out for Delivery' };
    if (order.status === 'out_for_delivery' && !isRoom) return { status: 'delivered',         label: 'Mark Delivered' };
    return null;
  };

  const handleAction = async (targetStatus: string, label: string) => {
    if (!session) return;
    Alert.alert('Confirm', `${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm', onPress: async () => {
          setUpdating(true);
          try {
            await restaurantApi.updateOrderStatus(order.id, targetStatus, session.token);
            if (targetStatus === 'taken') alertManager.stopAlert(order.id, 'accepted');
            onRefresh();
          } catch (e: any) {
            Alert.alert('Error', e?.data?.message ?? 'Failed to update order.');
            if (targetStatus === 'taken') alertManager.handleOrderUnavailable(order.id);
          } finally { setUpdating(false); }
        },
      },
    ]);
  };

  const action = nextAction();

  const timelineSteps = [
    { label: 'Order Placed', time: order.placed_at, key: 'placed' },
    { label: 'Take Order', time: order.taken_at, key: 'taken' },
    { label: 'Prepared Order', time: order.prepared_at, key: 'prepared' },
    { label: 'Arrived at Campus', time: order.arrived_at_campus_at, key: 'arrived_at_campus' },
    { label: 'QR Scanned / Handed Over', time: order.qr_scanned_at, key: 'qr' },
    { label: 'Out for Delivery', time: order.out_for_delivery_at, key: 'out_for_delivery' },
    { label: 'Delivered', time: order.delivered_at, key: 'delivered' },
  ];
  const doneStatuses = ['placed', 'taken', 'prepared', 'arrived_at_campus', 'out_for_delivery', 'delivered'];
  const currentIdx = doneStatuses.indexOf(order.status);

  return (
    <View style={ds.wrapper}>
      {/* Handle */}
      <View style={ds.handle} />

      {/* Header */}
      <View style={ds.header}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={ds.title}>Order Details</Text>
            <StatusPill status={order.status} />
          </View>
          <Text style={ds.subTitle}>#{order.order_number}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={ds.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={ds.closeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

        {/* Customer */}
        <Text style={ds.sectionTitle}>CUSTOMER</Text>
        <View style={ds.infoCard}>
          <DetailRow label="Name" value={order.customer_name} />
          {order.customer_phone && <DetailRow label="Phone" value={order.customer_phone} link />}
          {order.hostel_name && <DetailRow label="Hostel" value={order.hostel_name} />}
          {order.room_number && <DetailRow label="Room" value={order.room_number} />}
        </View>

        {/* Delivery Partner */}
        {order.partner_name && (
          <>
            <Text style={ds.sectionTitle}>DELIVERY PARTNER</Text>
            <View style={ds.infoCard}>
              <DetailRow label="Name" value={order.partner_name} />
              {order.partner_phone && (
                <DetailRow label="Phone" value={order.partner_phone} link />
              )}
            </View>
          </>
        )}

        {/* Contacts */}
        {(order.partner_name || order.customer_phone) && (
          <View style={{ marginBottom: 12 }}>
            {order.partner_name && (
              <ContactRow
                name={order.partner_name}
                role="Delivery Partner"
                phone={order.partner_phone}
              />
            )}
            {order.customer_phone && (
              <ContactRow name={order.customer_name} role="Customer" phone={order.customer_phone} />
            )}
          </View>
        )}

        {/* Items */}
        <Text style={ds.sectionTitle}>ITEMS ({items.length})</Text>
        <View style={ds.infoCard}>
          {items.map((it: any, i: number) => (
            <View key={i} style={ds.itemRow}>
              <Text style={ds.itemName}>{it.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={ds.itemQty}>×{it.quantity || 1}</Text>
                {it.price > 0 && <Text style={ds.itemPrice}>₹{(it.price * (it.quantity || 1)).toFixed(0)}</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Order Info */}
        <Text style={ds.sectionTitle}>ORDER INFO</Text>
        <View style={ds.infoCard}>
          <DetailRow label="Order Time" value={fmt(order.placed_at ?? order.created_at)} />
          {order.delivery_slot && <DetailRow label="Slot" value={order.delivery_slot} />}
          <DetailRow label="Type" value={DELIVERY_TYPE_LABELS[order.delivery_type] ?? order.delivery_type} />
          <DetailRow label="Payment" value={isCod ? 'COD' : 'Prepaid'} colored={isCod ? '#C2410C' : '#15803D'} />
        </View>

        {/* Earnings */}
        {earned > 0 && (
          <>
            <Text style={ds.sectionTitle}>YOUR EARNINGS</Text>
            <View style={[ds.infoCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1 }]}>
              <View style={ds.itemRow}>
                <Text style={[ds.itemName, { color: '#166534' }]}>Restaurant Earned</Text>
                <Text style={[ds.itemPrice, { color: '#166534', fontSize: 16 }]}>₹{earned.toFixed(0)}</Text>
              </View>
            </View>
          </>
        )}

        {/* QR Code for room delivery handover — show whenever order is accepted */}
        {isRoom && session && order.status !== 'placed' && order.status !== 'cancelled' && (
          <>
            <Text style={ds.sectionTitle}>QR CODE — HANDOVER</Text>
            <OrderQrDisplay orderId={order.id} token={session.token} />
          </>
        )}

        {/* Timeline */}
        <Text style={ds.sectionTitle}>TIMELINE</Text>
        <View style={ds.infoCard}>
          {timelineSteps.map((step, i) => {
            const stepDoneIdx = doneStatuses.indexOf(step.key === 'qr' ? 'out_for_delivery' : step.key);
            const isDone = step.time != null || (step.key !== 'qr' && stepDoneIdx <= currentIdx && currentIdx >= 0);
            return (
              <TimelineRow
                key={step.key}
                label={step.label}
                time={step.time}
                done={isDone}
              />
            );
          })}
        </View>

      </ScrollView>

      {/* Action */}
      {(action || order.status === 'placed') && (
        <View style={ds.footer}>
          {action && (
            <TouchableOpacity
              style={[ds.actionBtn, updating && { opacity: 0.5 }]}
              onPress={() => handleAction(action.status, action.label)}
              disabled={updating}
            >
              {updating ? <ActivityIndicator color="#fff" /> : <Text style={ds.actionBtnText}>{action.label}</Text>}
            </TouchableOpacity>
          )}
          {order.status === 'placed' && (
            <TouchableOpacity
              style={ds.cancelBtn}
              onPress={() => handleAction('cancelled', 'Cancel this order')}
              disabled={updating}
            >
              <Text style={ds.cancelBtnText}>Cancel Order</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function DetailRow({ label, value, link, colored }: { label: string; value: string; link?: boolean; colored?: string }) {
  return (
    <View style={ds.detailRow}>
      <Text style={ds.detailLabel}>{label}</Text>
      {link ? (
        <TouchableOpacity onPress={() => callNumber(value)}>
          <Text style={[ds.detailValue, { color: '#2563EB', textDecorationLine: 'underline' }]}>{value}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[ds.detailValue, colored ? { color: colored, fontFamily: 'Montserrat-Bold' } : null]}>{value}</Text>
      )}
    </View>
  );
}

const ds = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: NIVA_COLORS.white },
  handle: { width: 40, height: 4, backgroundColor: NIVA_COLORS.gray200, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  title: { fontSize: 15, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  subTitle: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 2, fontFamily: 'Montserrat-Regular' },
  closeBtn: { padding: 4 },
  closeIcon: { fontSize: 16, color: NIVA_COLORS.gray400 },
  sectionTitle: {
    fontSize: 10, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray400,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 4,
  },
  infoCard: { backgroundColor: NIVA_COLORS.gray50, borderRadius: 12, padding: 12, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  detailLabel: { fontSize: 13, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Regular', flex: 1 },
  detailValue: { fontSize: 13, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-Medium', flex: 1, textAlign: 'right' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  itemName: { fontSize: 13, color: NIVA_COLORS.gray800, fontFamily: 'Montserrat-Regular', flex: 1 },
  itemQty: { fontSize: 12, color: NIVA_COLORS.gray400 },
  itemPrice: { fontSize: 13, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-SemiBold' },
  footer: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 10, borderTopWidth: 1, borderTopColor: NIVA_COLORS.gray100 },
  actionBtn: { backgroundColor: NIVA_COLORS.black, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 8 },
  actionBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Montserrat-Bold' },
  cancelBtn: { borderWidth: 1.5, borderColor: NIVA_COLORS.red, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: NIVA_COLORS.red, fontSize: 13, fontFamily: 'Montserrat-SemiBold' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const { session, updateInfo } = useRestaurantStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('new');
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  // Ref so fetchOrders always reads the current selectedOrder without needing
  // it in the dependency array (avoids re-creating the callback on every open/close).
  const selectedOrderRef = useRef<Order | null>(null);
  const setSelectedOrderWithRef = useCallback((order: Order | null) => {
    selectedOrderRef.current = order;
    setSelectedOrder(order);
  }, []);
  // Track which order IDs are mid-accept from the card button
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const appStateRef = useRef(AppState.currentState);
  // Coalesces bursts of realtime events into a single delayed fetch so we don't
  // hammer the API (the orders channel fires for every order change platform-wide).
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!session) return;
    if (!silent) setLoading(true);
    try {
      const res = await restaurantApi.getOrders(session.token);
      const fetched: Order[] = res.orders || [];
      setOrders(fetched);
      setError('');

      // Stop sirens for any order that is no longer 'placed'
      alertManager.syncWithOrders(fetched);
      // Start sirens for any order still in 'placed' (no-op if already active).
      // This makes polling a complete fallback path — even if realtime and FCM
      // both fail to deliver, a new placed order will start alerting on the next
      // fetch. The siren keeps playing until the restaurant accepts the order.
      alertManager.resumeAlertsForPlacedOrders(fetched);

      // Sync selected order if detail sheet is open — always use ref to avoid
      // stale closure. This makes the sheet update live after any action.
      const currentSelected = selectedOrderRef.current;
      if (currentSelected) {
        const updated = fetched.find(o => o.id === currentSelected.id);
        if (updated) {
          // Always sync — even if status didn't change (data may have other updates)
          setSelectedOrderWithRef(updated);
        } else {
          // Order disappeared (cancelled/removed) — close the sheet
          setSelectedOrderWithRef(null);
        }
      }
    } catch (e: any) {
      if (e?.status !== 401) setError('Could not load orders. Pull to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  /**
   * Schedule a single coalesced refetch. Many realtime events arriving in a
   * short window collapse into ONE network request ~1.2s later. This is what
   * prevents the "too many requests" (429) storms on busy order channels.
   */
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      fetchOrders(true);
    }, 1200);
  }, [fetchOrders]);

  // Clear any pending coalesced refetch on unmount
  useEffect(() => () => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
  }, []);

  // Realtime
  useEffect(() => {
    if (!session) return;
    const channel = subscribeToOrders(
      `restaurant-orders-${session.restaurant.id}`,
      (payload) => {
        const newOrder = payload.new as Partial<Order>;
        if (newOrder.restaurant_id === session.restaurant.id) {
          // New order arrived — start siren immediately (not coalesced),
          // but coalesce the actual data refetch.
          alertManager.startAlert(newOrder.id!, newOrder.order_number ?? newOrder.id!, 'restaurant_new_order');
          scheduleRefetch();
        }
      },
      (payload) => {
        const updated = payload.new as Partial<Order>;
        if (updated.restaurant_id === session.restaurant.id) {
          scheduleRefetch();
          // Order moved away from 'placed' — stop its siren
          if (updated.status !== 'placed' && updated.id) {
            alertManager.handleOrderUnavailable(updated.id);
          }
        }
      }
    );
    return () => { unsubscribeAll(); };
  }, [session, fetchOrders, scheduleRefetch]);

  // Foreground recovery — when app comes back from background/recently-used,
  // re-arm the siren for any placed orders that were never acknowledged.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/background|inactive/) && next === 'active') {
        fetchOrders(true).then(() => {
          // After fetch resolves, the latest orders are in state;
          // resume sirens for anything still placed.
          setOrders((current) => {
            alertManager.resumeAlertsForPlacedOrders(current);
            return current;
          });
          alertManager.pruneStale();
        });
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [fetchOrders]);

  // Safety polling every 10s — primary backstop when realtime/FCM are unavailable.
  // fetchOrders starts sirens for any placed order, so this guarantees an alert
  // within ~10s of an order being placed, regardless of realtime/push delivery.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => fetchOrders(true), 10000);
    return () => clearInterval(id);
  }, [session, fetchOrders]);

  const newOrders = orders.filter(o => o.status === 'placed');
  const activeOrders = orders.filter(o => ['taken', 'prepared', 'arrived_at_campus', 'out_for_delivery'].includes(o.status));
  const historyOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status)).slice(0, 50);
  const displayedOrders = activeTab === 'new' ? newOrders : activeTab === 'active' ? activeOrders : historyOrders;

  const handleViewDetails = (order: Order) => {
    setSelectedOrderWithRef(order);
  };

  /**
   * Accept an order directly from the list card (without opening details).
   * Stops the siren for that order on success.
   */
  const handleAcceptFromCard = useCallback(async (order: Order) => {
    if (!session) return;
    setAcceptingIds(prev => new Set(prev).add(order.id));
    try {
      await restaurantApi.updateOrderStatus(order.id, 'taken', session.token);
      alertManager.stopAlert(order.id, 'accepted');
      fetchOrders(true);
    } catch (e: any) {
      Alert.alert('Error', e?.data?.message ?? 'Failed to accept order. Please try again.');
    } finally {
      setAcceptingIds(prev => { const next = new Set(prev); next.delete(order.id); return next; });
    }
  }, [session, fetchOrders]);
  return (
    <View style={styles.container}>
      {updateInfo?.updateAvailable && !updateInfo.updateRequired && (
        <UpdateBanner downloadUrl={updateInfo.downloadUrl} />
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['new', 'active', 'history'] as Tab[]).map((tab) => {
          const count = tab === 'new' ? newOrders.length : tab === 'active' ? activeOrders.length : historyOrders.length;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'new' ? 'New' : tab === 'active' ? 'Active' : 'History'}
              </Text>
              {count > 0 && (
                <View style={[styles.badge, tab === 'new' && styles.badgeOrange]}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {!!error && (
        <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>
      )}

      {loading ? (
        <View style={styles.loader}><ActivityIndicator size="large" color={NIVA_COLORS.orange} /></View>
      ) : displayedOrders.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {activeTab === 'new' ? 'No new orders' : activeTab === 'active' ? 'No active orders' : 'No order history'}
          </Text>
          {activeTab === 'new' && <Text style={styles.emptySubtitle}>New orders will appear here automatically.</Text>}
        </View>
      ) : (
        <FlatList
          data={displayedOrders}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => handleViewDetails(item)}
              onAccept={item.status === 'placed' ? () => handleAcceptFromCard(item) : undefined}
              accepting={acceptingIds.has(item.id)}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} tintColor={NIVA_COLORS.orange} />}
          contentContainerStyle={{ padding: 12 }}
        />
      )}

      {/* Bottom sheet modal */}
      <Modal
        visible={!!selectedOrder}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setSelectedOrderWithRef(null)}
      >
        <DetailSheet
          order={selectedOrder}
          onClose={() => setSelectedOrderWithRef(null)}
          onRefresh={() => fetchOrders(true)}
          session={session}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  tabBar: { flexDirection: 'row', backgroundColor: NIVA_COLORS.white, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 6 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: NIVA_COLORS.orange },
  tabText: { fontSize: 14, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Medium' },
  tabTextActive: { color: NIVA_COLORS.orange, fontFamily: 'Montserrat-Bold' },
  badge: { backgroundColor: NIVA_COLORS.gray200, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeOrange: { backgroundColor: NIVA_COLORS.orange },
  badgeText: { color: NIVA_COLORS.white, fontSize: 11, fontWeight: '700' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray500 },
  emptySubtitle: { fontSize: 13, color: NIVA_COLORS.gray400, marginTop: 6, textAlign: 'center' },
  errorBanner: { backgroundColor: '#FEF2F2', paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { color: NIVA_COLORS.red, fontSize: 13, fontFamily: 'Montserrat-Medium' },
});
