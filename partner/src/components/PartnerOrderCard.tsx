/**
 * Partner Order Card — compact summary for available and active deliveries.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { Order } from '@niva/shared';
import { NIVA_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@niva/shared';

interface Props {
  order: Order;
  onPress: () => void;
  onAccept?: () => void;
  accepting?: boolean;
  showAccept?: boolean;
  onStatusUpdate?: (status: string, label: string) => void;
  updating?: boolean;
}

export function PartnerOrderCard({
  order, onPress, onAccept, accepting, showAccept, onStatusUpdate, updating,
}: Props) {
  const items = typeof order.items === 'string'
    ? (() => { try { return JSON.parse(order.items); } catch { return []; } })()
    : (order.items ?? []);

  const itemSummary = items.slice(0, 2).map((i: any) => i.name).join(', ') +
    (items.length > 2 ? ` +${items.length - 2}` : '');

  const isNivaFoods = !!order.restaurant_id;
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? NIVA_COLORS.gray400;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      {/* Type badge */}
      <View style={s.typeBadge}>
        <Text style={s.typeText}>{isNivaFoods ? 'NIVA Foods' : 'NIVA Deliveries'}</Text>
      </View>

      <View style={s.headerRow}>
        <Text style={s.orderNum}>#{order.order_number}</Text>
        <View style={[s.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
          <Text style={[s.statusText, { color: statusColor }]}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      <View style={s.metaRow}>
        {order.hostel_name && <Text style={s.meta}>{order.hostel_name}</Text>}
        {order.room_number && <Text style={s.meta}>Room {order.room_number}</Text>}
      </View>

      {itemSummary ? <Text style={s.items} numberOfLines={1}>{itemSummary}</Text> : null}

      {order.number_of_packets && (
        <Text style={s.packets}>{order.number_of_packets} packets</Text>
      )}

      <View style={s.footer}>
        <Text style={s.time}>{formatRelativeTime(order.created_at)}</Text>
        {order.payment_method === 'cod' && (
          <Text style={s.cod}>COD ₹{order.total_amount}</Text>
        )}
      </View>

      {/* Accept button for available orders */}
      {showAccept && onAccept && (
        <TouchableOpacity
          style={[s.acceptBtn, accepting && s.acceptBtnDisabled]}
          onPress={(e) => { e.stopPropagation?.(); onAccept(); }}
          disabled={accepting}
        >
          {accepting ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={s.acceptBtnText}>Take Order</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Status update buttons for active orders */}
      {onStatusUpdate && order.status === 'taken' && !isNivaFoods && (
        <TouchableOpacity
          style={[s.actionBtn, updating && s.acceptBtnDisabled]}
          onPress={(e) => { e.stopPropagation?.(); onStatusUpdate('out_for_delivery', 'Mark as Out for Delivery'); }}
          disabled={updating}
        >
          {updating ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={s.acceptBtnText}>Out for Delivery</Text>
          )}
        </TouchableOpacity>
      )}
      {onStatusUpdate && order.status === 'out_for_delivery' && (
        <TouchableOpacity
          style={[s.actionBtn, s.deliveredBtn, updating && s.acceptBtnDisabled]}
          onPress={(e) => { e.stopPropagation?.(); onStatusUpdate('delivered', 'Mark as Delivered'); }}
          disabled={updating}
        >
          {updating ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={s.acceptBtnText}>Mark Delivered</Text>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  card: {
    backgroundColor: NIVA_COLORS.white, borderRadius: 16, padding: 14,
    marginBottom: 8, elevation: 2,
  },
  typeBadge: { alignSelf: 'flex-start', backgroundColor: NIVA_COLORS.gray100, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  typeText: { fontSize: 11, color: NIVA_COLORS.gray600, fontFamily: 'Montserrat-SemiBold' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderNum: { fontSize: 16, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 11, fontFamily: 'Montserrat-SemiBold' },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  meta: { fontSize: 13, color: NIVA_COLORS.gray600, fontFamily: 'Montserrat-Medium' },
  items: { fontSize: 12, color: NIVA_COLORS.gray500, marginBottom: 4 },
  packets: { fontSize: 12, color: NIVA_COLORS.gray500 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { fontSize: 11, color: NIVA_COLORS.gray400 },
  cod: { fontSize: 11, color: NIVA_COLORS.orange, fontFamily: 'Montserrat-SemiBold' },
  acceptBtn: { backgroundColor: NIVA_COLORS.orange, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  actionBtn: { backgroundColor: NIVA_COLORS.black, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  deliveredBtn: { backgroundColor: NIVA_COLORS.green },
  acceptBtnDisabled: { opacity: 0.5 },
  acceptBtnText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 14 },
});
