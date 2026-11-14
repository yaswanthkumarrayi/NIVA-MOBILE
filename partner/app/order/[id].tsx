/**
 * Partner Order Detail Screen
 * Full delivery details + action buttons.
 * Respects existing NIVA business rules:
 *   - Room delivery: partner cannot mark out_for_delivery without QR scan
 *   - NIVA Deliveries: taken → out_for_delivery → delivered (no QR required)
 *
 * Auto-close behaviour:
 *   When the restaurant scans the QR on their end, the order flips to
 *   qr_handover_verified=true / status='out_for_delivery'. This screen polls
 *   every 4 seconds while the partner is waiting so it detects that change
 *   instantly, vibrates, and navigates back to the active list.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, RefreshControl, Vibration,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { partnerApi } from '@niva/shared';
import { alertManager } from '@niva/shared';
import { NIVA_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_TYPE_LABELS } from '@niva/shared';
import type { Order, OrderItem } from '@niva/shared';
import { usePartnerStore } from '../../src/services/partnerStore';

export default function PartnerOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, partner } = usePartnerStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  // Track previous qr_handover_verified so we can detect the flip
  const prevQrVerified = useRef<boolean | null>(null);
  // Poll interval ref — active only while waiting for QR handover
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against setState / navigation after the screen has unmounted
  // (e.g. a slow my-orders fetch that resolves after the user left the screen).
  // This is a real source of "ghost" navigation and state-update-after-unmount
  // warnings/crashes during the accept → refresh cycle (Bug 1 / Bug 2).
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!session || !id) return;
    setLoading(true);
    try {
      // Fetch from my-orders (already assigned) or available-orders
      const myRes = await partnerApi.getMyOrders(session.token);
      const found = myRes.orders.find(o => o.id === id);
      if (!isMountedRef.current) return;
      if (found) {
        setOrder(found);
      } else {
        // Try available orders
        const avRes = await partnerApi.getAvailableOrders(session.token);
        const foundAvail = avRes.orders.find(o => o.id === id);
        if (isMountedRef.current && foundAvail) setOrder(foundAvail);
      }
    } catch { /* non-fatal */ }
    finally { if (isMountedRef.current) setLoading(false); }
  }, [session, id]);

  // Silent refresh used by the QR poll — does not show the loading spinner
  const silentRefresh = useCallback(async () => {
    if (!session || !id) return;
    try {
      const myRes = await partnerApi.getMyOrders(session.token);
      const found = myRes.orders.find(o => o.id === id);
      if (isMountedRef.current && found) setOrder(found);
    } catch { /* non-fatal */ }
  }, [session, id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // ── QR auto-close effect ──────────────────────────────────────────────────
  // Starts a 4-second poll whenever the partner is on this screen and the
  // order is awaiting QR scan (NIVA Foods Room delivery, not yet verified).
  // Stops the poll as soon as the order is confirmed or the screen unmounts.
  useEffect(() => {
    const stopPoll = () => {
      if (qrPollRef.current) {
        clearInterval(qrPollRef.current);
        qrPollRef.current = null;
      }
    };

    if (!order) return stopPoll;

    const isNivaFoodsRoom = !!(order.restaurant_id && order.delivery_type === 'room');
    const isAssigned = order.assigned_partner_id === partner?.id;
    const awaitingQr =
      isNivaFoodsRoom &&
      isAssigned &&
      ['taken', 'prepared', 'arrived_at_campus'].includes(order.status) &&
      !order.qr_handover_verified;

    if (!awaitingQr) {
      stopPoll();
      return;
    }

    // Start poll if not already running
    if (!qrPollRef.current) {
      qrPollRef.current = setInterval(silentRefresh, 4000);
    }

    return stopPoll;
  }, [order, partner, silentRefresh]);

  // ── Detect QR verification flip → auto-close ─────────────────────────────
  // IMPORTANT: this is the ONLY place this screen navigates automatically, and
  // it must ONLY do so for a genuine QR-handover flip on an order that belongs
  // to THIS partner. Previously it reacted to any NIVA Foods Room order; an
  // order claimed/advanced by another partner (or a transient refetch) could
  // trip it and bounce the partner back unexpectedly (Bug 1). We now gate on
  // ownership and the mounted guard so navigation is never spurious.
  useEffect(() => {
    if (!order) return;

    const isNivaFoodsRoom = !!(order.restaurant_id && order.delivery_type === 'room');
    const isAssignedToMe = order.assigned_partner_id === partner?.id;
    if (!isNivaFoodsRoom || !isAssignedToMe) return;

    const justVerified =
      prevQrVerified.current === false &&
      (order.qr_handover_verified === true || order.status === 'out_for_delivery');

    // Initialise tracker on first render
    if (prevQrVerified.current === null) {
      prevQrVerified.current = order.qr_handover_verified ?? false;
      return;
    }

    if (justVerified) {
      // Long vibration pattern: acknowledge the handover
      Vibration.vibrate([0, 200, 100, 300, 100, 200]);
      // Brief pause so the partner sees the status change, then go back —
      // guarded so a queued navigation never fires after unmount.
      const t = setTimeout(() => { if (isMountedRef.current) router.back(); }, 1000);
      prevQrVerified.current = true;
      return () => clearTimeout(t);
    }

    prevQrVerified.current = order.qr_handover_verified ?? false;
  }, [order, partner]);

  const isAssignedToMe = order?.assigned_partner_id === partner?.id;
  const isNivaFoodsRoom = !!(order?.restaurant_id && order?.delivery_type === 'room');
  const isNivaDeliveries = !order?.restaurant_id && order?.delivery_type === 'room';

  // What action is available to this partner now?
  const getNextAction = (o: Order): { status: string; label: string; requiresQr?: boolean } | null => {
    if (!isAssignedToMe) return null;

    if (isNivaFoodsRoom) {
      // For NIVA Foods Room: out_for_delivery requires QR (use scanner tab)
      // After QR scan, only out_for_delivery → delivered remains here
      if (o.status === 'out_for_delivery') return { status: 'delivered', label: 'Mark as Delivered' };
      if (['taken', 'prepared', 'arrived_at_campus'].includes(o.status) && !o.qr_handover_verified) {
        return { status: 'out_for_delivery', label: 'Scan QR to Start Delivery', requiresQr: true };
      }
    }

    if (isNivaDeliveries) {
      if (o.status === 'taken') return { status: 'out_for_delivery', label: 'Out for Delivery' };
      if (o.status === 'out_for_delivery') return { status: 'delivered', label: 'Mark as Delivered' };
    }

    return null;
  };

  const handleAction = async (action: { status: string; label: string; requiresQr?: boolean }) => {
    if (!session || !order) return;

    if (action.requiresQr) {
      Alert.alert(
        'QR Required',
        'You need to scan the restaurant\'s QR code to begin delivery. Go to the Scanner tab.',
        [{ text: 'Go to Scanner', onPress: () => router.push('/(tabs)/scanner') }, { text: 'Cancel', style: 'cancel' }]
      );
      return;
    }

    Alert.alert('Confirm', `${action.label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdating(true);
          try {
            await partnerApi.updateOrderStatus(order.id, action.status, session.token);
            await fetchOrder();
          } catch (e: any) {
            Alert.alert('Error', e?.data?.message ?? 'Failed to update status.');
          } finally { if (isMountedRef.current) setUpdating(false); }
        },
      },
    ]);
  };

  const handleAccept = async () => {
    // Guard against duplicate submissions from rapid taps — if an accept is
    // already in flight (updating), ignore further presses.
    if (!session || !order || updating) return;
    setUpdating(true);
    try {
      await partnerApi.acceptOrder(order.id, session.token);
      alertManager.stopAlert(order.id, 'accepted');
      // Stay on this screen and re-read the authoritative order state. We never
      // navigate away on a successful accept — the partner remains on the order
      // details so they can continue the delivery workflow (Bug 1).
      await fetchOrder();
    } catch (e: any) {
      if (e?.data?.error_code === 'ORDER_ALREADY_CLAIMED') {
        Alert.alert('Already Taken', 'This order was taken by another partner.');
        alertManager.handleOrderUnavailable(order.id);
        // Reconcile the screen with the backend so the stale "Take Order"
        // button is replaced by the real (claimed) state.
        await fetchOrder();
      } else {
        Alert.alert('Error', e?.data?.message ?? 'Failed to accept order.');
      }
    } finally { if (isMountedRef.current) setUpdating(false); }
  };

  const items: OrderItem[] = order
    ? (typeof order.items === 'string' ? JSON.parse(order.items) : order.items) ?? []
    : [];

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={NIVA_COLORS.orange} /></View>;
  if (!order) return <View style={s.loader}><Text style={s.notFound}>Order not found.</Text></View>;

  const nextAction = getNextAction(order);
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? NIVA_COLORS.gray400;

  return (
    <View style={{ flex: 1, backgroundColor: NIVA_COLORS.gray50 }}>
      {/* Explicit back bar */}
      <View style={s.backBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBarBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backBarArrow}>‹</Text>
          <Text style={s.backBarText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.backBarTitle}>#{order.order_number}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={s.container}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={fetchOrder} tintColor={NIVA_COLORS.orange} />}
      >
        {/* Status */}
        <View style={[s.statusHeader, { backgroundColor: statusColor + '18' }]}>
          <Text style={s.orderNum}>#{order.order_number}</Text>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '25', borderColor: statusColor + '50' }]}>
            <Text style={[s.statusText, { color: statusColor }]}>{ORDER_STATUS_LABELS[order.status]}</Text>
          </View>
          <Text style={s.deliveryType}>{DELIVERY_TYPE_LABELS[order.delivery_type] ?? order.delivery_type}</Text>
          {isNivaFoodsRoom && <Text style={s.orderType}>NIVA Foods Room Delivery</Text>}
          {isNivaDeliveries && <Text style={s.orderType}>NIVA Deliveries</Text>}
        </View>

        {/* Delivery address */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Delivery Address</Text>
          {order.hostel_name && <InfoRow label="Hostel" value={order.hostel_name} />}
          {order.room_number && <InfoRow label="Room" value={order.room_number} />}
          {order.hostel_type && <InfoRow label="Zone" value={order.hostel_type === 'boys' ? 'Boys Hostels' : 'Girls Hostels'} />}
          {order.customer_college && <InfoRow label="Campus" value={order.customer_college} />}
        </View>

        {/* Customer — phone only visible after QR scan */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Customer</Text>
          <InfoRow label="Name" value={order.customer_name} />
          {order.qr_handover_verified && order.customer_phone && (
            <InfoRow label="Phone" value={order.customer_phone} />
          )}
          {!order.qr_handover_verified && isNivaFoodsRoom && (
            <Text style={s.phoneHidden}>📵 Customer phone visible after QR scan</Text>
          )}
        </View>

        {/* Items */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Items</Text>
          {items.map((item, i) => (
            <View key={i} style={s.itemRow}>
              <Text style={s.itemName}>{item.name}</Text>
              <Text style={s.itemQty}>×{item.quantity}</Text>
            </View>
          ))}
          {order.number_of_packets && <InfoRow label="Packets" value={String(order.number_of_packets)} />}
          {order.vendor_platform && <InfoRow label="Platform" value={order.vendor_platform} />}
        </View>

        {/* Restaurant (if NIVA Foods) */}
        {isNivaFoodsRoom && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Restaurant</Text>
            {order.vendor_name && <InfoRow label="Name" value={order.vendor_name} />}
            {order.restaurant_phone && <InfoRow label="Phone" value={order.restaurant_phone} />}
            <InfoRow
              label="Status"
              value={order.status === 'arrived_at_campus' ? '✅ Arrived at Campus — scan QR' :
                     ['taken', 'prepared'].includes(order.status) ? '⏳ Preparing...' : '—'}
            />
          </View>
        )}

        {/* Siren warning for NIVA Foods before arrival */}
        {isNivaFoodsRoom && ['taken', 'prepared'].includes(order.status ?? '') && isAssignedToMe && (
          <View style={s.waitingBox}>
            <Text style={s.waitingText}>
              ⏳ Waiting for the restaurant to arrive at campus before you can start delivery.
            </Text>
          </View>
        )}

        {/* Payment
          Amount display rules (mirrors available.tsx OrderDetailSheet):
          - COD:     show food_amount (the base item cost the partner collects at the door).
                     total_amount includes the 2% cod_tax (platform fee) which is not
                     collected by the partner — showing it would be misleading.
          - Prepaid: show total_amount (= delivery_charge + food_amount; no cod_tax).
                     The customer already paid online; partner is just informed of the value.
          - payment_method stores 'cod' for Cash on Delivery and 'razorpay' for online.
            Legacy/null values fall back to 'Paid Online' label with total_amount.
        */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Payment</Text>
          <InfoRow
            label="Method"
            value={
              order.payment_method === 'cod'
                ? 'Cash on Delivery (collect from customer)'
                : order.payment_method === 'razorpay' || order.payment_method === 'prepaid'
                  ? 'Paid Online'
                  : order.payment_method
                    ? `Paid (${order.payment_method})`
                    : 'Paid Online'
            }
          />
          {order.payment_method === 'cod' && order.food_amount != null ? (
            // COD: show the food amount EXCLUDING the 2% cod_tax (platform fee).
            // This is what the partner actually collects from the customer.
            <InfoRow label="Collect (COD)" value={`₹${Number(order.food_amount).toFixed(0)}`} />
          ) : (
            // Prepaid or legacy: show total_amount (already excludes cod_tax for prepaid).
            <InfoRow label="Order Amount" value={`₹${Number(order.total_amount ?? 0).toFixed(0)}`} />
          )}
        </View>

        {/* Accept (if not yet assigned) */}
        {!isAssignedToMe && order.status !== 'delivered' && order.status !== 'cancelled' && (
          <TouchableOpacity
            style={[s.acceptBtn, updating && s.btnDisabled]}
            onPress={handleAccept}
            disabled={updating}
          >
            {updating ? <ActivityIndicator color="#fff" /> : <Text style={s.acceptBtnText}>Take Order</Text>}
          </TouchableOpacity>
        )}

        {/* Next action */}
        {nextAction && (
          <TouchableOpacity
            style={[s.actionBtn, updating && s.btnDisabled, nextAction.requiresQr && s.qrBtn]}
            onPress={() => handleAction(nextAction)}
            disabled={updating}
          >
            {updating ? <ActivityIndicator color="#fff" /> : <Text style={s.actionBtnText}>{nextAction.label}</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  backBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: NIVA_COLORS.black, paddingHorizontal: 12, paddingVertical: 12, paddingTop: 44,
  },
  backBarBtn: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backBarArrow: { color: NIVA_COLORS.white, fontSize: 28, lineHeight: 28, marginRight: 2 },
  backBarText: { color: NIVA_COLORS.white, fontSize: 15, fontFamily: 'Montserrat-Medium' },
  backBarTitle: { color: NIVA_COLORS.white, fontSize: 15, fontFamily: 'Montserrat-Bold' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, color: NIVA_COLORS.gray500 },
  statusHeader: { borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center', gap: 4 },
  orderNum: { fontSize: 20, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginTop: 4 },
  statusText: { fontSize: 13, fontFamily: 'Montserrat-SemiBold' },
  deliveryType: { fontSize: 13, color: NIVA_COLORS.gray500, marginTop: 2 },
  orderType: { fontSize: 12, color: NIVA_COLORS.orange, fontFamily: 'Montserrat-SemiBold' },
  card: {
    backgroundColor: NIVA_COLORS.white, borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2,
  },
  sectionTitle: { fontSize: 12, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray500, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: 14, color: NIVA_COLORS.gray500 },
  infoValue: { fontSize: 14, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-Medium', flex: 1, textAlign: 'right' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  itemName: { fontSize: 14, color: NIVA_COLORS.gray800, flex: 1 },
  itemQty: { fontSize: 14, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Medium' },
  phoneHidden: { fontSize: 12, color: NIVA_COLORS.gray400, fontStyle: 'italic', marginTop: 4 },
  waitingBox: { backgroundColor: NIVA_COLORS.amberLight, borderRadius: 12, padding: 12, marginBottom: 12 },
  waitingText: { fontSize: 13, color: NIVA_COLORS.amber + 'CC', fontFamily: 'Montserrat-Medium' },
  acceptBtn: { backgroundColor: NIVA_COLORS.orange, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 10, marginTop: 8 },
  actionBtn: { backgroundColor: NIVA_COLORS.black, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 10, marginTop: 8 },
  qrBtn: { backgroundColor: NIVA_COLORS.orange },
  btnDisabled: { opacity: 0.5 },
  acceptBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Montserrat-Bold' },
  actionBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Montserrat-Bold' },
});
