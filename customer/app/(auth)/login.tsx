/**
 * Customer Login
 * Supabase email/password + Google OAuth — same accounts as the NIVA website.
 */
import React, { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Image, StyleSheet } from 'react-native';
import { router, Link } from 'expo-router';
import { Screen } from '../../src/components/ui/Screen';
import { Card } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { GoogleButton } from '../../src/components/ui/GoogleButton';
import { useCustomerStore } from '../../src/services/customerStore';
import { signInWithEmail, signInWithGoogle, isProfileComplete } from '../../src/services/customerAuth';
import { theme } from '../../src/theme';

export default function LoginScreen() {
  const { setSession, setAuthState } = useCustomerStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = (profileComplete: boolean) => {
    setAuthState('authenticated');
    // Profile completion lives in a later phase; for now land on the app.
    router.replace('/(tabs)');
  };

  const handleEmailLogin = async () => {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true);
    try {
      const session = await signInWithEmail(email, password);
      setSession(session);
      finish(isProfileComplete(session.customer));
    } catch (e: any) {
      const msg = e?.message ?? 'Login failed. Check your connection.';
      setError(/invalid login credentials/i.test(msg)
        ? "Invalid email or password. If you haven't signed up yet, create an account first."
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
      finish(isProfileComplete(session.customer));
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
          <Image source={require('../../assets/niva-logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.title}>Welcome to NIVA</Text>
          <Text style={s.subtitle}>Login to order your favourites</Text>
        </View>

        <Card style={s.card}>
          <GoogleButton onPress={handleGoogle} loading={googleLoading} disabled={loading} />
          <View style={s.divider}>
            <View style={s.line} />
            <Text style={s.dividerText}>OR</Text>
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
            placeholder="Enter your password"
            secureTextEntry
            autoComplete="password"
            error={error}
          />

          <Button label="Login" onPress={handleEmailLogin} loading={loading} disabled={googleLoading} />
        </Card>

        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/register" style={s.footerLink}>Sign Up</Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  kav: { flex: 1, paddingHorizontal: theme.spacing.xl, paddingTop: 56, paddingBottom: 28 },
  header: { alignItems: 'center', marginBottom: theme.spacing.xxxl },
  logo: { width: 76, height: 76, borderRadius: 18, marginBottom: 14 },
  title: { ...theme.typography.title },
  subtitle: { ...theme.typography.bodyMuted, marginTop: 4 },
  card: {},
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: theme.spacing.xl },
  line: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dividerText: { marginHorizontal: 12, color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.xxl },
  footerText: { ...theme.typography.bodyMuted },
  footerLink: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.primary },
});
