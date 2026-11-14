/**
 * NIVA Checkout Screen
 *
 * Contract mirrors the production website (NIVA-Frontend/src/pages/CheckoutPage.js).
 * Two independent choices:
 *   • deliveryMode  — WHEN: 'instant' | 'slot'
 *   • deliveryType  — WHERE: 'room' | 'block' | 'normal'
 * The backend ALWAYS requires a valid `deliverySlot` + `deliveryDate`, so an
 * instant order sends 'Instant Delivery' + today's date.
 *
 * Payment:
 *   • Online (prepaid): POST /api/payment/create-order → Razorpay → /api/payment/verify
 *   • COD (advance):    POST /api/orders/foods-cod-initiate → Razorpay (advance)
 *                       → /api/payment/verify-foods-cod-advance
 *
 * The backend is the single source of truth for every amount and for order
 * creation. We never treat the Razorpay success callback alone as proof an
 * order exists — verify (and recover) confirm it server-side.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../src/theme';
import { useCart } from '../src/services/cartStore';
import { useCustomerStore } from '../src/services/customerStore';
import { addressApi, checkoutApi, couponApi } from '../src/services/nivaApi';
import type { SavedAddress, CheckoutPayload } from '../src/services/nivaApi';
import { BLOCK_LOCATIONS, type BlockLocation, normalizeGender } from '../src/data/hostelData';

type DeliveryType = 'room' | 'block' | 'normal';
type DeliveryMode = 'instant' | 'slot';
type PaymentMethod = 'online' | 'cod';

// ── Delivery slots (must match backend VALID_DELIVERY_SLOTS) ─────────────────
const SLOTS: { value: string; label: string; endHour: number }[] = [
  { value: '12:00 PM - 2:00 PM', label: '12:00 – 2:00 PM', endHour: 14 },
  { value: '6:30 PM - 9:00 PM', label: '6:30 – 9:00 PM', endHour: 21 },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toDateStr(new Date());

/** Next three selectable delivery dates (today + 2). */
function dateOptions(): string[] {
  return [0, 1, 2].map((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return toDateStr(d);
  });
}

function labelForDate(dateStr: string): string {
  if (dateStr === todayStr()) return 'Today';
  const tm = new Date();
  tm.setDate(tm.getDate() + 1);
  if (dateStr === toDateStr(tm)) return 'Tomorrow';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** A slot is expired only for today once its end hour has passed. */
function isSlotExpired(slotValue: string, dateStr: string): boolean {
  if (dateStr !== todayStr()) return false;
  const slot = SLOTS.find((s) => s.value === slotValue);
  if (!slot) return false;
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 >= slot.endHour;
}

export default function CheckoutScreen() {
  const { items, vendorId: restaurantId, restaurantName, subtotal, totalItems, clearCart } = useCart();
  const { session, customer } = useCustomerStore();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('room');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('instant');
  const [deliveryBlock, setDeliveryBlock] = useState<BlockLocation | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState<string>(todayStr());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState<{ discount: number; code: string } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  // Guard — checkout requires login
  useEffect(() => {
    if (!session) router.replace('/(auth)/login');
  }, [session]);

  // Load saved addresses
  useEffect(() => {
    if (!session || !customer) return;
    addressApi.getAddresses(customer.id, session.token)
      .then((r) => {
        const list = r.data ?? [];
        setAddresses(list);
        const def = list.find((a) => a.is_default);
        if (def) setSelectedAddressId(def.id);
        else if (list.length > 0) setSelectedAddressId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingAddresses(false));
  }, [session, customer]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  const DELIVERY_OPTIONS: { key: DeliveryType; label: string; icon: string; desc: string }[] = [
    { key: 'room', label: 'Room Delivery', icon: '🏠', desc: 'Delivered to your hostel room' },
    { key: 'block', label: 'Block Delivery', icon: '🏢', desc: 'Pick up at V-Block, SR-Block, X-Lab' },
    { key: 'normal', label: 'Normal Delivery', icon: '🛵', desc: 'Restaurant-managed delivery' },
  ];

  // Delivery-fee estimate (DISPLAY ONLY — the backend is authoritative).
  // NIVA Foods room fee is quantity-based: ≤4 items → ₹19, >4 → ₹29.
  const roomFee = totalItems <= 4 ? 19 : 29;
  const getDeliveryFee = () =>
    deliveryType === 'room' ? roomFee : deliveryType === 'block' ? 9 : 0;

  const deliveryFee = getDeliveryFee();
  const couponDiscount = couponApplied?.discount ?? 0;
  const total = Math.max(0, subtotal + deliveryFee - couponDiscount);

  const hostelTypeForOrder = (): 'boys' | 'girls' | null =>
    deliveryType === 'room' && selectedAddress?.hostel_type
      ? normalizeGender(selectedAddress.hostel_type)
      : null;

  const buildPayload = (): CheckoutPayload => ({
    customerId: customer!.id,
    vendorId: restaurantId,
    cartItems: items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      productType: i.productType ?? 'fastfood',
      name: i.name,
      type: i.productType ?? 'fastfood',
    })),
    deliveryMode,
    deliverySlot: deliveryMode === 'instant' ? 'Instant Delivery' : selectedSlot,
    deliveryDate: deliveryMode === 'instant' ? todayStr() : deliveryDate,
    deliveryType,
    hostelType: hostelTypeForOrder(),
    hostelName: deliveryType === 'room' ? (selectedAddress?.hostel_name ?? null) : null,
    roomNumber: deliveryType === 'room' ? (selectedAddress?.room_number ?? null) : null,
    deliveryBlock: deliveryType === 'block' ? deliveryBlock : null,
    roomDeliveryCharge: deliveryType === 'room' ? roomFee : 0,
    couponCode: couponApplied?.code ?? null,
  });

  const validateCoupon = async () => {
    if (!couponCode.trim() || !session) return;
    setCheckingCoupon(true); setCouponError('');
    try {
      const res = await couponApi.validateCoupon({
        couponCode: couponCode.trim().toUpperCase(),
        cartItems: items.map((i) => ({
          id: i.id, quantity: i.quantity, price: i.price, name: i.name, restaurant_id: i.restaurant_id ?? null,
        })),
        deliveryType,
        hostelType: hostelTypeForOrder(),
        hostelName: deliveryType === 'room' ? (selectedAddress?.hostel_name ?? null) : null,
        customerId: customer?.id ?? null,
      }, session.token);

      const discount = res.pricing?.discountAmount ?? 0;
      if (res.success && (discount > 0 || res.coupon?.freeRoomDelivery)) {
        setCouponApplied({ discount, code: res.coupon?.code ?? couponCode.trim().toUpperCase() });
        setCouponError('');
      } else {
        setCouponError(res.message ?? 'This coupon does not apply to your order.');
      }
    } catch (e: any) {
      setCouponError(e?.message ?? 'Failed to validate coupon.');
    } finally { setCheckingCoupon(false); }
  };

  // ── Pre-flight validation shared by online + COD ───────────────────────────
  const validateSelection = (): boolean => {
    if (!restaurantId) {
      Alert.alert('Error', 'No restaurant selected. Please go back and add items.');
      return false;
    }
    if (deliveryType === 'room' && !selectedAddress) {
      Alert.alert('Select Address', 'Please select a delivery address first.');
      return false;
    }
    if (deliveryType === 'block' && !deliveryBlock) {
      Alert.alert('Select Block', 'Please select a delivery block.');
      return false;
    }
    if (deliveryMode === 'slot') {
      if (!selectedSlot) { Alert.alert('Select Slot', 'Please select a delivery slot.'); return false; }
      if (isSlotExpired(selectedSlot, deliveryDate)) {
        Alert.alert('Slot Expired', 'That slot has passed for the selected date. Pick another slot or date.');
        return false;
      }
    }
    return true;
  };

  const verifyCustomerFields = () => ({
    customer_id: customer!.id,
    customer_name: customer!.name,
    customer_email: customer!.email,
    customer_phone: customer!.phone ?? '',
    customer_college: customer!.college ?? '',
  });

  const handleApiError = (res: { message?: string; error_code?: string }, fallback: string) => {
    Alert.alert('Could not place order', res.message ?? fallback);
  };

  const handlePlaceOrder = async () => {
    if (!session || !customer || items.length === 0) return;
    if (!validateSelection()) return;

    setLoading(true);
    try {
      const payload = buildPayload();
      if (paymentMethod === 'cod') {
        await placeCodOrder(payload);
      } else {
        await placeOnlineOrder(payload);
      }
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  // ── Online (prepaid) ───────────────────────────────────────────────────────
  const placeOnlineOrder = async (payload: CheckoutPayload) => {
    const res = await checkoutApi.createOrder(payload, session!.token);
    if (!res.success || !res.order?.id || !res.key) {
      setLoading(false);
      handleApiError(res, 'Could not start payment. Please try again.');
      return;
    }

    openRazorpay({
      key: res.key,
      amount: res.order.amount,          // paise — server authoritative
      orderId: res.order.id,
      name: 'NIVA',
      description: restaurantName ?? 'Food Order',
      customerName: customer!.name,
      customerEmail: customer!.email,
      customerPhone: customer!.phone ?? '',
      onSuccess: async (paymentRes: any) => {
        try {
          let orderId: string | undefined;
          try {
            const verifyRes = await checkoutApi.verifyPayment({
              razorpay_order_id: paymentRes.razorpay_order_id,
              razorpay_payment_id: paymentRes.razorpay_payment_id,
              razorpay_signature: paymentRes.razorpay_signature,
              ...verifyCustomerFields(),
            }, session!.token);
            orderId = verifyRes.order?.id;
          } catch {
            // Verify failed — try recover before giving up (webhook may still create it).
            try {
              const recover = await checkoutApi.recoverPayment({
                razorpay_order_id: paymentRes.razorpay_order_id,
                razorpay_payment_id: paymentRes.razorpay_payment_id,
                customer_id: customer!.id,
              }, session!.token);
              orderId = recover.order?.id;
            } catch { /* fall through */ }
          }

          clearCart();
          if (orderId) {
            router.replace(`/order/${orderId}` as any);
          } else {
            Alert.alert(
              'Payment Recorded',
              "Payment succeeded. If your order doesn't appear within 2 minutes, contact support.",
            );
            router.replace('/(tabs)/orders');
          }
        } finally { setLoading(false); }
      },
      onDismiss: () => setLoading(false),
      onError: (err: any) => {
        setLoading(false);
        Alert.alert('Payment Failed', err?.description ?? 'Payment failed. Please try again.');
      },
    });
  };

  // ── Cash on Delivery (advance) ───────────────────────────────────────────────
  const placeCodOrder = async (payload: CheckoutPayload) => {
    const res = await checkoutApi.initiateCod(payload, session!.token);
    if (!res.success || !res.razorpayOrderId || !res.key || res.amount == null) {
      setLoading(false);
      handleApiError(res, 'Could not start the COD advance payment. Please try again.');
      return;
    }

    openRazorpay({
      key: res.key,
      amount: res.amount,                 // paise — advance only
      orderId: res.razorpayOrderId,
      name: 'NIVA',
      description: `COD Advance — ₹${res.codAdvance ?? ''}`,
      customerName: customer!.name,
      customerEmail: customer!.email,
      customerPhone: customer!.phone ?? '',
      onSuccess: async (paymentRes: any) => {
        try {
          let orderId: string | undefined;
          try {
            const verifyRes = await checkoutApi.verifyCod({
              razorpay_order_id: paymentRes.razorpay_order_id,
              razorpay_payment_id: paymentRes.razorpay_payment_id,
              razorpay_signature: paymentRes.razorpay_signature,
              ...verifyCustomerFields(),
            }, session!.token);
            orderId = verifyRes.orderId;
          } catch { /* handled below */ }

          clearCart();
          if (orderId) {
            router.replace(`/order/${orderId}` as any);
          } else {
            Alert.alert(
              'Advance Paid',
              "Your COD advance was received. If your order doesn't appear within 2 minutes, contact support.",
            );
            router.replace('/(tabs)/orders');
          }
        } finally { setLoading(false); }
      },
      onDismiss: () => setLoading(false),
      onError: (err: any) => {
        setLoading(false);
        Alert.alert('Payment Failed', err?.description ?? 'Advance payment failed. Please try again.');
      },
    });
  };

  if (!session) return null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>Checkout</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Delivery type */}
        <SectionCard title="Delivery Type">
          {DELIVERY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[s.optionRow, deliveryType === opt.key && s.optionRowActive]}
              onPress={() => setDeliveryType(opt.key)}
            >
              <Text style={s.optionIcon}>{opt.icon}</Text>
              <View style={s.optionInfo}>
                <Text style={[s.optionLabel, deliveryType === opt.key && s.optionLabelActive]}>{opt.label}</Text>
                <Text style={s.optionDesc}>{opt.desc}</Text>
              </View>
              <View style={[s.radio, deliveryType === opt.key && s.radioActive]}>
                {deliveryType === opt.key && <View style={s.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </SectionCard>

        {/* Address selector (room delivery) */}
        {deliveryType === 'room' && (
          <SectionCard title="Delivery Address">
            {loadingAddresses ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : addresses.length === 0 ? (
              <TouchableOpacity style={s.addAddressBtn} onPress={() => router.push('/addresses')}>
                <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
                <Text style={s.addAddressText}>Add a delivery address</Text>
              </TouchableOpacity>
            ) : (
              <>
                {addresses.map((addr) => (
                  <TouchableOpacity
                    key={addr.id}
                    style={[s.addrRow, selectedAddressId === addr.id && s.addrRowActive]}
                    onPress={() => setSelectedAddressId(addr.id)}
                  >
                    <Ionicons
                      name="location"
                      size={18}
                      color={selectedAddressId === addr.id ? theme.colors.primary : theme.colors.textMuted}
                    />
                    <View style={s.addrInfo}>
                      <Text style={s.addrLabel}>{addr.label || addr.hostel_name}</Text>
                      <Text style={s.addrDetail}>
                        {addr.hostel_name}, Room {addr.room_number}
                      </Text>
                      {addr.recipient_name && addr.recipient_name !== customer?.name && (
                        <Text style={s.addrRecipient}>For: {addr.recipient_name}</Text>
                      )}
                    </View>
                    <View style={[s.radio, selectedAddressId === addr.id && s.radioActive]}>
                      {selectedAddressId === addr.id && <View style={s.radioDot} />}
                    </View>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={s.addAddressBtn} onPress={() => router.push('/addresses')}>
                  <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
                  <Text style={s.addAddressText}>Add new address</Text>
                </TouchableOpacity>
              </>
            )}
          </SectionCard>
        )}

        {/* Block selector */}
        {deliveryType === 'block' && (
          <SectionCard title="Select Block">
            {BLOCK_LOCATIONS.map((block) => (
              <TouchableOpacity
                key={block}
                style={[s.optionRow, deliveryBlock === block && s.optionRowActive]}
                onPress={() => setDeliveryBlock(block as BlockLocation)}
              >
                <Text style={s.optionIcon}>📍</Text>
                <Text style={[s.optionLabel, deliveryBlock === block && s.optionLabelActive]}>{block}</Text>
                <View style={[s.radio, deliveryBlock === block && s.radioActive]}>
                  {deliveryBlock === block && <View style={s.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}
          </SectionCard>
        )}

        {/* Delivery timing (instant vs scheduled slot) */}
        <SectionCard title="Delivery Timing">
          <TouchableOpacity
            style={[s.optionRow, deliveryMode === 'instant' && s.optionRowActive]}
            onPress={() => setDeliveryMode('instant')}
          >
            <Ionicons name="flash-outline" size={18} color={deliveryMode === 'instant' ? theme.colors.primary : theme.colors.textMuted} />
            <View style={s.optionInfo}>
              <Text style={[s.optionLabel, deliveryMode === 'instant' && s.optionLabelActive]}>Instant Delivery</Text>
              <Text style={s.optionDesc}>As soon as possible</Text>
            </View>
            <View style={[s.radio, deliveryMode === 'instant' && s.radioActive]}>
              {deliveryMode === 'instant' && <View style={s.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.optionRow, deliveryMode === 'slot' && s.optionRowActive]}
            onPress={() => setDeliveryMode('slot')}
          >
            <Ionicons name="time-outline" size={18} color={deliveryMode === 'slot' ? theme.colors.primary : theme.colors.textMuted} />
            <View style={s.optionInfo}>
              <Text style={[s.optionLabel, deliveryMode === 'slot' && s.optionLabelActive]}>Schedule a Slot</Text>
              <Text style={s.optionDesc}>Pick a date and time window</Text>
            </View>
            <View style={[s.radio, deliveryMode === 'slot' && s.radioActive]}>
              {deliveryMode === 'slot' && <View style={s.radioDot} />}
            </View>
          </TouchableOpacity>

          {deliveryMode === 'slot' && (
            <View style={s.schedule}>
              <Text style={s.scheduleLabel}>Date</Text>
              <View style={s.chipRow}>
                {dateOptions().map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[s.chip, deliveryDate === d && s.chipActive]}
                    onPress={() => setDeliveryDate(d)}
                  >
                    <Text style={[s.chipText, deliveryDate === d && s.chipTextActive]}>{labelForDate(d)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.scheduleLabel, { marginTop: 12 }]}>Time Slot</Text>
              <View style={s.chipRow}>
                {SLOTS.map((slot) => {
                  const expired = isSlotExpired(slot.value, deliveryDate);
                  const active = selectedSlot === slot.value;
                  return (
                    <TouchableOpacity
                      key={slot.value}
                      disabled={expired}
                      style={[s.chip, active && s.chipActive, expired && s.chipDisabled]}
                      onPress={() => setSelectedSlot(slot.value)}
                    >
                      <Text style={[s.chipText, active && s.chipTextActive, expired && s.chipTextDisabled]}>
                        {slot.label}{expired ? ' · passed' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </SectionCard>

        {/* Payment method */}
        <SectionCard title="Payment Method">
          {(['online', 'cod'] as PaymentMethod[]).map((pm) => (
            <TouchableOpacity
              key={pm}
              style={[s.optionRow, paymentMethod === pm && s.optionRowActive]}
              onPress={() => setPaymentMethod(pm)}
            >
              <Ionicons
                name={pm === 'online' ? 'card-outline' : 'cash-outline'}
                size={18}
                color={paymentMethod === pm ? theme.colors.primary : theme.colors.textMuted}
              />
              <View style={s.optionInfo}>
                <Text style={[s.optionLabel, paymentMethod === pm && s.optionLabelActive]}>
                  {pm === 'online' ? 'Pay Online' : 'Cash on Delivery'}
                </Text>
                <Text style={s.optionDesc}>
                  {pm === 'online' ? 'UPI, cards, net banking' : 'Pay a small advance online, rest on delivery'}
                </Text>
              </View>
              <View style={[s.radio, paymentMethod === pm && s.radioActive]}>
                {paymentMethod === pm && <View style={s.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </SectionCard>

        {/* Coupon */}
        <SectionCard title="Apply Coupon">
          {couponApplied ? (
            <View style={s.couponApplied}>
              <Ionicons name="pricetag" size={16} color={theme.colors.success} />
              <Text style={s.couponAppliedText}>"{couponApplied.code}" — ₹{couponApplied.discount} off</Text>
              <TouchableOpacity onPress={() => { setCouponApplied(null); setCouponCode(''); }}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.couponRow}>
              <TextInput
                style={s.couponInput}
                placeholder="Enter coupon code"
                placeholderTextColor={theme.colors.textMuted}
                value={couponCode}
                onChangeText={(t) => { setCouponCode(t); setCouponError(''); }}
                autoCapitalize="characters"
              />
              <TouchableOpacity style={s.couponApplyBtn} onPress={validateCoupon} disabled={checkingCoupon}>
                {checkingCoupon ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.couponApplyText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
          {couponError ? <Text style={s.couponError}>{couponError}</Text> : null}
        </SectionCard>

        {/* Bill summary */}
        <SectionCard title="Bill Summary">
          <BillRow label="Item total" value={`₹${subtotal}`} />
          <BillRow label="Delivery fee" value={deliveryFee > 0 ? `₹${deliveryFee}` : 'Free'} />
          {couponApplied && <BillRow label={`Coupon (${couponApplied.code})`} value={`-₹${couponDiscount}`} accent />}
          <BillRow label="Taxes & charges" value="Calculated by NIVA" muted />
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Estimated Total</Text>
            <Text style={s.totalValue}>₹{total}</Text>
          </View>
          <Text style={s.billNote}>Final amount is confirmed securely by NIVA at payment.</Text>
        </SectionCard>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Place order button */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.placeBtn, loading && s.placeBtnDisabled]}
          onPress={handlePlaceOrder}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.placeBtnLabel}>
                {paymentMethod === 'cod' ? 'Pay Advance & Place Order' : 'Proceed to Pay'}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Razorpay wrapper ─────────────────────────────────────────────────────────
function openRazorpay({
  key, amount, orderId, name, description,
  customerName, customerEmail, customerPhone,
  onSuccess, onDismiss, onError,
}: {
  key: string; amount: number; orderId: string; name: string; description: string;
  customerName: string; customerEmail: string; customerPhone: string;
  onSuccess: (res: any) => void; onDismiss: () => void; onError: (err: any) => void;
}) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RazorpayCheckout = require('react-native-razorpay').default;
    RazorpayCheckout.open({
      description,
      currency: 'INR',
      key,
      amount: String(amount),   // paise, as returned by the backend
      name,
      order_id: orderId,
      prefill: { email: customerEmail, contact: customerPhone, name: customerName },
      theme: { color: '#F47738' },
    })
      .then(onSuccess)
      .catch((err: any) => {
        if (err?.code === 0 || err?.code === 2) { onDismiss(); } else { onError(err); }
      });
  } catch {
    Alert.alert(
      'Payment Not Available',
      'The payment module is missing from this build. Rebuild the app with react-native-razorpay installed.',
    );
    onDismiss();
  }
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function BillRow({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <View style={s.billRow}>
      <Text style={s.billLabel}>{label}</Text>
      <Text style={[s.billValue, accent && { color: theme.colors.success }, muted && { color: theme.colors.textMuted }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: 10, gap: 10 },
  backBtn: { padding: 6 },
  navTitle: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.textPrimary },
  scroll: { paddingHorizontal: theme.spacing.lg, gap: 12, paddingTop: 8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg, ...theme.shadows.card },
  cardTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary, marginBottom: 12 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    borderRadius: theme.radii.sm, paddingHorizontal: 4,
  },
  optionRowActive: { backgroundColor: theme.colors.primarySoft },
  optionIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  optionInfo: { flex: 1 },
  optionLabel: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  optionLabelActive: { fontFamily: theme.fonts.semibold, color: theme.colors.primary },
  optionDesc: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: theme.colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  addAddressBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  addAddressText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.primary },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderRadius: theme.radii.sm, paddingHorizontal: 4 },
  addrRowActive: { backgroundColor: theme.colors.primarySoft },
  addrInfo: { flex: 1 },
  addrLabel: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  addrDetail: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
  addrRecipient: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 1 },
  schedule: { marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  scheduleLabel: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.backgroundAlt, borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff', fontFamily: theme.fonts.semibold },
  chipTextDisabled: { color: theme.colors.textMuted },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: {
    flex: 1, height: 42, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radii.sm, paddingHorizontal: 12,
    fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary,
    letterSpacing: 2,
  },
  couponApplyBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 16, borderRadius: theme.radii.sm,
    alignItems: 'center', justifyContent: 'center', minWidth: 72,
  },
  couponApplyText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.sm, color: '#fff' },
  couponApplied: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.successSoft, padding: 10, borderRadius: theme.radii.sm,
  },
  couponAppliedText: { flex: 1, fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.success },
  couponError: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.error, marginTop: 6 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  billLabel: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  billValue: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10,
    borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 4,
  },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  totalValue: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.primary },
  billNote: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 8 },
  footer: { padding: theme.spacing.lg, paddingBottom: 28, backgroundColor: theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.border },
  placeBtn: {
    backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  placeBtnDisabled: { opacity: 0.6 },
  placeBtnLabel: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: '#fff' },
});
