/**
 * QR Scanner Tab — native Android camera scanner.
 * Scans the restaurant QR for NIVA Foods Room Delivery handover.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Vibration,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { partnerApi } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import { usePartnerStore } from '../../src/services/partnerStore';

export default function ScannerScreen() {
  const { session } = usePartnerStore(); // only destructure what's needed
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  // isFocused gates CameraView mounting — avoids the Android black-screen bug
  // caused by the camera stream being initialised while the tab is off-screen.
  const [isFocused, setIsFocused] = useState(false);

  // Stable refs so handleBarCodeScanned never needs to be recreated
  const scannedRef   = useRef(false);
  const processingRef = useRef(false);
  const sessionRef   = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Request permission once on mount only
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check permission every time this tab gets focused.
  // Also gate CameraView mounting: mount only while focused, unmount on blur.
  // This is the key fix for the Android black-screen issue — remounting
  // CameraView forces the camera HAL to reinitialise properly every time.
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      if (permission && !permission.granted && permission.canAskAgain) {
        requestPermission();
      }
      // Reset scan state whenever the tab is focused so the camera is always ready
      scannedRef.current = false;
      processingRef.current = false;
      setScanned(false);
      setResult(null);
      setProcessing(false);

      return () => {
        // Unmount the camera when leaving the tab so it releases the hardware
        // and re-acquires it cleanly on next focus (fixes black screen on Android).
        setIsFocused(false);
      };
    }, [permission, requestPermission])
  );

  // Stable scan handler — no state deps, uses refs only
  const handleBarCodeScanned = useCallback(async ({ data }: { type: string; data: string }) => {
    if (scannedRef.current || processingRef.current) return;
    const cur = sessionRef.current;
    if (!cur) { Alert.alert('Not logged in', 'Please log in first.'); return; }

    scannedRef.current   = true;
    processingRef.current = true;
    setScanned(true);
    setProcessing(true);
    setResult(null);

    try {
      const res = await partnerApi.scanQr(data.trim(), cur.token);
      Vibration.vibrate([0, 100, 50, 200]);
      setResult({ success: true, message: res.message ?? 'QR verified! Starting delivery.' });
      setTimeout(() => {
        scannedRef.current    = false;
        processingRef.current  = false;
        setScanned(false);
        setResult(null);
        // Always go to the Active tab after a successful scan — never push a
        // new screen. Active tab refreshes automatically (AppState → active)
        // and the orderId param tells it to open the detail sheet at once.
        const orderId = res.order?.id;
        if (orderId) {
          router.replace({ pathname: '/(tabs)/active', params: { openOrderId: orderId } });
        } else {
          router.replace('/(tabs)/active');
        }
      }, 1200);
    } catch (e: any) {
      const msg = e?.data?.message ?? e?.message ?? 'QR scan failed. Please try again.';
      setResult({ success: false, message: msg });
      setTimeout(() => {
        scannedRef.current    = false;
        processingRef.current  = false;
        setScanned(false);
        setResult(null);
      }, 2500);
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, []); // empty deps — fully stable

  // Permission not yet loaded
  if (permission === null || permission === undefined) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={NIVA_COLORS.orange} size="large" />
        <Text style={s.waitText}>Checking camera permission...</Text>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.noPermTitle}>Camera Access Required</Text>
        <Text style={s.noPermText}>
          NIVA Partner needs camera access to scan order QR codes.
          {!permission.canAskAgain
            ? '\n\nGo to Settings → Apps → NIVA Partner → Permissions → Camera.'
            : ''}
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Grant Permission</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Scan Order QR</Text>
        <Text style={s.headerSub}>Point the camera at the restaurant QR code</Text>
      </View>

      <View style={s.cameraContainer}>
        {/* Only mount CameraView while this tab is focused — this forces the
            Android camera HAL to re-initialise on every tab visit and eliminates
            the black-screen bug that appears when the component stays mounted
            in the background. */}
        {isFocused && (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
        )}
        {/* Overlay rendered outside CameraView to avoid children warning */}
        <View style={s.overlay} pointerEvents="none">
          <View style={s.scanFrame}>
            <View style={[s.corner, s.cTL]} />
            <View style={[s.corner, s.cTR]} />
            <View style={[s.corner, s.cBL]} />
            <View style={[s.corner, s.cBR]} />
          </View>
        </View>
      </View>

      {processing && (
        <View style={s.resultBox}>
          <ActivityIndicator color={NIVA_COLORS.orange} />
          <Text style={s.resultText}>Verifying QR code...</Text>
        </View>
      )}

      {result && !processing && (
        <View style={[s.resultBox, result.success ? s.resultOk : s.resultErr]}>
          <Text style={[s.resultText, { color: result.success ? NIVA_COLORS.green : NIVA_COLORS.red }]}>
            {result.message}
          </Text>
        </View>
      )}

      {scanned && !processing && result && !result.success && (
        <TouchableOpacity
          style={s.rescanBtn}
          onPress={() => { scannedRef.current = false; setScanned(false); setResult(null); }}
        >
          <Text style={s.rescanBtnText}>Scan Again</Text>
        </TouchableOpacity>
      )}

      <Text style={s.hint}>
        Scan the QR shown by the restaurant to confirm handover and begin delivery.
      </Text>
    </View>
  );
}

const FRAME = 240;
const CORNER = 24;
const THICK  = 3;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: NIVA_COLORS.gray50 },
  waitText: { marginTop: 12, fontSize: 14, color: NIVA_COLORS.gray500 },
  header: { padding: 16, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Montserrat-Bold', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  cameraContainer: { flex: 1, position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  scanFrame: { width: FRAME, height: FRAME, backgroundColor: 'transparent', position: 'relative' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: NIVA_COLORS.orange },
  cTL: { top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK, borderTopLeftRadius: 4 },
  cTR: { top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK, borderTopRightRadius: 4 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK, borderBottomLeftRadius: 4 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK, borderBottomRightRadius: 4 },
  resultBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 14, gap: 10, backgroundColor: NIVA_COLORS.gray900,
  },
  resultOk: { backgroundColor: NIVA_COLORS.greenLight },
  resultErr: { backgroundColor: NIVA_COLORS.redLight },
  resultText: { fontSize: 14, fontFamily: 'Montserrat-SemiBold', color: '#fff', flex: 1 },
  rescanBtn: { backgroundColor: NIVA_COLORS.orange, margin: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  rescanBtnText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 15 },
  hint: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 12, padding: 14 },
  noPermTitle: { fontSize: 17, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray900, marginBottom: 8, textAlign: 'center' },
  noPermText: { fontSize: 14, color: NIVA_COLORS.gray600, textAlign: 'center', marginBottom: 16 },
  permBtn: { backgroundColor: NIVA_COLORS.black, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  permBtnText: { color: '#fff', fontFamily: 'Montserrat-Bold' },
});
