/**
 * Partner Earnings Tab
 *
 * Two sub-tabs:
 *   BY DATE  — settlement grouped by date (tap to expand orders for that day)
 *   HISTORY  — flat list of all delivered orders; each card has a "View Details"
 *               button that opens a bottom-sheet matching the Active Orders detail
 *               sheet exactly (same layout, same sections, same style).
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, RefreshControl, ActivityIndicator,
  StyleSheet, TouchableOpacity, Modal, ScrollView, Linking, Alert, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { partnerApi } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import type { SettlementDay, SettlementOrder } from '@niva/shared';
import { usePartnerStore } from '../../src/services/partnerStore';

type SubTab = 'summary' | 'history';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

async function callNumber(phone: string | undefined) {
  if (!phone) return;
  const num = phone.replace(/\D/g, '');
  if (!num) return;
  Linking.openURL(`tel:${num}`).catch(() =>
    Alert.alert('Could not open dialler', `Please dial ${phone} manually.`)
  );
}

// ─── Earning helpers ──────────────────────────────────────────────────────────

/** Tier-based earning: 1-2 pkts → ₹15, 3-4 → ₹30, 5-6 → ₹35, 7-8 → ₹40, 9+ → ₹45 */
function earningByTier(packets: number): number {
  if (packets <= 2) return 15;
  if (packets <= 4) return 30;
  if (packets <= 6) return 35;
  if (packets <= 8) return 40;
  return 45;
}

/**
 * Normalise the partnerEarning from a SettlementOrder.
 * The backend already applies the tier fix, but legacy DB rows may still carry
 * ₹20 (the old hardcoded default). Treat that value as "not set" and fall back
 * to the tier calculation so the partner always sees ₹15 for a 1–2 packet order.
 */
function resolveEarning(order: SettlementOrder): number {
  const stored = Number(order.partnerEarning);
  // Treat 0, NaN, and the legacy default (20) as unset
  if (stored > 0 && stored !== 20) return stored;
  const pkts = Array.isArray(order.items) ? order.items.reduce(
    (s, it: any) => s + (parseInt(String(it.quantity)) || 1), 0
  ) : 1;
  return earningByTier(Math.max(pkts, 1));
}

// ─── Collapsible section (identical to active.tsx) ────────────────────────────

function Section({
  title, children, defaultOpen = true,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={sh.section}>
      <TouchableOpacity
        style={sh.sectionHeader}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.7}
      >
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

function SectionRow({
  label, value, blue, bold,
}: {
  label: string; value: string; blue?: boolean; bold?: boolean;
}) {
  return (
    <View style={sh.row}>
      <Text style={sh.rowLabel}>{label}</Text>
      <TouchableOpacity
        disabled={!blue}
        onPress={() => blue && callNumber(value)}
        style={{ flex: 1 }}
      >
        <Text style={[sh.rowValue, blue && sh.rowBlue, bold && sh.rowBold]}>
          {value}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Order Detail Sheet — mirrors active.tsx exactly ──────────────────────────

function OrderDetailSheet({
  order, visible, onClose,
}: {
  order: SettlementOrder | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  // Earnings history orders are always delivered — use a consistent green status pill
  const statusColor = NIVA_COLORS.green;
  const statusLabel = 'Delivered';

  const timeline = [
    { label: 'Order Placed',     time: order.placedAt ?? order.createdAt },
    { label: 'Accepted',         time: order.takenAt },
    ...(order.restaurantId ? [
      { label: 'Arrived at Campus', time: undefined as string | undefined },
    ] : []),
    { label: 'Out for Delivery', time: order.outForDeliveryAt },
    { label: 'Delivered',        time: order.deliveredAt },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <View style={sh.overlay}>
        <TouchableOpacity style={sh.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={sh.sheet}>
          {/* Handle */}
          <View style={sh.handle} />

          {/* Header — same structure as active.tsx */}
          <View style={sh.header}>
            <View>
              <View style={sh.headerTitleRow}>
                <Text style={sh.headerTitle}>Order Details</Text>
                <View style={[sh.statusPill, {
                  backgroundColor: statusColor + '22',
                  borderColor: statusColor + '55',
                }]}>
                  <View style={[sh.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[sh.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
              </View>
              {order.orderNumber
                ? <Text style={sh.headerSub}>#{order.orderNumber}</Text>
                : <Text style={sh.headerSub}>{fmtTime(order.deliveredAt ?? order.createdAt)}</Text>}
            </View>
            <View style={sh.headerRight}>
              <Text style={sh.headerEarning}>+₹{resolveEarning(order).toFixed(0)}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={sh.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={NIVA_COLORS.gray400} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Restaurant call row — same as active.tsx */}
          {(order.vendorName || order.restaurantPhone) && (
            <View style={sh.restaurantCallRow}>
              <View style={sh.restaurantCallIcon}>
                <Ionicons name="storefront" size={16} color={NIVA_COLORS.gray600} />
              </View>
              <Text style={sh.restaurantCallName} numberOfLines={1}>
                {order.vendorName ?? 'Restaurant'}
              </Text>
              {order.restaurantPhone && (
                <TouchableOpacity
                  style={sh.callPill}
                  onPress={() => callNumber(order.restaurantPhone)}
                >
                  <Ionicons name="call-outline" size={13} color={NIVA_COLORS.gray600} />
                  <Text style={sh.callPillText}>Call</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <ScrollView
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Customer */}
            <Section title="CUSTOMER">
              <SectionRow label="Name" value={order.customerName} />
              {order.customerPhone
                ? <SectionRow label="Phone" value={order.customerPhone} blue />
                : null}
              {order.hostelName
                ? <SectionRow label="Hostel" value={order.hostelName} />
                : null}
              {order.roomNumber
                ? <SectionRow label="Room" value={order.roomNumber} />
                : null}
              {order.deliverySlot
                ? <SectionRow label="Slot" value={order.deliverySlot} />
                : null}
            </Section>

            {/* Items */}
            <Section title={`ITEMS (${items.length})`}>
              {items.map((it: any, i: number) => (
                <View key={i} style={sh.itemRow}>
                  <Text style={sh.itemName}>{it.name}</Text>
                  <Text style={sh.itemDetail}>
                    ×{it.quantity || 1}
                    {it.price > 0
                      ? `  ₹${(it.price * (it.quantity || 1)).toFixed(0)}`
                      : ''}
                  </Text>
                </View>
              ))}
            </Section>

            {/* Payment */}
            <Section title="PAYMENT">
              {order.deliveryCharge != null && (
                <SectionRow
                  label="Delivery"
                  value={`₹${Number(order.deliveryCharge).toFixed(0)}`}
                />
              )}
              <SectionRow
                label="Total"
                value={`₹${Number(order.totalAmount).toFixed(0)}`}
                bold
              />
              <SectionRow
                label="Method"
                value={order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Prepaid'}
              />
              <View style={sh.earningRow}>
                <Text style={sh.earningLabel}>Your earning</Text>
                <Text style={sh.earningValue}>+₹{resolveEarning(order).toFixed(0)}</Text>
              </View>
            </Section>

            {/* Timeline */}
            <Section title="TIMELINE" defaultOpen={false}>
              {timeline.map((t, i) => (
                <View key={i} style={sh.timelineRow}>
                  <View style={[
                    sh.timelineDot,
                    t.time ? sh.timelineDotDone : sh.timelineDotPending,
                  ]} />
                  <Text style={[sh.timelineLabel, t.time ? sh.timelineLabelDone : null]}>
                    {t.label}
                  </Text>
                  {t.time
                    ? <Text style={sh.timelineTime}>{fmtTime(t.time)}</Text>
                    : null}
                </View>
              ))}
            </Section>
          </ScrollView>

          {/* Footer — call buttons, same as active.tsx */}
          <View style={sh.footer}>
            {order.customerPhone && (
              <TouchableOpacity
                style={sh.footerCallBtn}
                onPress={() => callNumber(order.customerPhone)}
              >
                <Ionicons name="call-outline" size={14} color={NIVA_COLORS.gray600} />
                <Text style={sh.footerCallLabel}>Customer</Text>
              </TouchableOpacity>
            )}
            {order.restaurantPhone && (
              <TouchableOpacity
                style={sh.footerCallBtn}
                onPress={() => callNumber(order.restaurantPhone)}
              >
                <Ionicons name="storefront-outline" size={14} color={NIVA_COLORS.gray600} />
                <Text style={sh.footerCallLabel}>Restaurant</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EarningsScreen() {
  const { session } = usePartnerStore();
  const [settlements, setSettlements] = useState<SettlementDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('summary');
  // `loaded` becomes true after the FIRST successful fetch. It lets us tell the
  // difference between "we never got data yet" and "the backend confirmed zero
  // earnings". `error` tracks a failed fetch so we never render ₹0 as if it
  // were a real, confirmed balance (Bug 5 accounting-safety requirement).
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail sheet state
  const [detailOrder, setDetailOrder] = useState<SettlementOrder | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const fetchingRef = useRef(false);
  const loadedRef = useRef(false);
  const sessionRef = useRef(session);
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const fetchEarnings = useCallback(async (silent = false) => {
    if (fetchingRef.current) return;
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const res = await partnerApi.getSettlement(currentSession.token);
      // Full replace from the authoritative backend response — idempotent, so
      // repeated refreshes (focus/foreground/pull) can never double-count an
      // order or inflate totals (Bug 6).
      setSettlements(res.settlements || []);
      loadedRef.current = true;
      setLoaded(true);
      setError(null);
    } catch (e: any) {
      // Do NOT silently fall back to zero. Surface the failure so the UI can
      // show an error state instead of a misleading ₹0 balance. Keep any
      // previously-loaded settlements on screen rather than wiping them.
      const status = e?.status ?? e?.data?.status ?? '?';
      const msg = e?.data?.message ?? e?.message ?? 'Could not load earnings.';
      // Log full error for diagnostics (safe — no tokens or PII in e.data for this endpoint)
      console.error('[Earnings] settlement fetch failed', status, JSON.stringify(e?.data ?? e?.message ?? e));
      setError(msg);
    }
    finally {
      fetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchEarnings(); }, [fetchEarnings]);

  // Refresh whenever the tab regains focus. Because the tab navigator keeps
  // this screen mounted, a one-time mount fetch would leave earnings stale
  // after a delivery is completed on another tab. Refetching on focus pulls the
  // authoritative totals every time the partner opens Earnings (Bug 4/5/6).
  useFocusEffect(
    useCallback(() => {
      // Silent when we already have data so we don't flash the full-screen
      // spinner over existing numbers; a visible load only on the first entry.
      fetchEarnings(loadedRef.current);
    }, [fetchEarnings])
  );

  // Reconcile with the backend when the app returns to the foreground
  // (e.g. after being backgrounded during/after a delivery) and after a
  // network reconnect brings the app back to 'active'.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/background|inactive/) && next === 'active') {
        fetchEarnings(true);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [fetchEarnings]);

  const openDetail = useCallback((order: SettlementOrder) => {
    setDetailOrder(order);
    setDetailVisible(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
    // Delay clearing so the slide-down animation finishes before unmounting
    setTimeout(() => setDetailOrder(null), 350);
  }, []);

  // Recompute totals using resolveEarning so legacy ₹20 rows are corrected
  const allOrders = settlements
    .flatMap(d => d.orders)
    .sort((a, b) => {
      const ta = a.deliveredAt ?? a.createdAt ?? '';
      const tb = b.deliveredAt ?? b.createdAt ?? '';
      return tb.localeCompare(ta);
    });

  const totalEarnings = allOrders.reduce((s, o) => s + resolveEarning(o), 0);
  const totalDeliveries = settlements.reduce((n, d) => n + d.totalOrders, 0);

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={NIVA_COLORS.orange} />
      </View>
    );
  }

  // Failed to load AND we have never successfully loaded → show a real error
  // state with a retry, NOT a ₹0 balance that looks like confirmed earnings.
  if (error && !loaded) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>Couldn’t load earnings</Text>
        <Text style={s.emptySubtitle}>{error}</Text>
        <TouchableOpacity
          style={s.retryBtn}
          onPress={() => { setLoading(true); fetchEarnings(); }}
          activeOpacity={0.8}
        >
          <Text style={s.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Summary header */}
      <View style={s.summary}>
        <Text style={s.summaryLabel}>TOTAL EARNINGS</Text>
        <Text style={s.summaryAmount}>₹{totalEarnings.toFixed(0)}</Text>
        <Text style={s.summaryMeta}>
          {totalDeliveries} {totalDeliveries === 1 ? 'delivery' : 'deliveries'}
        </Text>
      </View>

      {/* Stale-data notice: we have previously-loaded numbers on screen but the
          latest refresh failed. Make it explicit so the partner knows the
          figures may be out of date rather than silently trusting them. */}
      {error && loaded && (
        <TouchableOpacity
          style={s.staleBanner}
          onPress={() => fetchEarnings(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="cloud-offline-outline" size={14} color="#92400E" />
          <Text style={s.staleBannerText}>
            Showing last saved earnings — tap to retry refresh.
          </Text>
        </TouchableOpacity>
      )}

      {/* Sub-tab bar */}
      <View style={s.tabBar}>
        {(['summary', 'history'] as SubTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, subTab === tab && s.tabActive]}
            onPress={() => setSubTab(tab)}
          >
            <Text style={[s.tabText, subTab === tab && s.tabTextActive]}>
              {tab === 'summary' ? 'By Date' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* BY DATE tab */}
      {subTab === 'summary' && (
        settlements.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No earnings yet</Text>
            <Text style={s.emptySubtitle}>Completed deliveries will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={settlements}
            keyExtractor={d => d.date}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchEarnings(true); }}
                tintColor={NIVA_COLORS.orange}
              />
            }
            renderItem={({ item: day }) => (
              <TouchableOpacity
                style={s.dayCard}
                onPress={() => setExpandedDate(expandedDate === day.date ? null : day.date)}
                activeOpacity={0.8}
              >
                <View style={s.dayHeader}>
                  <View>
                    <Text style={s.dayDate}>{formatDate(day.date)}</Text>
                    <Text style={s.dayOrderCount}>
                      {day.totalOrders} {day.totalOrders === 1 ? 'delivery' : 'deliveries'}
                    </Text>
                  </View>
                  <View style={s.dayRight}>
                    <Text style={s.dayEarnings}>
                      ₹{day.orders.reduce((s, o) => s + resolveEarning(o), 0).toFixed(0)}
                    </Text>
                    <Text style={s.expandChevron}>
                      {expandedDate === day.date ? '▲' : '▼'}
                    </Text>
                  </View>
                </View>

                {expandedDate === day.date && day.orders.length > 0 && (
                  <View style={s.dayOrders}>
                    {day.orders.map(order => (
                      <View key={order.id} style={s.orderRow}>
                        <View style={s.orderLeft}>
                          <Text style={s.orderCustomer}>{order.customerName}</Text>
                          {order.hostelName ? (
                            <Text style={s.orderHostel}>
                              {order.hostelName}
                              {order.roomNumber ? ` · Room ${order.roomNumber}` : ''}
                            </Text>
                          ) : null}
                          {order.deliverySlot
                            ? <Text style={s.orderSlot}>Slot: {order.deliverySlot}</Text>
                            : null}
                        </View>
                        <Text style={s.orderEarning}>
                          ₹{resolveEarning(order).toFixed(0)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          />
        )
      )}

      {/* HISTORY tab */}
      {subTab === 'history' && (
        allOrders.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No deliveries yet</Text>
            <Text style={s.emptySubtitle}>Your completed deliveries will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={allOrders}
            keyExtractor={o => o.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchEarnings(true); }}
                tintColor={NIVA_COLORS.orange}
              />
            }
            renderItem={({ item: order }) => (
              <View style={s.historyCard}>
                <View style={s.historyTop}>
                  <View style={s.historyLeft}>
                    <Text style={s.historyCustomer}>{order.customerName}</Text>
                    {order.hostelName ? (
                      <Text style={s.historyAddress}>
                        {order.hostelName}
                        {order.roomNumber ? ` · Room ${order.roomNumber}` : ''}
                      </Text>
                    ) : null}
                    <Text style={s.historyTime}>
                      {fmtTime(order.deliveredAt ?? order.createdAt)}
                    </Text>
                  </View>
                  <View style={s.historyRight}>
                    <Text style={s.historyEarning}>
                      +₹{resolveEarning(order).toFixed(0)}
                    </Text>
                    <View style={[
                      s.historyBadge,
                      order.paymentMethod === 'cod' ? s.historyBadgeCod : s.historyBadgePrepaid,
                    ]}>
                      <Text style={[
                        s.historyBadgeText,
                        order.paymentMethod === 'cod'
                          ? s.historyBadgeTextCod
                          : s.historyBadgeTextPrepaid,
                      ]}>
                        {order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}
                      </Text>
                    </View>
                  </View>
                </View>
                {order.deliverySlot
                  ? <Text style={s.historySlot}>Slot: {order.deliverySlot}</Text>
                  : null}
                {/* View Details button */}
                <TouchableOpacity
                  style={s.detailsBtn}
                  onPress={() => openDetail(order)}
                  activeOpacity={0.7}
                >
                  <Text style={s.detailsBtnText}>View Details</Text>
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          />
        )
      )}

      {/* Order detail bottom-sheet */}
      <OrderDetailSheet
        order={detailOrder}
        visible={detailVisible}
        onClose={closeDetail}
      />
    </View>
  );
}

// ─── Main styles ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summary: {
    backgroundColor: NIVA_COLORS.black,
    paddingTop: 28, paddingBottom: 24, paddingHorizontal: 24,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Montserrat-Bold', letterSpacing: 1.2, textTransform: 'uppercase',
  },
  summaryAmount: {
    fontSize: 40, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.white, marginTop: 4,
  },
  summaryMeta: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },

  tabBar: {
    flexDirection: 'row', backgroundColor: NIVA_COLORS.white,
    borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: NIVA_COLORS.black },
  tabText: { fontSize: 13, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Medium' },
  tabTextActive: { color: NIVA_COLORS.black, fontFamily: 'Montserrat-Bold' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 17, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray600 },
  emptySubtitle: {
    fontSize: 13, color: NIVA_COLORS.gray400, textAlign: 'center', marginTop: 6,
  },
  retryBtn: {
    marginTop: 18, backgroundColor: NIVA_COLORS.black,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32,
  },
  retryBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Montserrat-Bold' },
  staleBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FEF3C7', paddingVertical: 8, paddingHorizontal: 12,
  },
  staleBannerText: { fontSize: 12, color: '#92400E', fontFamily: 'Montserrat-SemiBold' },

  // By Date
  dayCard: {
    backgroundColor: NIVA_COLORS.white, borderRadius: 14, marginBottom: 10,
    overflow: 'hidden', elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14,
  },
  dayDate: { fontSize: 14, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900 },
  dayOrderCount: { fontSize: 12, color: NIVA_COLORS.gray400, marginTop: 2 },
  dayRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayEarnings: { fontSize: 16, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.green },
  expandChevron: { fontSize: 10, color: NIVA_COLORS.gray400 },
  dayOrders: {
    borderTopWidth: 1, borderTopColor: NIVA_COLORS.gray100,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  orderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray50,
  },
  orderLeft: { flex: 1, marginRight: 8 },
  orderCustomer: { fontSize: 13, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray800 },
  orderHostel: { fontSize: 12, color: NIVA_COLORS.gray400, marginTop: 1 },
  orderSlot: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 1 },
  orderEarning: { fontSize: 13, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.green },

  // History tab
  historyCard: {
    backgroundColor: NIVA_COLORS.white, borderRadius: 14, marginBottom: 8,
    padding: 14, elevation: 1,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  historyTop: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  historyLeft: { flex: 1, marginRight: 12 },
  historyCustomer: { fontSize: 14, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray900 },
  historyAddress: { fontSize: 12, color: NIVA_COLORS.gray500, marginTop: 2 },
  historyTime: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 3 },
  historySlot: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 4 },
  historyRight: { alignItems: 'flex-end', gap: 6 },
  historyEarning: { fontSize: 16, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.green },
  historyBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  historyBadgeCod: { backgroundColor: '#FEF3C7' },
  historyBadgePrepaid: { backgroundColor: '#ECFDF5' },
  historyBadgeText: { fontSize: 11, fontFamily: 'Montserrat-SemiBold' },
  historyBadgeTextCod: { color: '#92400E' },
  historyBadgeTextPrepaid: { color: '#166534' },
  detailsBtn: {
    marginTop: 10, borderWidth: 1.5, borderColor: NIVA_COLORS.gray200,
    borderRadius: 12, paddingVertical: 11, alignItems: 'center',
  },
  detailsBtnText: {
    fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700,
  },
});

// ─── Sheet styles — copied exactly from active.tsx ────────────────────────────

const sh = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: NIVA_COLORS.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  handle: {
    width: 36, height: 4, backgroundColor: NIVA_COLORS.gray200,
    borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
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
  restaurantCallIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: NIVA_COLORS.gray200, alignItems: 'center', justifyContent: 'center',
  },
  restaurantCallName: {
    flex: 1, fontSize: 13, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray800,
  },
  callPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: NIVA_COLORS.gray300,
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5,
  },
  callPillText: { fontSize: 12, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray600 },
  section: { marginHorizontal: 16, marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100,
  },
  sectionTitle: {
    fontSize: 11, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray400, letterSpacing: 0.8,
  },
  sectionBody: { paddingTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: NIVA_COLORS.gray500 },
  rowValue: {
    fontSize: 13, color: NIVA_COLORS.gray900,
    fontFamily: 'Montserrat-Medium', textAlign: 'right',
  },
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
});
