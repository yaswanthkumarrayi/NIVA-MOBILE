/**
 * OrderQrDisplay — shows a scannable QR code for a room delivery order.
 * Restaurant shows this QR; the delivery partner scans it to verify handover.
 * Uses GET /api/restaurant-portal/orders/:id/qr
 *
 * States:
 *   - loading
 *   - not ready (order not accepted yet) — friendly message + Retry
 *   - active QR — show scannable code
 *   - already used — handover complete message
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { restaurantApi } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';

interface Props {
  orderId: string;
  token: string;
}

export function OrderQrDisplay({ orderId, token }: Props) {
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    restaurantApi.getOrderQr(orderId, token)
      .then((res) => {
        setQrToken(res.qr_token);
        setVerified(!!(res as any).qr_handover_verified);
      })
      .catch((e: any) => {
        const msg: string = e?.data?.message ?? e?.message ?? '';
        if (e?.status === 400 || msg.toLowerCase().includes('not been accepted')) {
          setError('Accept the order first to generate the QR code.');
        } else {
          setError(msg || 'Could not load QR. Tap Retry.');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [orderId, token]);

  if (loading) {
    return (
      <View style={s.wrap}>
        <ActivityIndicator color={NIVA_COLORS.orange} size="small" />
        <Text style={s.hint}>Loading QR...</Text>
      </View>
    );
  }

  if (verified) {
    return (
      <View style={[s.wrap, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
        <Text style={{ fontSize: 28, marginBottom: 6 }}>✅</Text>
        <Text style={[s.title, { color: '#15803D' }]}>Handover Complete</Text>
        <Text style={[s.sub, { color: '#166534' }]}>Partner has scanned this QR. Order is out for delivery.</Text>
      </View>
    );
  }

  if (error || !qrToken) {
    return (
      <View style={[s.wrap, { backgroundColor: NIVA_COLORS.gray50 }]}>
        <Text style={s.title}>QR Code</Text>
        <Text style={s.sub}>{error || 'QR not available yet.'}</Text>
        <TouchableOpacity onPress={load} style={s.retryBtn}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Show to Delivery Partner</Text>
      <Text style={s.sub}>Partner scans this to confirm handover and start delivery.</Text>
      <View style={s.qrBox}>
        <QRCode value={qrToken} size={200} backgroundColor="white" color={NIVA_COLORS.black} />
      </View>
      <Text style={s.hint}>One-time use · Do not share</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: NIVA_COLORS.white, borderRadius: 14, padding: 20,
    marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: NIVA_COLORS.gray100,
  },
  title: { fontSize: 14, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900, marginBottom: 4 },
  sub: { fontSize: 12, color: NIVA_COLORS.gray500, marginBottom: 14, textAlign: 'center' },
  qrBox: {
    padding: 14, backgroundColor: 'white', borderRadius: 12,
    borderWidth: 1, borderColor: NIVA_COLORS.gray200,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  hint: { fontSize: 11, color: NIVA_COLORS.gray400, textAlign: 'center', marginTop: 12 },
  retryBtn: {
    borderWidth: 1, borderColor: NIVA_COLORS.gray300, borderRadius: 20,
    paddingHorizontal: 20, paddingVertical: 8, marginTop: 4,
  },
  retryText: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },
});
