/**
 * OrderCard — matches the NIVA web restaurant portal order card exactly.
 *
 * Layout (top to bottom):
 *   Row 1: Order# + status badge + date/time
 *   Row 2: Customer name
 *   Row 3: Location (hostel · room)
 *   Row 4: Items summary
 *   Row 5: Restaurant earned (green) + payment type badge
 *   Row 6: Partner call row (if assigned)
 *   Row 7: Customer call row
 *   Row 8: View Details button
 */
import React, { useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Alert, ActivityIndicator,
} from 'react-native';
import type { Order } from '@niva/shared';
import { NIVA_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@niva/shared';

interface Props {
  order: Order;
  onPress: () => void;
  /** Called when the restaurant taps "Accept Order" directly from the list card. */
  onAccept?: () => void;
  /** True while the accept API call is in-flight (shows spinner on the button). */
  accepting?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function callNumber(phone: string, label: string) {
  const num = phone.replace(/\D/g, '');
  const tel = `tel:${num.length === 10 ? '+91' : ''}${num}`;
  Linking.canOpenURL(tel).then(yes => {
    if (yes) Linking.openURL(tel);
    else Alert.alert('Cannot call', `${label}: ${phone}`);
  });
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const color = ORDER_STATUS_COLORS[status] ?? NIVA_COLORS.gray400;
  const label = ORDER_STATUS_LABELS[status] ?? status;
  return (
    <View style={[pill.wrap, { backgroundColor: color + '20', borderColor: color + '50' }]}>
      <View style={[pill.dot, { backgroundColor: color }]} />
      <Text style={[pill.label, { color }]}>{label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontFamily: 'Montserrat-SemiBold' },
});

// ─── Contact row ──────────────────────────────────────────────────────────────

function ContactRow({ name, role, phone }: { name: string; role: string; phone?: string }) {
  return (
    <View style={cr.row}>
      <View style={cr.avatar}>
        <Text style={cr.avatarText}>{name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={cr.info}>
        <Text style={cr.name}>{name}</Text>
        <Text style={cr.role}>{role}</Text>
      </View>
      {phone ? (
        <TouchableOpacity
          style={cr.callBtn}
          onPress={() => callNumber(phone, name)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={cr.callIcon}>📞</Text>
          <Text style={cr.callText}>Call</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
const cr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginBottom: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: NIVA_COLORS.gray200, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray600 },
  info: { flex: 1 },
  name: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900 },
  role: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 1 },
  callBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: NIVA_COLORS.gray300, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, gap: 4, backgroundColor: NIVA_COLORS.white },
  callIcon: { fontSize: 12 },
  callText: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },
});

// ─── Main card ────────────────────────────────────────────────────────────────

export function OrderCard({ order, onPress, onAccept, accepting = false }: Props) {
  const items = parseItems(order.items);
  const itemSummary = items.map((i: any) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ');
  const earned = restaurantEarning(order);
  const isCod = order.payment_method === 'cod';
  const isNew = order.status === 'placed';

  return (
    <View style={[s.card, isNew && s.cardNew]}>
      {/* Row 1: order number + status + time */}
      <View style={s.topRow}>
        <View style={s.topLeft}>
          <Text style={s.orderNum}>#{order.order_number}</Text>
          <StatusPill status={order.status} />
        </View>
        <Text style={s.time}>{formatDateTime(order.created_at)}</Text>
      </View>

      {/* Row 2-3: customer + location */}
      <Text style={s.customerName}>{order.customer_name}</Text>
      {(order.hostel_name || order.room_number) && (
        <Text style={s.location}>
          {[order.hostel_name, order.room_number ? `Room ${order.room_number}` : null]
            .filter(Boolean).join(' · ')}
        </Text>
      )}

      {/* Row 4: items */}
      {itemSummary ? (
        <Text style={s.items} numberOfLines={2}>{itemSummary}</Text>
      ) : null}

      {/* Row 5: earned + payment badge */}
      {earned > 0 && (
        <View style={s.earningRow}>
          <Text style={s.earned}>Earned ₹{earned.toFixed(0)}</Text>
          <View style={[s.payBadge, isCod ? s.payBadgeCod : s.payBadgePrepaid]}>
            <Text style={[s.payBadgeText, isCod ? s.payBadgeCodText : s.payBadgePrepaidText]}>
              {isCod ? 'COD' : 'Prepaid'}
            </Text>
          </View>
        </View>
      )}

      {/* Divider */}
      <View style={s.divider} />

      {/* Row 6: partner (if assigned) — restaurant always sees call button */}
      {order.partner_name && (
        <ContactRow
          name={order.partner_name}
          role="Delivery Partner"
          phone={order.partner_phone}
        />
      )}

      {/* Row 7: customer */}
      <ContactRow
        name={order.customer_name}
        role="Customer"
        phone={order.customer_phone}
      />

      {/* Row 8: action buttons row */}
      <View style={s.actionRow}>
        {/* Accept Order — only shown for new (placed) orders */}
        {isNew && onAccept && (
          <TouchableOpacity
            style={[s.acceptBtn, accepting && s.btnDisabled]}
            onPress={onAccept}
            activeOpacity={0.8}
            disabled={accepting}
          >
            {accepting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.acceptBtnText}>✓ Accept</Text>
            }
          </TouchableOpacity>
        )}

        {/* View Details */}
        <TouchableOpacity
          style={[s.viewBtn, isNew && onAccept && s.viewBtnNarrow]}
          onPress={onPress}
          activeOpacity={0.7}
        >
          <Text style={s.viewBtnText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: NIVA_COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  cardNew: {
    borderLeftWidth: 3,
    borderLeftColor: NIVA_COLORS.orange,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderNum: { fontSize: 13, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  time: { fontSize: 11, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Regular' },
  customerName: {
    fontSize: 15, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900, marginBottom: 2,
  },
  location: { fontSize: 12, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Regular', marginBottom: 4 },
  items: { fontSize: 13, color: NIVA_COLORS.gray600, fontFamily: 'Montserrat-Regular', marginBottom: 8 },
  earningRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  earned: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.green },
  payBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  payBadgePrepaid: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  payBadgeCod: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  payBadgeText: { fontSize: 11, fontFamily: 'Montserrat-SemiBold' },
  payBadgePrepaidText: { color: '#15803D' },
  payBadgeCodText: { color: '#C2410C' },
  divider: { height: 1, backgroundColor: NIVA_COLORS.gray100, marginBottom: 10 },
  actionRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    backgroundColor: NIVA_COLORS.green,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  acceptBtnText: {
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
    color: '#fff',
  },
  btnDisabled: { opacity: 0.5 },
  viewBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: NIVA_COLORS.gray200,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: NIVA_COLORS.gray50,
    minHeight: 44,
  },
  viewBtnNarrow: {
    flex: 0.9,
  },
  viewBtnText: { fontSize: 14, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },
});
