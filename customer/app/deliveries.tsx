/**
 * NIVA Deliveries — Room Delivery Order Form
 *
 * Mirrors the website's RoomDeliveryForm.js and DeliveriesPage.js.
 * Calls POST /api/orders/external-room-delivery to create a Razorpay order,
 * then opens Razorpay checkout. Backend webhook creates the order.
 *
 * Customer fee: ₹29 flat (server-authoritative, matches pricing.getNivaDeliveriesCharge()).
 * Platform: Swiggy, Zomato, Amazon, etc.
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
import { useCustomerStore } from '../src/services/customerStore';
import { addressApi, roomDeliveryApi } from '../src/services/nivaApi';
import type { SavedAddress } from '../src/services/nivaApi';
import {
  MALE_HOSTELS, FEMALE_HOSTELS, VENDOR_PLATFORMS, ROOM_DELIVERY_CHARGE, normalizeGender,
} from '../src/data/hostelData';

type VendorOrderType = 'prepaid' | 'cod';
type PaymentMethod = 'online' | 'cod';

export default function DeliveriesScreen() {
  const { session, customer } = useCustomerStore();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  // Manual address entry if no saved addresses
  const [hostelGender, setHostelGender] = useState<'boys' | 'girls'>('boys');
  const [hostelName, setHostelName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  // Order details
  const [platform, setPlatform] = useState<string>('');
  const [packets, setPackets] = useState(1);
  const [vendorOrderType, setVendorOrderType] = useState<VendorOrderType>('prepaid');
  const [foodAmount, setFoodAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');

  const [loading, setLoading] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const deliveryCharge = ROOM_DELIVERY_CHARGE; // ₹29

  useEffect(() => {
    if (!session) {
      router.replace('/(auth)/login');
      return;
    }
    if (!customer) return;
    setLoadingAddresses(true);
    addressApi.getAddresses(customer.id, session.token)
      .then((r) => {
        const list = r.data ?? [];
        setAddresses(list);
        const def = list.find((a) => a.is_default);
        if (def) {
          setSelectedAddressId(def.id);
          setHostelGender(normalizeGender(def.hostel_type));
          setHostelName(def.hostel_name);
          setRoomNumber(def.room_number);
          if (def.recipient_name) setRecipientName(def.recipient_name);
          if (def.recipient_phone) setRecipientPhone(def.recipient_phone);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAddresses(false));
  }, [session, customer]);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  const hostels = hostelGender === 'boys' ? MALE_HOSTELS : FEMALE_HOSTELS;

  const finalHostelName = selectedAddress?.hostel_name ?? hostelName;
  const finalRoomNumber = selectedAddress?.room_number ?? roomNumber;
  const finalHostelType = selectedAddress
    ? normalizeGender(selectedAddress.hostel_type)
    : hostelGender;

  const codFee = vendorOrderType === 'cod' ? Math.round((parseFloat(foodAmount) || 0) * 0.02) : 0;
  const total = deliveryCharge + codFee;

  const handleSubmit = async () => {
    if (!session || !customer) { router.push('/(auth)/login'); return; }
    if (!finalHostelName) { Alert.alert('Select hostel', 'Please select your hostel.'); return; }
    if (!finalRoomNumber) { Alert.alert('Enter room', 'Please enter your room number.'); return; }
    if (!platform) { Alert.alert('Select platform', 'Please select the vendor platform.'); return; }
    if (vendorOrderType === 'cod' && !foodAmount) {
      Alert.alert('Enter food amount', 'Please enter the food amount for COD orders.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        customerId: customer.id,
        hostelName: finalHostelName,
        hostelType: (finalHostelType === 'boys' ? 'boys' : 'girls') as 'boys' | 'girls',
        roomNumber: finalRoomNumber,
        numberOfPackets: packets,
        vendorPlatform: platform,
        paymentMethod,
        foodAmount: vendorOrderType === 'cod' ? parseFloat(foodAmount) || 0 : 0,
        vendorOrderType,
        description,
        recipientName: selectedAddress?.recipient_name ?? recipientName,
        recipientPhone: selectedAddress?.recipient_phone ?? recipientPhone,
        college: selectedAddress?.college ?? customer.college ?? '',
      };

      const res = await roomDeliveryApi.createOrder(payload, session.token);

      if (!res.success) {
        Alert.alert('Error', res.message ?? 'Failed to create order.');
        setLoading(false);
        return;
      }

      if (!res.razorpayOrderId) {
        Alert.alert('Error', 'Payment gateway did not return an order. Please try again.');
        setLoading(false);
        return;
      }

      // Open Razorpay
      openRazorpay({
        key: res.key!,
        amount: res.amount!,
        orderId: res.razorpayOrderId,
        name: 'NIVA Deliveries',
        description: `Room Delivery — ${platform}`,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone ?? '',
        onSuccess: async (paymentRes: any) => {
          try {
            const verifyEndpoint = paymentMethod === 'cod'
              ? roomDeliveryApi.verifyPaymentCod
              : roomDeliveryApi.verifyPayment;
            const verifyRes = await verifyEndpoint({
              razorpay_order_id: paymentRes.razorpay_order_id,
              razorpay_payment_id: paymentRes.razorpay_payment_id,
              razorpay_signature: paymentRes.razorpay_signature,
              customer_name: customer.name,
              customer_email: customer.email,
              customer_phone: customer.phone ?? '',
              customer_college: customer.college ?? '',
            }, session.token);

            if (verifyRes.orderId) {
              router.replace(`/order/${verifyRes.orderId}` as any);
            } else {
              Alert.alert('Order Placed!', 'Your delivery has been scheduled. Check Orders for tracking.');
              router.replace('/(tabs)/orders');
            }
          } catch {
            Alert.alert('Payment Recorded', 'Your payment was successful. Check Orders for tracking.');
            router.replace('/(tabs)/orders');
          } finally { setLoading(false); }
        },
        onDismiss: () => setLoading(false),
        onError: (err: any) => {
          setLoading(false);
          Alert.alert('Payment Failed', err?.description ?? 'Payment failed. Please try again.');
        },
      });
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Error', e?.message ?? 'Something went wrong. Please try again.');
    }
  };

  if (!session) return null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={s.navTitle}>NIVA Deliveries</Text>
          <Text style={s.navSub}>Room delivery from Swiggy, Zomato & more</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Info banner */}
        <View style={s.infoBanner}>
          <Ionicons name="information-circle" size={18} color={theme.colors.primary} />
          <Text style={s.infoText}>
            NIVA partners deliver your Swiggy/Zomato orders directly to your hostel room. Delivery fee: ₹{deliveryCharge}.
          </Text>
        </View>

        {/* Saved addresses */}
        {loadingAddresses ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 16 }} /> : null}
        {!loadingAddresses && addresses.length > 0 && (
          <SectionCard title="Select Address">
            {addresses.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={[s.addrRow, selectedAddressId === addr.id && s.addrRowActive]}
                onPress={() => {
                  setSelectedAddressId(addr.id);
                  setHostelGender(normalizeGender(addr.hostel_type));
                  setHostelName(addr.hostel_name);
                  setRoomNumber(addr.room_number);
                }}
              >
                <Ionicons name="location" size={16} color={selectedAddressId === addr.id ? theme.colors.primary : theme.colors.textMuted} />
                <View style={s.addrInfo}>
                  <Text style={s.addrLabel}>{addr.label || addr.hostel_name}</Text>
                  <Text style={s.addrDetail}>{addr.hostel_name}, Room {addr.room_number}</Text>
                </View>
                <View style={[s.radio, selectedAddressId === addr.id && s.radioActive]}>
                  {selectedAddressId === addr.id && <View style={s.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.addAddrBtn} onPress={() => router.push('/addresses')}>
              <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
              <Text style={s.addAddrText}>Add new address</Text>
            </TouchableOpacity>
          </SectionCard>
        )}

        {/* Manual hostel entry if no saved address selected */}
        {(!selectedAddressId || addresses.length === 0) && (
          <SectionCard title="Hostel Details">
            {/* Gender */}
            <Text style={s.fieldLabel}>Gender</Text>
            <View style={s.toggleRow}>
              {(['boys', 'girls'] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[s.toggleBtn, hostelGender === g && s.toggleBtnActive]}
                  onPress={() => { setHostelGender(g); setHostelName(''); }}
                >
                  <Text style={[s.toggleText, hostelGender === g && s.toggleTextActive]}>
                    {g === 'boys' ? '👦 Boys' : '👧 Girls'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Hostel */}
            <Text style={s.fieldLabel}>Hostel</Text>
            <View style={s.hostelGrid}>
              {hostels.map((h) => (
                <TouchableOpacity
                  key={h}
                  style={[s.hostelChip, hostelName === h && s.hostelChipActive]}
                  onPress={() => setHostelName(h)}
                >
                  <Text style={[s.hostelChipText, hostelName === h && s.hostelChipTextActive]}>{h}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Room */}
            <Text style={s.fieldLabel}>Room Number</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 203"
              placeholderTextColor={theme.colors.textMuted}
              value={roomNumber}
              onChangeText={setRoomNumber}
              keyboardType="numeric"
            />
            <Text style={s.fieldLabel}>Recipient Name (optional)</Text>
            <TextInput style={s.input} placeholder="Your name" placeholderTextColor={theme.colors.textMuted} value={recipientName} onChangeText={setRecipientName} />
            <Text style={s.fieldLabel}>Recipient Phone (optional)</Text>
            <TextInput style={s.input} placeholder="10-digit number" placeholderTextColor={theme.colors.textMuted} value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" />
          </SectionCard>
        )}

        {/* Platform */}
        <SectionCard title="Vendor Platform">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {VENDOR_PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.platChip, platform === p && s.platChipActive]}
                onPress={() => setPlatform(p)}
              >
                <Text style={[s.platChipText, platform === p && s.platChipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SectionCard>

        {/* Packets */}
        <SectionCard title="Number of Packets">
          <View style={s.packetRow}>
            <TouchableOpacity style={s.packetBtn} onPress={() => setPackets((p) => Math.max(1, p - 1))}>
              <Ionicons name="remove" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
            <Text style={s.packetCount}>{packets}</Text>
            <TouchableOpacity style={s.packetBtn} onPress={() => setPackets((p) => Math.min(20, p + 1))}>
              <Ionicons name="add" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
            <Text style={s.packetNote}>packet{packets > 1 ? 's' : ''} → ₹{deliveryCharge} delivery</Text>
          </View>
        </SectionCard>

        {/* Order type (prepaid vs COD) */}
        <SectionCard title="Vendor Order Type">
          {(['prepaid', 'cod'] as VendorOrderType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.optRow, vendorOrderType === t && s.optRowActive]}
              onPress={() => setVendorOrderType(t)}
            >
              <View style={s.optInfo}>
                <Text style={[s.optLabel, vendorOrderType === t && s.optLabelActive]}>
                  {t === 'prepaid' ? 'Prepaid (Paid Online on App)' : 'COD (Partner Pays at Gate)'}
                </Text>
                <Text style={s.optDesc}>
                  {t === 'prepaid' ? 'You already paid on Swiggy/Zomato app' : 'Partner will pay the vendor, +2% cash handling fee'}
                </Text>
              </View>
              <View style={[s.radio, vendorOrderType === t && s.radioActive]}>
                {vendorOrderType === t && <View style={s.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
          {vendorOrderType === 'cod' && (
            <>
              <Text style={s.fieldLabel}>Food Amount (₹)</Text>
              <TextInput
                style={s.input}
                placeholder="Amount partner will pay vendor"
                placeholderTextColor={theme.colors.textMuted}
                value={foodAmount}
                onChangeText={setFoodAmount}
                keyboardType="numeric"
              />
            </>
          )}
        </SectionCard>

        {/* Payment method */}
        <SectionCard title="Pay for Delivery Service">
          {(['online', 'cod'] as PaymentMethod[]).map((pm) => (
            <TouchableOpacity
              key={pm}
              style={[s.optRow, paymentMethod === pm && s.optRowActive]}
              onPress={() => setPaymentMethod(pm)}
            >
              <Ionicons name={pm === 'online' ? 'card-outline' : 'cash-outline'} size={18} color={paymentMethod === pm ? theme.colors.primary : theme.colors.textMuted} />
              <View style={s.optInfo}>
                <Text style={[s.optLabel, paymentMethod === pm && s.optLabelActive]}>
                  {pm === 'online' ? 'Pay Online (UPI/Card)' : 'Cash on Delivery'}
                </Text>
              </View>
              <View style={[s.radio, paymentMethod === pm && s.radioActive]}>
                {paymentMethod === pm && <View style={s.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
        </SectionCard>

        {/* Bill */}
        <SectionCard title="Bill Summary">
          <View style={s.billRow}>
            <Text style={s.billLabel}>Delivery service fee</Text>
            <Text style={s.billValue}>₹{deliveryCharge}</Text>
          </View>
          {codFee > 0 && (
            <View style={s.billRow}>
              <Text style={s.billLabel}>Cash handling fee (2%)</Text>
              <Text style={s.billValue}>₹{codFee}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>₹{total}</Text>
          </View>
        </SectionCard>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Submit */}
      <View style={s.footer}>
        <TouchableOpacity style={[s.submitBtn, loading && s.submitBtnDisabled]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={s.submitText}>{paymentMethod === 'cod' ? 'Place Delivery Request' : `Pay ₹${total} & Schedule`}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function openRazorpay({ key, amount, orderId, name, description, customerName, customerEmail, customerPhone, onSuccess, onDismiss, onError }: any) {
  try {
    const RazorpayCheckout = require('react-native-razorpay').default;
    RazorpayCheckout.open({ description, currency: 'INR', key, amount: String(amount), name, order_id: orderId, prefill: { email: customerEmail, contact: customerPhone, name: customerName }, theme: { color: '#F47738' } })
      .then(onSuccess)
      .catch((err: any) => { if (err?.code === 0) onDismiss(); else onError(err); });
  } catch {
    Alert.alert('Payment Not Available', 'Install react-native-razorpay and rebuild the app.');
    onDismiss();
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingVertical: 10, gap: 10 },
  backBtn: { padding: 6 },
  navTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textPrimary },
  navSub: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted },
  scroll: { paddingHorizontal: theme.spacing.lg, gap: 12, paddingTop: 8 },
  infoBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: theme.colors.primarySoft, padding: theme.spacing.md, borderRadius: theme.radii.md },
  infoText: { flex: 1, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.primary },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg, ...theme.shadows.card },
  cardTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary, marginBottom: 12 },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderRadius: theme.radii.sm, paddingHorizontal: 4 },
  addrRowActive: { backgroundColor: theme.colors.primarySoft },
  addrInfo: { flex: 1 },
  addrLabel: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  addrDetail: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
  addAddrBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  addAddrText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.primary },
  fieldLabel: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: 8, marginTop: 12 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.radii.sm, borderWidth: 1, borderColor: theme.colors.border },
  toggleBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toggleText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  toggleTextActive: { color: '#fff' },
  hostelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hostelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.border },
  hostelChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  hostelChipText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  hostelChipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.sm, paddingHorizontal: 12, height: 44, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  platChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundAlt },
  platChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  platChipText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  platChipTextActive: { color: '#fff' },
  packetRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  packetBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  packetCount: { fontFamily: theme.fonts.bold, fontSize: 24, color: theme.colors.textPrimary, minWidth: 32, textAlign: 'center' },
  packetNote: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textMuted, flex: 1 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderRadius: theme.radii.sm, paddingHorizontal: 4 },
  optRowActive: { backgroundColor: theme.colors.primarySoft },
  optInfo: { flex: 1 },
  optLabel: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  optLabelActive: { fontFamily: theme.fonts.semibold, color: theme.colors.primary },
  optDesc: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: theme.colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  billLabel: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  billValue: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 4 },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  totalValue: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.primary },
  footer: { padding: theme.spacing.lg, paddingBottom: 28, backgroundColor: theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.border },
  submitBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: '#fff' },
});
