/**
 * Earnings Tab — calendar view matching the partner app design.
 *
 * Layout:
 *   1. Green header — total earnings + delivered order count
 *   2. Today / This Week / This Month summary cards
 *   3. Monthly calendar — dots on days that have delivered orders
 *   4. Selected-day panel — lists each order for that day with earning
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator,
  StyleSheet, TouchableOpacity, Modal, Linking, Alert,
} from 'react-native';
import { restaurantApi } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import type { Order, OrderItem } from '@niva/shared';
import { useRestaurantStore } from '../../src/services/restaurantStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseItems(items: OrderItem[] | string | null): OrderItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try { return JSON.parse(items as string); } catch { return []; }
}

function getOrderEarning(order: Order): number {
  const foodAmount = parseFloat(String(order.food_amount ?? 0));
  if (foodAmount > 0) return foodAmount;
  const items = parseItems(order.items);
  return items.reduce((sum, it: any) =>
    sum + (parseFloat(it.price || 0) * (parseInt(it.quantity) || 1)), 0);
}

/** Returns YYYY-MM-DD in local time */
function toLocalDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function todayStr(): string {
  return toLocalDate(new Date().toISOString());
}

function startOfWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return toLocalDate(d.toISOString());
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return toLocalDate(d.toISOString());
}

// ─── Calendar logic ───────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const DAY_NAMES = ['S','M','T','W','T','F','S'];

/** Returns the days grid for a given year/month (0-indexed month). */
function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, amount, count }: { label: string; amount: number; count: number }) {
  return (
    <View style={s.summaryCard}>
      <Text style={s.summaryCardAmount}>₹{amount.toFixed(0)}</Text>
      <Text style={s.summaryCardLabel}>{label}</Text>
      {count > 0 && <Text style={s.summaryCardCount}>{count} order{count !== 1 ? 's' : ''}</Text>}
    </View>
  );
}

function OrderRowItem({ order, onPress }: { order: Order; onPress: () => void }) {
  const items = parseItems(order.items);
  const summary = items.slice(0, 2).map((i: any) => i.name).join(', ') +
    (items.length > 2 ? ` +${items.length - 2}` : '');
  const earning = getOrderEarning(order);

  return (
    <TouchableOpacity style={s.orderRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.orderLeft}>
        <Text style={s.orderNum}>#{order.order_number}</Text>
        {summary ? <Text style={s.orderSummary} numberOfLines={1}>{summary}</Text> : null}
        <Text style={s.orderTime}>{formatTime(order.delivered_at ?? order.created_at ?? '')}</Text>
      </View>
      <View style={s.orderRight}>
        <Text style={s.orderEarning}>₹{earning.toFixed(0)}</Text>
        <Text style={s.orderEarnLabel}>earned</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Order detail modal ───────────────────────────────────────────────────────

function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const items = parseItems(order.items);
  const earning = getOrderEarning(order);
  const deliveryCharge = parseFloat(String(order.room_delivery_charge ?? 0));
  const maintenance = parseFloat(String(order.maintenance_amount ?? 0));
  const total = parseFloat(String(order.total_amount ?? 0));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <TouchableOpacity style={s.modalBg} onPress={onClose} activeOpacity={1} />
        <View style={s.modalSheet}>
          <View style={s.handle} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Earning Details</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
            {/* Highlight */}
            <View style={s.earningHighlight}>
              <Text style={s.earningHighlightLabel}>Restaurant Earned</Text>
              <Text style={s.earningHighlightValue}>₹{earning.toFixed(0)}</Text>
            </View>

            {/* Customer */}
            <View style={s.detailSection}>
              <Text style={s.detailSectionTitle}>Customer</Text>
              {order.customer_name ? <DetailPair label="Name" value={order.customer_name} /> : null}
              {order.hostel_name ? <DetailPair label="Hostel" value={order.hostel_name} /> : null}
              {order.room_number ? <DetailPair label="Room" value={order.room_number} /> : null}
              <DetailPair label="Time" value={formatTime(order.created_at ?? '')} />
            </View>

            {/* Items */}
            {items.length > 0 && (
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>Items</Text>
                {items.map((it: any, i: number) => (
                  <View key={i} style={s.itemRow}>
                    <Text style={s.itemName}>{it.name} ×{it.quantity || 1}</Text>
                    {it.price > 0 && (
                      <Text style={s.itemPrice}>₹{(it.price * (it.quantity || 1)).toFixed(0)}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Breakdown */}
            {(deliveryCharge > 0 || maintenance > 0 || total > 0) && (
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>Breakdown</Text>
                {deliveryCharge > 0 && <DetailPair label="Delivery Charge" value={`₹${deliveryCharge.toFixed(0)}`} />}
                {maintenance > 0 && <DetailPair label="Platform Fee" value={`₹${maintenance.toFixed(0)}`} />}
                {total > 0 && <DetailPair label="Customer Paid" value={`₹${total.toFixed(0)}`} bold />}
              </View>
            )}

            {/* Payment */}
            <View style={s.detailSection}>
              <Text style={s.detailSectionTitle}>Payment</Text>
              <DetailPair
                label="Method"
                value={order.payment_method === 'cod' ? 'Cash on Delivery' : 'Paid Online'}
              />
            </View>
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity style={s.closeFullBtn} onPress={onClose}>
              <Text style={s.closeFullBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailPair({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ fontSize: 12, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Regular' }}>{label}</Text>
      <Text style={{ fontSize: 12, color: NIVA_COLORS.gray900, fontFamily: bold ? 'Montserrat-Bold' : 'Montserrat-Medium' }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Calendar component ───────────────────────────────────────────────────────

interface CalendarProps {
  year: number;
  month: number; // 0-indexed
  ordersByDate: Record<string, Order[]>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

function Calendar({ year, month, ordersByDate, selectedDate, onSelectDate, onPrevMonth, onNextMonth }: CalendarProps) {
  const cells = buildCalendarDays(year, month);
  const today = todayStr();

  return (
    <View style={s.calendar}>
      {/* Month nav */}
      <View style={s.calNav}>
        <TouchableOpacity onPress={onPrevMonth} style={s.navBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.calMonth}>{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={onNextMonth} style={s.navBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day name headers */}
      <View style={s.calRow}>
        {DAY_NAMES.map((d, i) => (
          <View key={i} style={s.calCell}>
            <Text style={s.calDayName}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Date cells */}
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={s.calRow}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (!day) return <View key={col} style={s.calCell} />;
            const key = dateKey(year, month, day);
            const hasOrders = !!(ordersByDate[key]?.length);
            const isToday = key === today;
            const isSelected = key === selectedDate;
            const orderCount = ordersByDate[key]?.length ?? 0;

            return (
              <TouchableOpacity
                key={col}
                style={[
                  s.calCell,
                  isSelected && s.calCellSelected,
                  isToday && !isSelected && s.calCellToday,
                ]}
                onPress={() => onSelectDate(key)}
                activeOpacity={0.7}
              >
                <Text style={[
                  s.calDayNum,
                  isSelected && s.calDayNumSelected,
                  isToday && !isSelected && s.calDayNumToday,
                ]}>
                  {day}
                </Text>
                {hasOrders && (
                  <View style={[s.dot, isSelected && s.dotSelected]}>
                    {orderCount > 1 && (
                      <Text style={[s.dotCount, isSelected && s.dotCountSelected]}>{orderCount}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EarningsScreen() {
  const { session } = useRestaurantStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<Order | null>(null);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr());

  const fetchOrders = useCallback(async (silent = false) => {
    if (!session) return;
    if (!silent) setLoading(true);
    try {
      const res = await restaurantApi.getOrders(session.token);
      const delivered = (res.orders || []).filter((o: Order) => o.status === 'delivered');
      setOrders(delivered);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const totalEarnings = useMemo(
    () => orders.reduce((sum, o) => sum + getOrderEarning(o), 0),
    [orders]
  );

  const ordersByDate = useMemo(() => {
    const map: Record<string, Order[]> = {};
    for (const o of orders) {
      const key = toLocalDate(o.delivered_at ?? o.created_at ?? new Date().toISOString());
      if (!map[key]) map[key] = [];
      map[key].push(o);
    }
    return map;
  }, [orders]);

  const today = todayStr();
  const wStart = startOfWeek();
  const mStart = startOfMonth();

  const todayEarnings = useMemo(() =>
    (ordersByDate[today] ?? []).reduce((s, o) => s + getOrderEarning(o), 0),
    [ordersByDate, today]
  );
  const weekEarnings = useMemo(() =>
    orders.filter(o => toLocalDate(o.delivered_at ?? o.created_at ?? '') >= wStart)
      .reduce((s, o) => s + getOrderEarning(o), 0),
    [orders, wStart]
  );
  const monthEarnings = useMemo(() =>
    orders.filter(o => toLocalDate(o.delivered_at ?? o.created_at ?? '') >= mStart)
      .reduce((s, o) => s + getOrderEarning(o), 0),
    [orders, mStart]
  );

  const selectedDayOrders = selectedDate ? (ordersByDate[selectedDate] ?? []) : [];
  const selectedDayEarning = selectedDayOrders.reduce((s, o) => s + getOrderEarning(o), 0);

  const formattedSelectedDate = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : '';

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }

  if (loading) {
    return <View style={s.loader}><ActivityIndicator size="large" color="#fff" style={{ backgroundColor: NIVA_COLORS.green, padding: 20, borderRadius: 50 }} /></View>;
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} tintColor={NIVA_COLORS.green} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Green header ── */}
      <View style={s.header}>
        <Text style={s.headerLabel}>TOTAL EARNINGS</Text>
        <Text style={s.headerAmount}>₹{totalEarnings.toFixed(0)}</Text>
        <Text style={s.headerSub}>{orders.length} delivered order{orders.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* ── Summary cards ── */}
      <View style={s.summaryRow}>
        <SummaryCard label="Today" amount={todayEarnings} count={(ordersByDate[today] ?? []).length} />
        <SummaryCard label="This Week" amount={weekEarnings} count={orders.filter(o => toLocalDate(o.delivered_at ?? o.created_at ?? '') >= wStart).length} />
        <SummaryCard label="This Month" amount={monthEarnings} count={orders.filter(o => toLocalDate(o.delivered_at ?? o.created_at ?? '') >= mStart).length} />
      </View>

      {/* ── Calendar ── */}
      <View style={s.calendarWrapper}>
        <Calendar
          year={calYear}
          month={calMonth}
          ordersByDate={ordersByDate}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
        />
      </View>

      {/* ── Selected day orders ── */}
      {selectedDate && (
        <View style={s.dayPanel}>
          <View style={s.dayPanelHeader}>
            <View>
              <Text style={s.dayPanelDate}>{formattedSelectedDate}</Text>
              <Text style={s.dayPanelSub}>
                {selectedDayOrders.length > 0
                  ? `${selectedDayOrders.length} order${selectedDayOrders.length !== 1 ? 's' : ''} · ₹${selectedDayEarning.toFixed(0)} earned`
                  : 'No delivered orders'}
              </Text>
            </View>
          </View>

          {selectedDayOrders.length === 0 ? (
            <View style={s.dayEmpty}>
              <Text style={s.dayEmptyText}>No orders delivered on this day</Text>
            </View>
          ) : (
            selectedDayOrders.map(o => (
              <OrderRowItem key={o.id} order={o} onPress={() => setSelectedDetail(o)} />
            ))
          )}
        </View>
      )}

      <View style={{ height: 32 }} />

      {/* ── Order detail modal ── */}
      {selectedDetail && (
        <OrderDetailModal order={selectedDetail} onClose={() => setSelectedDetail(null)} />
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GREEN = '#1a6b3c';
const GREEN_LIGHT = '#ECFDF5';
const GREEN_DARK = '#14532d';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' },

  // Header
  header: {
    backgroundColor: GREEN,
    paddingTop: 28, paddingBottom: 28, paddingHorizontal: 24,
  },
  headerLabel: {
    fontSize: 11, fontFamily: 'Montserrat-Bold', color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4,
  },
  headerAmount: { fontSize: 40, fontFamily: 'Montserrat-Bold', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, fontFamily: 'Montserrat-Regular' },

  // Summary row
  summaryRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 4,
  },
  summaryCard: {
    flex: 1, backgroundColor: NIVA_COLORS.white, borderRadius: 14,
    padding: 12, alignItems: 'center', elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  summaryCardAmount: { fontSize: 16, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  summaryCardLabel: { fontSize: 10, color: NIVA_COLORS.gray400, marginTop: 2, fontFamily: 'Montserrat-Regular' },
  summaryCardCount: { fontSize: 10, color: GREEN, marginTop: 1, fontFamily: 'Montserrat-SemiBold' },

  // Calendar wrapper
  calendarWrapper: {
    marginHorizontal: 12, marginTop: 12,
    backgroundColor: NIVA_COLORS.white, borderRadius: 16,
    elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  calendar: { padding: 16 },
  calNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 22, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Regular' },
  calMonth: { fontSize: 15, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  calRow: { flexDirection: 'row' },
  calCell: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, margin: 1,
  },
  calCellSelected: { backgroundColor: GREEN },
  calCellToday: { backgroundColor: GREEN_LIGHT },
  calDayName: { fontSize: 11, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-SemiBold' },
  calDayNum: { fontSize: 13, color: NIVA_COLORS.gray700, fontFamily: 'Montserrat-Medium' },
  calDayNumSelected: { color: '#fff', fontFamily: 'Montserrat-Bold' },
  calDayNumToday: { color: GREEN, fontFamily: 'Montserrat-Bold' },
  dot: {
    width: 16, height: 6, borderRadius: 3, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  dotSelected: { backgroundColor: 'rgba(255,255,255,0.7)' },
  dotCount: { fontSize: 8, color: '#fff', fontFamily: 'Montserrat-Bold', lineHeight: 9 },
  dotCountSelected: { color: GREEN },

  // Day panel
  dayPanel: {
    marginHorizontal: 12, marginTop: 12,
    backgroundColor: NIVA_COLORS.white, borderRadius: 16,
    elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  dayPanelHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  dayPanelDate: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  dayPanelSub: { fontSize: 12, color: NIVA_COLORS.gray400, marginTop: 2, fontFamily: 'Montserrat-Regular' },
  dayEmpty: { padding: 24, alignItems: 'center' },
  dayEmptyText: { fontSize: 13, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Regular' },

  // Order row
  orderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray50,
  },
  orderLeft: { flex: 1 },
  orderNum: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900 },
  orderSummary: { fontSize: 12, color: NIVA_COLORS.gray500, marginTop: 1, fontFamily: 'Montserrat-Regular' },
  orderTime: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 1, fontFamily: 'Montserrat-Regular' },
  orderRight: { alignItems: 'flex-end' },
  orderEarning: { fontSize: 15, fontFamily: 'Montserrat-Bold', color: GREEN },
  orderEarnLabel: { fontSize: 10, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Regular' },

  // Modal
  modalOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: NIVA_COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  handle: { width: 36, height: 4, backgroundColor: NIVA_COLORS.gray200, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  modalTitle: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900 },
  closeBtn: { padding: 4 },
  closeText: { fontSize: 16, color: NIVA_COLORS.gray400 },
  earningHighlight: {
    backgroundColor: GREEN_LIGHT, borderRadius: 14, padding: 16, alignItems: 'center',
  },
  earningHighlightLabel: {
    fontSize: 11, color: GREEN, fontFamily: 'Montserrat-SemiBold',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  earningHighlightValue: { fontSize: 32, fontFamily: 'Montserrat-Bold', color: GREEN, marginTop: 4 },
  detailSection: { backgroundColor: NIVA_COLORS.gray50, borderRadius: 12, padding: 12 },
  detailSectionTitle: {
    fontSize: 10, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray400,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  itemName: { fontSize: 12, color: NIVA_COLORS.gray800, flex: 1, fontFamily: 'Montserrat-Regular' },
  itemPrice: { fontSize: 12, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray900 },
  modalFooter: {
    padding: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: NIVA_COLORS.gray100,
  },
  closeFullBtn: { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  closeFullBtnText: { color: '#fff', fontFamily: 'Montserrat-SemiBold', fontSize: 14 },
});
