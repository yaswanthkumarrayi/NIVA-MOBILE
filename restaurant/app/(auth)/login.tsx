/**
 * Restaurant Login Screen
 * Uses EXISTING restaurant portal login: POST /api/restaurant-portal/login
 * Same credentials as the web panel — restaurantId + phone + password
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import { restaurantApi, mobileApi } from '@niva/shared';
import { saveRestaurantSession } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import type { Restaurant } from '@niva/shared';
import { useRestaurantStore } from '../../src/services/restaurantStore';
import { registerFcmToken } from '../../src/services/fcmService';

export default function LoginScreen() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [error, setError] = useState('');
  const { setSession, setAuthState } = useRestaurantStore();

  useEffect(() => {
    restaurantApi.getActiveRestaurants()
      .then((res) => {
        setRestaurants(res.restaurants || []);
      })
      .catch(() => setError('Could not load restaurants. Check your connection.'))
      .finally(() => setLoadingRestaurants(false));
  }, []);

  const handleLogin = async () => {
    if (!selectedRestaurant) { setError('Please select your restaurant.'); return; }
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    if (!password) { setError('Please enter your password.'); return; }
    if (!/^\d{10}$/.test(phone.trim())) { setError('Enter a valid 10-digit phone number.'); return; }

    setLoading(true);
    setError('');

    try {
      const data = await restaurantApi.login({
        restaurantId: selectedRestaurant.id,
        phone: phone.trim(),
        password,
      });

      const session = {
        token: data.token,
        refreshToken: data.refreshToken,
        restaurant: data.restaurant ?? selectedRestaurant,
        role: 'restaurant_owner' as const,
      };

      await saveRestaurantSession(session);
      setSession(session);
      setAuthState('authenticated');

      // Register FCM token with backend (non-blocking)
      registerFcmToken(session.token, 'restaurant_owner', session.restaurant.id).catch(() => {});

      router.replace('/(tabs)/orders');
    } catch (e: any) {
      if (e?.status === 401) {
        setError('Invalid phone number or password.');
      } else if (e?.status === 403) {
        setError('This restaurant is currently deactivated. Contact admin.');
      } else if (e?.status === 429) {
        setError('Too many failed attempts. Please wait a few minutes.');
      } else {
        setError('Login failed. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Image source={require('../../assets/niva-logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>NIVA Restaurant</Text>
          <Text style={styles.subtitle}>Sign in to your restaurant account</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Restaurant Selector */}
          <Text style={styles.label}>Select Restaurant</Text>
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setShowPicker(!showPicker)}
            disabled={loadingRestaurants}
          >
            {loadingRestaurants ? (
              <ActivityIndicator size="small" color={NIVA_COLORS.orange} />
            ) : (
              <Text style={selectedRestaurant ? styles.selectorText : styles.selectorPlaceholder}>
                {selectedRestaurant ? selectedRestaurant.name : 'Choose your restaurant...'}
              </Text>
            )}
            <Text style={styles.selectorArrow}>{showPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showPicker && (
            <View style={styles.pickerDropdown}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                {restaurants.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={styles.pickerItem}
                    onPress={() => { setSelectedRestaurant(r); setShowPicker(false); setError(''); }}
                  >
                    <Text style={styles.pickerItemText}>{r.name}</Text>
                    {r.cuisine && <Text style={styles.pickerItemSubtext}>{r.cuisine}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Phone */}
          <Text style={[styles.label, { marginTop: 16 }]}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit phone number"
            placeholderTextColor={NIVA_COLORS.gray400}
            keyboardType="phone-pad"
            maxLength={10}
            autoComplete="tel"
          />

          {/* Password */}
          <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            placeholderTextColor={NIVA_COLORS.gray400}
            secureTextEntry
            autoComplete="password"
          />

          {/* Error */}
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Use the same credentials as your NIVA Restaurant web panel.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.black },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 32 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 80, height: 80, borderRadius: 16, marginBottom: 12 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: NIVA_COLORS.white,
    letterSpacing: 0.5,
    fontFamily: 'Montserrat-Bold',
  },
  subtitle: {
    fontSize: 14,
    color: NIVA_COLORS.gray400,
    marginTop: 4,
    fontFamily: 'Montserrat-Regular',
  },
  card: {
    backgroundColor: NIVA_COLORS.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: NIVA_COLORS.gray700,
    marginBottom: 6,
    fontFamily: 'Montserrat-SemiBold',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: NIVA_COLORS.gray200,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: NIVA_COLORS.gray50,
  },
  selectorText: { fontSize: 15, color: NIVA_COLORS.gray900, flex: 1, fontFamily: 'Montserrat-Medium' },
  selectorPlaceholder: { fontSize: 15, color: NIVA_COLORS.gray400, flex: 1 },
  selectorArrow: { fontSize: 12, color: NIVA_COLORS.gray500 },
  pickerDropdown: {
    borderWidth: 1.5,
    borderColor: NIVA_COLORS.gray200,
    borderRadius: 12,
    backgroundColor: NIVA_COLORS.white,
    marginTop: 4,
    overflow: 'hidden',
    elevation: 4,
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: NIVA_COLORS.gray100,
  },
  pickerItemText: { fontSize: 15, color: NIVA_COLORS.gray900, fontFamily: 'Montserrat-Medium' },
  pickerItemSubtext: { fontSize: 12, color: NIVA_COLORS.gray500, marginTop: 2 },
  input: {
    borderWidth: 1.5,
    borderColor: NIVA_COLORS.gray200,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: NIVA_COLORS.gray900,
    backgroundColor: NIVA_COLORS.gray50,
    fontFamily: 'Montserrat-Regular',
  },
  errorBox: {
    backgroundColor: NIVA_COLORS.redLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  errorText: { color: NIVA_COLORS.red, fontSize: 13, fontFamily: 'Montserrat-Medium' },
  button: {
    backgroundColor: NIVA_COLORS.black,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: NIVA_COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Montserrat-Bold',
  },
  footer: {
    textAlign: 'center',
    color: NIVA_COLORS.gray500,
    fontSize: 12,
    marginTop: 24,
    paddingHorizontal: 20,
    fontFamily: 'Montserrat-Regular',
  },
});
