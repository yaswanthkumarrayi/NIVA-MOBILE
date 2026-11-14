/**
 * Partner Login Screen
 * Uses Supabase signInWithPassword with synthetic email: phone@partner.com
 * Same credentials as the web partner panel.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, StyleSheet, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { partnerAuthApi, partnerApi } from '@niva/shared';
import { savePartnerSession } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import { usePartnerStore } from '../../src/services/partnerStore';
import { registerFcmToken } from '../../src/services/fcmService';

export default function PartnerLoginScreen() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSession, setAuthState } = usePartnerStore();

  const handleLogin = async () => {
    if (!phone.trim()) { setError('Enter your phone number.'); return; }
    if (!/^\d{10}$/.test(phone.trim())) { setError('Enter a valid 10-digit phone number.'); return; }
    if (!password) { setError('Enter your password.'); return; }

    setLoading(true);
    setError('');

    try {
      // Authenticate via Supabase (same as web partner panel)
      const authData = await partnerAuthApi.signIn(phone.trim(), password);
      const token = authData.session?.access_token;
      const refreshToken = authData.session?.refresh_token;

      if (!token) throw new Error('No session token returned.');

      // Verify role is 'partner'
      const userRole =
        authData.user?.user_metadata?.role ||
        authData.user?.app_metadata?.role;
      if (userRole !== 'partner') {
        setError('This account does not have partner access. Use the restaurant app for restaurant accounts.');
        return;
      }

      // Fetch partner profile
      const profileRes = await partnerApi.getProfile(token);
      const partner = profileRes.partner;

      const session = { token, refreshToken, partner, role: 'partner' as const };
      await savePartnerSession(session);
      setSession(session);
      setAuthState('authenticated');

      // Register FCM token
      registerFcmToken(token, 'partner', partner.id).catch(() => {});

      router.replace('/(tabs)/available');
    } catch (e: any) {
      if (e?.message?.includes('Invalid login credentials')) {
        setError('Invalid phone number or password.');
      } else if (e?.message?.includes('Email not confirmed')) {
        setError('Account not yet activated. Contact admin.');
      } else {
        setError(e.message ?? 'Login failed. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Image source={require('../../assets/niva-logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.title}>NIVA Partner</Text>
          <Text style={s.subtitle}>Sign in to your delivery partner account</Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Phone Number</Text>
          <TextInput
            style={s.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit phone number"
            placeholderTextColor={NIVA_COLORS.gray400}
            keyboardType="phone-pad"
            maxLength={10}
            autoComplete="tel"
          />

          <Text style={[s.label, { marginTop: 16 }]}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
            placeholderTextColor={NIVA_COLORS.gray400}
            secureTextEntry
            autoComplete="password"
          />

          {!!error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>
          Use the same credentials as your NIVA Partner web panel.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.black },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 32 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 80, height: 80, borderRadius: 16, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: NIVA_COLORS.white, fontFamily: 'Montserrat-Bold' },
  subtitle: { fontSize: 14, color: NIVA_COLORS.gray400, marginTop: 4 },
  card: {
    backgroundColor: NIVA_COLORS.white, borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 10,
  },
  label: { fontSize: 13, fontWeight: '600', color: NIVA_COLORS.gray700, marginBottom: 6, fontFamily: 'Montserrat-SemiBold' },
  input: {
    borderWidth: 1.5, borderColor: NIVA_COLORS.gray200, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: NIVA_COLORS.gray900,
    backgroundColor: NIVA_COLORS.gray50,
  },
  errorBox: { backgroundColor: NIVA_COLORS.redLight, borderRadius: 10, padding: 12, marginTop: 12 },
  errorText: { color: NIVA_COLORS.red, fontSize: 13 },
  button: {
    backgroundColor: NIVA_COLORS.black, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Montserrat-Bold' },
  footer: { textAlign: 'center', color: NIVA_COLORS.gray500, fontSize: 12, marginTop: 24, paddingHorizontal: 20 },
});
