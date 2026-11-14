/**
 * Profile Tab — restaurant info and logout only.
 * Availability toggle is in the Orders header, not here.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, ScrollView, Alert, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { restaurantApi, mobileApi } from '@niva/shared';
import { clearSession } from '@niva/shared';
import { alertManager } from '@niva/shared';
import { unsubscribeAll } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import { loadFcmToken } from '@niva/shared';
import { useRestaurantStore } from '../../src/services/restaurantStore';

export default function ProfileScreen() {
  const { session, setSession, setAuthState, updateInfo } = useRestaurantStore();
  const [restaurant, setRestaurant] = useState(session?.restaurant ?? null);
  const [loading, setLoading] = useState(false);

  const fetchRestaurant = useCallback(async () => {
    if (!session) return;
    try {
      const res = await restaurantApi.getRestaurant(session.token);
      setRestaurant(res.restaurant);
    } catch { /* non-fatal */ }
  }, [session]);

  useEffect(() => { fetchRestaurant(); }, [fetchRestaurant]);

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const fcmToken = await loadFcmToken();
            if (fcmToken && session) {
              await mobileApi.unregisterDeviceToken(fcmToken, session.token).catch(() => {});
            }
            alertManager.stopAllAlerts('logout');
            unsubscribeAll();
            if (session) {
              await restaurantApi.logout(session.token).catch(() => {});
            }
            await clearSession();
            setSession(null);
            setAuthState('unauthenticated');
            router.replace('/(auth)/login');
          } finally { setLoading(false); }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }}>
      {/* Restaurant info */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Restaurant</Text>
        <InfoRow label="Name" value={restaurant?.name ?? session?.restaurant.name ?? ''} />
        {restaurant?.cuisine && <InfoRow label="Cuisine" value={restaurant.cuisine} />}
        {restaurant?.location && <InfoRow label="Location" value={restaurant.location} />}
        {restaurant?.owner_phone && <InfoRow label="Phone" value={restaurant.owner_phone} />}
      </View>

      {/* Update card */}
      {updateInfo?.updateAvailable && (
        <View style={[s.card, { borderWidth: 1.5, borderColor: NIVA_COLORS.orange }]}>
          <Text style={s.sectionTitle}>Update Available</Text>
          <Text style={s.updateText}>A new version of NIVA Restaurant is available.</Text>
          <TouchableOpacity style={s.updateBtn} onPress={() => Linking.openURL(updateInfo.downloadUrl)}>
            <Text style={s.updateBtnText}>Download Update</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* App info */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>App</Text>
        <InfoRow label="Version" value="1.0.2" />
        <InfoRow label="Role" value="Restaurant Owner" />
      </View>

      {/* Logout */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} disabled={loading}>
        {loading
          ? <ActivityIndicator color={NIVA_COLORS.red} />
          : <Text style={s.logoutText}>Sign Out</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  card: { backgroundColor: NIVA_COLORS.white, borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  sectionTitle: {
    fontSize: 12, fontFamily: 'Montserrat-Bold', color: NIVA_COLORS.gray500,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: 14, color: NIVA_COLORS.gray500, fontFamily: 'Montserrat-Regular' },
  infoValue: { fontSize: 14, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-Medium' },
  updateText: { fontSize: 13, color: NIVA_COLORS.gray700, marginBottom: 10 },
  updateBtn: { backgroundColor: NIVA_COLORS.orange, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  updateBtnText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 14 },
  logoutBtn: {
    borderWidth: 1.5, borderColor: NIVA_COLORS.red, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 32,
  },
  logoutText: { color: NIVA_COLORS.red, fontSize: 16, fontFamily: 'Montserrat-SemiBold' },
});
