/**
 * Customer Registration
 * Supabase email/password sign-up + Google OAuth. On projects with email
 * confirmation enabled, sign-up returns no session — we route back to login
 * with a "check your inbox" notice (the profile is created on first login).
 */
import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import { router, Link } from 'expo-router';
import { Screen } from '../../src/components/ui/Screen';
import { Card } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { GoogleButton } from '../../src/components/ui/GoogleButton';
import { useCustomerStore } from '../../src/services/customerStore';
import { registerWithEmail, signInWithGoogle } from '../../src/services/customerAuth';
import { theme } from '../../src/theme';

export default function RegisterScreen() {
  const { setSession, setAuthState } = useCustomerStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const { session, needsEmailConfirmation } = await registerWithEmail(email, password);
      if (needsEmailConfirmation || !session) {
        Alert.alert(
          'Check your email',
          'We sent a confirmation link to your email. Confirm it, then log in to finish setting up your profile.',
          [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
        );
        return;
      }
      setSession(session);
      setAuthState('authenticated');
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e?.message ?? 'Registration failed. Please try again.';
      setError(/already registered|already exists/i.test(msg)
        ? 'This email is already registered. Try logging in instead.'
        : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle();
      setSession(session);
      setAuthState('authenticated');
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message ?? 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav}>
        <View style={s.header}>
          <Text style={s.title}>Join NIVA</Text>
          <Text style={s.subtitle}>Create your account to get started</Text>
        </View>

        <Card>
          <GoogleButton onPress={handleGoogle} loading={googleLoading} disabled={loading} label="Sign up with Google" />
          <View style={s.divider}>
            <View style={s.line} />
            <Text style={s.dividerText}>OR SIGN UP WITH EMAIL</Text>
            <View style={s.line} />
          </View>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Min 6 characters"
            secureTextEntry
          />
          <Input
            label="Confirm Password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter your password"
            secureTextEntry
            error={error}
          />

          <Button label="Create Account" onPress={handleRegister} loading={loading} disabled={googleLoading} />
        </Card>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" style={s.footerLink}>Log In</Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  kav: { flex: 1, paddingHorizontal: theme.spacing.xl, paddingTop: 48, paddingBottom: 28 },
  header: { alignItems: 'center', marginBottom: theme.spacing.xxl },
  title: { ...theme.typography.title },
  subtitle: { ...theme.typography.bodyMuted, marginTop: 4 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: theme.spacing.xl },
  line: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { marginHorizontal: 10, color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.xxl },
  footerText: { ...theme.typography.bodyMuted },
  footerLink: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.primary },
});
