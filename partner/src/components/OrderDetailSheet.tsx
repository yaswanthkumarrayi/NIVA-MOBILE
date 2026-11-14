/**
 * OrderDetailSheet — shared order-details bottom sheet.
 *
 * SINGLE SOURCE OF TRUTH for the partner order-details card used by BOTH the
 * Active tab and the Available tab. It is a bottom sheet that rises from the
 * bottom of the screen using React Native's <Modal animationType="slide">
 * (the exact same animation the Active tab has always used).
 *
 * The only thing that differs between Active and Available is the primary
 * action button in the footer, which each screen supplies via `primaryAction`:
 *   - Active   → status-based action (Scan QR / Out for Delivery / Delivered …)
 *   - Available→ "Accept Order" (Take Order) — only fires when explicitly pressed
 *
 * Opening this sheet performs NO side effects (no accept/take/status change).
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, Linking, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NIVA_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@niva/shared';
import type { Order, OrderItem } from '@niva/shared';

// ─── Shared helpers (single source of truth) ─────────────────────────────────

export function parseItems(raw: OrderItem[] | string | null | undefined): OrderItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

/** Tier-based earning — 1-2 pkts → ₹15, 3-4 → ₹30, 5-6 → ₹35, 7-8 → ₹40, 9+ → ₹45 */
function calcEarningByTier(pkts: number): number {
  if (pkts <= 2) return 15;
  if (pkts <= 4) return 30;
  if (pkts <= 6) return 35;
  if (pkts <= 8) return 40;
  return 45;
}

/**
 * Resolve partner earning for an order.
 * Uses partner_amount from the DB when it is a valid positive value that is
 * NOT the legacy default of ₹20 (hardcoded before the tier system existed).
 * Orders carrying that old ₹20 value fall back to the tier calculation so the
 * partner always sees the correct current rate.
 */
export function partnerEarning(order: Order): number {
  const pa = parseFloat(String(order.partner_amount ?? 0));
  // Treat 0, NaN, and the old legacy default (20) as "not set"
  if (pa > 0 && pa !== 20) return pa;
  const items = parseItems(order.items);
  const totalQty = items.reduce((s: number, it: any) => s + (parseInt(it.quantity) || 1), 0);
  const pkts = order.number_of_packets ?? totalQty ?? 1;
  return calcEarningByTier(pkts);
}

export async function callNumber(phone: string | undefined) {
  if (!phone) return;
  const num = phone.replace(/\D/g, '');
  if (!num) return;
  Linking.openURL(`tel:${num}`).catch(() =>
    Alert.alert('Could not open dialler', `Please dial ${phone} manually.`)
  );
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/**
 * Stable 3-digit suffix derived from the order id. Used only for the legacy
 * fallback below so each reconstructed label stays unique and looks like the
 * real sequential order numbers.
 */
function idToSeq(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return String(h % 1000).padStart(3, '0');
}

/**
 * Human-readable order label.
 *
 * When the order has a stored `order_number` (the authoritative value generated
 * by the backend, e.g. "MR102"), it is shown as-is.
 *
 * For legacy orders that have no stored order_number, we reconstruct the SAME
 * prefix scheme the backend uses (see NIVA-Backend/lib/orderNumberService.js)
 * from data already available on the client:
 *   - NIVA Foods:      <restaurantFirstLetter><R|N>   (R = room, N = normal)
 *   - NIVA Deliveries: D
 * A stable 3-digit suffix from the order id keeps each label unique and in the
 * same visual format as the real numbers (e.g. "MR247", "D045").
 */
export function orderLabel(order: Order): string {
  const n = order.order_number;
  if (n !== null && n !== undefined && String(n).trim() !== '') return String(n);

  const typeChar = order.delivery_type === 'room' ? 'R' : 'N';
  let prefix: string;
  if (order.restaurant_id) {
    // NIVA Foods → first alphabetic letter of the restaurant name + type char
    const name = (order.vendor_name || '').replace(/[^A-Za-z]/g, '');
    const letter = name ? name.charAt(0).toUpperCase() : 'X';
    prefix = `${letter}${typeChar}`;
  } else {
    // NIVA Deliveries (no restaurant) → fixed "D" prefix
    prefix = 'D';
  }

  return order.id ? `${prefix}${idToSeq(order.id)}` : prefix;
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={sh.section}>
      <TouchableOpacity style={sh.sectionHeader} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <Text style={sh.sectionTitle}>{title}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={NIVA_COLORS.gray400}
        />
      </TouchableOpacity>
      {open && <View style={sh.sectionBody}>{children}</View>}
    </View>
  );
}

function SectionRow({ label, value, blue, bold }: {
  label: string; value: string; blue?: boolean; bold?: boolean;
}) {
  return (
    <View style={sh.row}>
      <Text style={sh.rowLabel}>{label}</Text>
      <TouchableOpacity disabled={!blue} onPress={() => blue && callNumber(value)} style={{ flex: 1 }}>
        <Text style={[sh.rowValue, blue && sh.rowBlue, bold && sh.rowBold]}>{value}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Primary (footer) action supplied by the host screen. Optional — when null the
 * footer only shows the call buttons (e.g. an Active order that is waiting for
 * the restaurant, or any order with no partner action available).
 */
export interface SheetPrimaryAction {
  label: string;
  color: string;
  /** Optional Ionicon rendered before the label (e.g. 'qr-code-outline'). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** When true, shows a spinner and disables the button. */
  busy?: boolean;
  onPress: () => void;
}

interface OrderDetailSheetProps {
  order: Order;
  onClose: () => void;
  primaryAction?: SheetPrimaryAction | null;
}

export function OrderDetailSheet({ order, onClose, primaryAction }: OrderDetailSheetProps) {
  const items = parseItems(order.items);
  const earning = partnerEarning(order);
  const statusColor = ORDER_STATUS_COLORS[order.status] ?? NIVA_COLORS.gray400;
  const isNivaFoods = !!order.restaurant_id;

  // Build timeline appropriate for the order type
  const timeline = isNivaFoods
    ? [
        { label: 'Order Placed', time: order.placed_at },
        { label: 'Accepted', time: order.taken_at },
        { label: 'Prepared', time: order.prepared_at },
        { label: 'Arrived at Campus', time: order.arrived_at_campus_at },
        { label: 'Out for Delivery', time: order.out_for_delivery_at },
        { label: 'Delivered', time: order.delivered_at },
      ]
    : [
        { label: 'Order Placed', time: order.placed_at },
        { label: 'Accepted', time: order.taken_at },
        { label: 'Out for Delivery', time: order.out_for_delivery_at },
        { label: 'Delivered', time: order.delivered_at },
      ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={sh.overlay}>
        <TouchableOpacity style={sh.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={sh.sheet}>
          <View style={sh.handle} />

          {/* Header */}
          <View style={sh.header}>
            <View>
              <View style={sh.headerTitleRow}>
                <Text style={sh.headerTitle}>Order Details</Text>
                <View style={[sh.statusPill, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
                  <View style={[sh.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[sh.statusText, { color: statusColor }]}>
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Text>
                </View>
              </View>
              <Text style={sh.headerSub}>#{orderLabel(order)}</Text>
            </View>
            <View style={sh.headerRight}>
              <Text style={sh.headerEarning}>+₹{earning}</Text>
              <TouchableOpacity onPress={onClose} style={sh.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={NIVA_COLORS.gray400} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Restaurant call row */}
          {(order.vendor_name || order.restaurant_phone) && (
            <View style={sh.restaurantCallRow}>
              <View style={sh.restaurantCallIcon}>
                <Ionicons name="storefront" size={16} color={NIVA_COLORS.gray600} />
              </View>
              <Text style={sh.restaurantCallName} numberOfLines={1}>
                {order.vendor_name ?? 'Restaurant'}
              </Text>
              {order.restaurant_phone && (
                <TouchableOpacity style={sh.callPill} onPress={() => callNumber(order.restaurant_phone)}>
                  <Ionicons name="call-outline" size={13} color={NIVA_COLORS.gray600} />
                  <Text style={sh.callPillText}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Customer */}
            <Section title="CUSTOMER">
              <SectionRow label="Name" value={order.customer_name ?? '—'} />
              {order.customer_phone && <SectionRow label="Phone" value={order.customer_phone} blue />}
              {order.hostel_name && <SectionRow label="Hostel" value={order.hostel_name} />}
              {order.room_number && <SectionRow label="Room" value={order.room_number} />}
              {order.delivery_slot && <SectionRow label="Slot" value={order.delivery_slot} />}
            </Section>

            {/* Items */}
            <Section title={`ITEMS (${items.length})`}>
              {items.map((it: any, i: number) => (
                <View key={i} style={sh.itemRow}>
                  <Text style={sh.itemName}>{it.name}</Text>
                  <Text style={sh.itemDetail}>×{it.quantity || 1}{it.price > 0 ? `  ₹${(it.price * (it.quantity || 1)).toFixed(0)}` : ''}</Text>
                </View>
              ))}
              {order.number_of_packets ? <SectionRow label="Packets" value={String(order.number_of_packets)} /> : null}
            </Section>

            {/* Payment */}
            <Section title="PAYMENT">
              {order.room_delivery_charge != null && (
                <SectionRow label="Delivery" value={`₹${Number(order.room_delivery_charge).toFixed(0)}`} />
              )}
              {/* For NIVA Deliveries COD: show the vendor amount the user entered,
                  not total_amount which includes the 2% platform fee the partner
                  doesn't need to know about. */}
              {!order.restaurant_id && order.payment_method === 'cod' && order.food_amount != null ? (
                <SectionRow label="Collect (COD)" value={`₹${Number(order.food_amount).toFixed(0)}`} bold />
              ) : (
                <SectionRow label="Total" value={`₹${Number(order.total_amount ?? 0).toFixed(0)}`} bold />
              )}
              <SectionRow label="Method" value={order.payment_method === 'cod' ? 'Cash on Delivery' : 'Prepaid'} />
              <View style={sh.earningRow}>
                <Text style={sh.earningLabel}>Your earning</Text>
                <Text style={sh.earningValue}>+₹{earning}</Text>
              </View>
            </Section>

            {/* Timeline */}
            <Section title="TIMELINE" defaultOpen={false}>
              {timeline.map((t, i) => (
                <View key={i} style={sh.timelineRow}>
                  <View style={[sh.timelineDot, t.time ? sh.timelineDotDone : sh.timelineDotPending]} />
                  <Text style={[sh.timelineLabel, t.time && sh.timelineLabelDone]}>{t.label}</Text>
                  {t.time ? <Text style={sh.timelineTime}>{fmtTime(t.time)}</Text> : null}
                </View>
              ))}
            </Section>
          </ScrollView>

          {/* Footer */}
          <View style={sh.footer}>
            {order.customer_phone && (
              <TouchableOpacity style={sh.footerCallBtn} onPress={() => callNumber(order.customer_phone)}>
                <Ionicons name="call-outline" size={14} color={NIVA_COLORS.gray600} />
                <Text style={sh.footerCallLabel}>Customer</Text>
              </TouchableOpacity>
            )}
            {order.restaurant_phone && (
              <TouchableOpacity style={sh.footerCallBtn} onPress={() => callNumber(order.restaurant_phone)}>
                <Ionicons name="storefront-outline" size={14} color={NIVA_COLORS.gray600} />
                <Text style={sh.footerCallLabel}>Restaurant</Text>
              </TouchableOpacity>
            )}
            {primaryAction && (
              <TouchableOpacity
                style={[sh.footerActionBtn, { backgroundColor: primaryAction.color }, primaryAction.busy && sh.btnDisabled]}
                onPress={primaryAction.onPress}
                disabled={primaryAction.busy}
              >
                {primaryAction.busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : primaryAction.icon ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={primaryAction.icon} size={15} color="#fff" />
                    <Text style={sh.footerActionText}>{primaryAction.label}</Text>
                  </View>
                ) : (
                  <Text style={sh.footerActionText}>{primaryAction.label}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Sheet styles (identical to the original Active/Available sheet) ──────────

const sh = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: NIVA_COLORS.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  handle: { width: 36, height: 4, backgroundColor: NIVA_COLORS.gray200, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: 'Montserrat-SemiBold' },
  headerSub: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerEarning: { fontSize: 16, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  closeBtn: { padding: 4 },
  restaurantCallRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: NIVA_COLORS.gray50, borderRadius: 12, padding: 10,
  },
  restaurantCallIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: NIVA_COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  restaurantCallName: { flex: 1, fontSize: 13, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray800 },
  callPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: NIVA_COLORS.gray300, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  callPillText: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray600 },
  section: { marginHorizontal: 16, marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  sectionTitle: { fontSize: 11, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray400, letterSpacing: 0.8 },
  sectionBody: { paddingTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: NIVA_COLORS.gray500 },
  rowValue: { fontSize: 13, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-Medium', textAlign: 'right' },
  rowBlue: { color: '#2563EB', textDecorationLine: 'underline' },
  rowBold: { fontFamily: 'Montserrat-Bold' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  itemName: { fontSize: 13, color: NIVA_COLORS.gray800, flex: 1 },
  itemDetail: { fontSize: 13, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Medium' },
  earningRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: NIVA_COLORS.gray100,
  },
  earningLabel: { fontSize: 13, color: '#166534', fontFamily: 'Montserrat-SemiBold' },
  earningValue: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: '#166534' },
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineDotDone: { backgroundColor: NIVA_COLORS.green },
  timelineDotPending: { backgroundColor: NIVA_COLORS.gray200 },
  timelineLabel: { fontSize: 13, color: NIVA_COLORS.gray400, flex: 1 },
  timelineLabelDone: { color: NIVA_COLORS.gray800, fontFamily: 'Montserrat-Medium' },
  timelineTime: { fontSize: 11, color: NIVA_COLORS.gray400 },
  footer: {
    flexDirection: 'row', gap: 8,
    padding: 14, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: NIVA_COLORS.gray100,
  },
  footerCallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: NIVA_COLORS.gray200,
    borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12,
  },
  footerCallLabel: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },
  footerActionBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  footerActionText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
});
