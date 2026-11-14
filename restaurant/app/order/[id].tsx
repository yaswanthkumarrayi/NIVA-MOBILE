/**
 * Restaurant Order Detail Screen
 *
 * Layout matches the NIVA web restaurant portal detail view:
 *   - Back navigation
 *   - Order # + status + type
 *   - YOUR EARNINGS card (green, restaurant food amount)
 *   - Customer + delivery address
 *   - Food bill (items × prices)
 *   - Partner contact (if assigned)
 *   - Customer contact
 *   - QR code (room delivery, after accepted)
 *   - Action button
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, RefreshControl, Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { restaurantApi } from '@niva/shared';
import { alertManager } from '@niva/shared';
import { NIVA_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_TYPE_LABELS } from '@niva/shared';
import type { Order, OrderItem } from '@niva/shared';
import { useRestaurantStore } from '../../src/services/restaurantStore';
import { OrderQrDisplay } from '../../src/components/OrderQrDisplay';

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
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function callNumber(phone: string, label: string) {
  const num = phone.replace(/\D/g, '');
  const tel = `tel:${num.length === 10 ? '+91' : ''}${num}`;
  Linking.canOpenURL(tel).then(ok => {
    if (ok) Linking.openURL(tel);
    else Alert.alert('Cannot call', `${label}: ${phone}`);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

function Row({ label, value, bold, green }: { label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, bold && s.rowBold, green && s.rowGreen]}>{value}</Text>
    </View>
  );
}

function ContactCard({ name, sub, phone }: { name: string; sub: string; phone?: string }) {
  return (
    <View style={s.contactCard}>
      <View style={s.contactAvatar}>
        <Text style={s.contactAvatarText}>{name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={s.contactInfo}>
        <Text style={s.contactName}>{name}</Text>
        <Text style={s.contactSub}>{sub}</Text>
      </View>
      {phone ? (
        <TouchableOpacity style={s.callBtn} onPress={() => callNumber(phone, name)}>
          <Text style={s.callIcon}>📞</Text>
          <Text style={s.callText}>Call</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useRestaurantStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  const fetchOrder = useCallback(async () => {
    if (!session || !id) return;
    try {
      // Fetch both list (has food_amount) and detail (has extra fields) and merge
      const [listRes, detailRes] = await Promise.allSettled([
        restaurantApi.getOrders(session.token),
        restaurantApi.getOrder(id, session.token),
      ]);
      let merged: Order | null = null;
      if (listRes.status === 'fulfilled') {
        merged = listRes.value.orders.find(o => o.id === id) ?? null;
      }
      if (detailRes.status === 'fulfilled') {
        const detail = detailRes.value.order;
        merged = {
          ...detail,
          total_amount: merged?.total_amount ?? detail.total_amount,
          food_amount: merged?.food_amount ?? detail.food_amount,
          room_delivery_charge: merged?.room_delivery_charge ?? detail.room_delivery_charge,
          maintenance_amount: merged?.maintenance_amount ?? detail.maintenance_amount,
        } as Order;
      }
      if (merged) { setOrder(merged); setError(''); }
      else setError('Order not found.');
    } catch {
      setError('Could not load order.');
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleAction = async (targetStatus: string, label: string) => {
    if (!session || !order) return;
    Alert.alert('Confirm', `${label}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm', onPress: async () => {
          setUpdating(true);
          try {
            await restaurantApi.updateOrderStatus(order.id, targetStatus, session.token);
            if (targetStatus === 'taken') alertManager.stopAlert(order.id, 'accepted');
            await fetchOrder();
          } catch (e: any) {
            if (e?.status === 409) {
              Alert.alert('Conflict', e.data?.message ?? 'Status transition not allowed.');
              if (targetStatus === 'taken') alertManager.handleOrderUnavailable(order.id);
            } else {
              Alert.alert('Error', 'Failed to update order. Please try again.');
            }
          } finally { setUpdating(false); }
        },
      },
    ]);
  };

  const nextAction = (o: Order): { status: string; label: string } | null => {
    const room = o.delivery_type === 'room';
    if (o.status === 'placed')                     return { status: 'taken',             label: 'Accept Order' };
    if (o.status === 'taken' && room)               return { status: 'prepared',           label: 'Mark Prepared' };
    if (o.status === 'prepared' && room)            return { status: 'arrived_at_campus', label: 'Arrived at Campus' };
    if (o.status === 'taken' && !room)              return { status: 'out_for_delivery',  label: 'Out for Delivery' };
    if (o.status === 'out_for_delivery' && !room)   return { status: 'delivered',         label: 'Mark Delivered' };
    return null;
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={NIVA_COLORS.orange} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{error || 'Order not found.'}</Text>
        <TouchableOpacity style={s.goBack} onPress={() => router.back()}>
          <Text style={s.goBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const items = parseItems(order.items);
  const earned = restaurantEarning(order);
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? NIVA_COLORS.gray400;
  const action = nextAction(order);
  const isCod = order.payment_method === 'cod';
  const isRoom = order.delivery_type === 'room';

  return (
    <View style={{ flex: 1, backgroundColor: '#F8F9FB' }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backArrow}>‹</Text>
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Order #{order.order_number}</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={fetchOrder} tintColor={NIVA_COLORS.orange} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Status strip */}
        <View style={[s.statusStrip, { borderLeftColor: statusColor }]}>
          <View style={s.statusLeft}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusText, { color: statusColor }]}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </Text>
          </View>
          <Text style={s.statusType}>
            {DELIVERY_TYPE_LABELS[order.delivery_type] ?? order.delivery_type}
            {isCod ? '  ·  COD' : '  ·  Prepaid'}
          </Text>
        </View>

        {/* YOUR EARNINGS — most prominent, matches web */}
        {earned > 0 && (
          <View style={s.earningsCard}>
            <Text style={s.earningsLabel}>YOUR EARNINGS</Text>
            <View style={s.earningsRow}>
              <Text style={s.earningsKey}>Restaurant Earned</Text>
              <Text style={s.earningsValue}>₹{earned.toFixed(0)}</Text>
            </View>
          </View>
        )}

        {/* Customer & Delivery */}
        <View style={s.card}>
          <SectionTitle>Customer & Delivery</SectionTitle>
          <Row label="Name" value={order.customer_name} />
          {order.customer_college && <Row label="College" value={order.customer_college} />}
          {isRoom && order.hostel_name && <Row label="Hostel" value={order.hostel_name} />}
          {isRoom && order.hostel_type && <Row label="Hostel Type" value={order.hostel_type === 'boys' ? 'Boys' : 'Girls'} />}
          {isRoom && order.room_number && <Row label="Room" value={order.room_number} />}
          {order.delivery_type === 'block' && order.delivery_block && <Row label="Block" value={order.delivery_block} />}
          {order.delivery_slot && <Row label="Slot" value={order.delivery_slot} />}
          {order.delivery_date && <Row label="Date" value={order.delivery_date} />}
        </View>

        {/* Food Bill — item level */}
        <View style={s.card}>
          <SectionTitle>Food Bill</SectionTitle>
          {items.map((item: any, i: number) => (
            <View key={i} style={s.itemRow}>
              <Text style={s.itemName}>{item.name}</Text>
              <View style={s.itemRight}>
                <Text style={s.itemQty}>×{item.quantity || 1}</Text>
                {item.price > 0 && (
                  <Text style={s.itemPrice}>₹{(item.price * (item.quantity || 1)).toFixed(0)}</Text>
                )}
              </View>
            </View>
          ))}
          {order.number_of_packets ? (
            <Row label="Packets" value={String(order.number_of_packets)} />
          ) : null}
          {/* Divider before total */}
          {earned > 0 && (
            <>
              <View style={s.divider} />
              <View style={s.itemRow}>
                <Text style={[s.itemName, { fontFamily: 'Montserrat-Bold' }]}>Restaurant Total</Text>
                <Text style={[s.itemPrice, { color: NIVA_COLORS.green }]}>₹{earned.toFixed(0)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Contacts */}
        <View style={s.card}>
          <SectionTitle>Contacts</SectionTitle>
          {order.partner_name && (
            <ContactCard
              name={order.partner_name}
              sub="Delivery Partner"
              phone={order.qr_handover_verified ? order.partner_phone : undefined}
            />
          )}
          <ContactCard
            name={order.customer_name}
            sub="Customer"
            phone={order.customer_phone}
          />
        </View>

        {/* Timeline */}
        <View style={s.card}>
          <SectionTitle>Timeline</SectionTitle>
          {[
            { label: 'Placed', val: order.placed_at },
            { label: 'Accepted', val: order.taken_at },
            { label: 'Prepared', val: order.prepared_at },
            { label: 'Arrived at Campus', val: order.arrived_at_campus_at },
            { label: 'Out for Delivery', val: order.out_for_delivery_at },
            { label: 'Delivered', val: order.delivered_at },
          ].filter(r => r.val).map(r => (
            <Row key={r.label} label={r.label} value={fmt(r.val)} />
          ))}
        </View>

        {/* QR for NIVA Foods room delivery */}
        {isRoom && order.restaurant_id && session &&
          ['taken', 'prepared', 'arrived_at_campus', 'out_for_delivery', 'delivered'].includes(order.status) && (
            <OrderQrDisplay orderId={order.id} token={session.token} />
          )}

        {/* Primary action */}
        {action && (
          <TouchableOpacity
            style={[s.actionBtn, updating && { opacity: 0.5 }]}
            onPress={() => handleAction(action.status, action.label)}
            disabled={updating}
            activeOpacity={0.8}
          >
            {updating
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.actionBtnText}>{action.label}</Text>
            }
          </TouchableOpacity>
        )}

        {/* Cancel */}
        {order.status === 'placed' && (
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => handleAction('cancelled', 'Cancel this order')}
            disabled={updating}
          >
            <Text style={s.cancelBtnText}>Cancel Order</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FB' },
  errorText: { fontSize: 15, color: NIVA_COLORS.gray500, marginBottom: 16 },
  goBack: { backgroundColor: NIVA_COLORS.black, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  goBackText: { color: '#fff', fontFamily: 'Montserrat-SemiBold' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: NIVA_COLORS.black, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 48,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 64 },
  backArrow: { color: '#fff', fontSize: 26, marginRight: 2 },
  backText: { color: '#fff', fontSize: 14, fontFamily: 'Montserrat-Medium' },
  headerTitle: { color: '#fff', fontSize: 15, fontFamily: 'Montserrat-Bold' },

  // Status strip
  statusStrip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: NIVA_COLORS.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 12, borderLeftWidth: 4,
    elevation: 1,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: 'Montserrat-SemiBold' },
  statusType: { fontSize: 12, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Regular' },

  // Earnings
  earningsCard: {
    backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#BBF7D0',
  },
  earningsLabel: {
    fontSize: 10, fontFamily: 'Montserrat-Bold', color: '#166534',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
  },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earningsKey: { fontSize: 14, fontFamily: 'Montserrat-Medium', color: '#166534' },
  earningsValue: { fontSize: 20, fontFamily: 'Montserrat-Bold', color: '#166534' },

  // Card
  card: {
    backgroundColor: NIVA_COLORS.white, borderRadius: 14, padding: 16,
    marginBottom: 12, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 10, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray400,
    textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 10,
  },

  // Row
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Regular', flex: 1 },
  rowValue: { fontSize: 13, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-Medium', flex: 1, textAlign: 'right' },
  rowBold: { fontFamily: 'Montserrat-Bold' },
  rowGreen: { color: NIVA_COLORS.green },

  // Item row
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  itemName: { fontSize: 13, color: NIVA_COLORS.gray800, fontFamily: 'Montserrat-Regular', flex: 1 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemQty: { fontSize: 12, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Regular' },
  itemPrice: { fontSize: 13, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-SemiBold' },
  divider: { height: 1, backgroundColor: NIVA_COLORS.gray100, marginVertical: 8 },

  // Contacts
  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginBottom: 8,
  },
  contactAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: NIVA_COLORS.gray200, alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  contactAvatarText: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray600 },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900 },
  contactSub: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 1 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: NIVA_COLORS.gray300, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: NIVA_COLORS.white,
  },
  callIcon: { fontSize: 12 },
  callText: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },

  // Actions
  actionBtn: {
    backgroundColor: NIVA_COLORS.black, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 4, marginBottom: 8,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Montserrat-Bold' },
  cancelBtn: {
    borderWidth: 1.5, borderColor: NIVA_COLORS.red, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center', marginBottom: 8,
  },
  cancelBtnText: { color: NIVA_COLORS.red, fontSize: 14, fontFamily: 'Montserrat-SemiBold' },
});
