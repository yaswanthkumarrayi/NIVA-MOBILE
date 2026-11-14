/**
 * OAuth Deep-Link Callback
 *
 * This screen handles the return from Google OAuth. When the user taps
 * "Continue with Google" in the NIVA app:
 *   1. expo-web-browser opens the Supabase OAuth URL in a Chrome Custom Tab.
 *   2. After authentication, Google redirects to: niva://auth-callback#access_token=...
 *   3. Android intent filter intercepts the deep link and opens this screen.
 *   4. We read the tokens from the URL, build a CustomerSession, persist it,
 *      and redirect to the intended destination.
 *
 * IMPORTANT – Supabase Dashboard Setup Required:
 *   Authentication → URL Configuration → Redirect URLs
 *   Add: niva://auth-callback
 *   Without this, Supabase ignores the redirectTo parameter and falls back
 *   to the first registered URL (the website), which is the original bug.
 *
 * This screen MUST exist in the router for the deep link to be handled.
 * Without it, Expo Router has no match for the path and the callback is lost.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { customerAuthApi, saveCustomerSession, customerApi } from '@niva/shared';
import type { Customer, CustomerSession } from '@niva/shared';
import { useCustomerStore } from '../src/services/customerStore';
import { theme } from '../src/theme';

interface SupabaseAuthResult {
  session: { access_token: string; refresh_token: string } | null;
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> | null } | null;
}

function parseAuthCallback(url: string): {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  error?: string;
  errorDescription?: string;
} {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  const collect = (segment: string) => {
    for (const pair of segment.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const val = eq === -1 ? '' : pair.slice(eq + 1);
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, ' '));
      } catch {
        params[key] = val;
      }
    }
  };

  if (hashIndex !== -1) collect(url.slice(hashIndex + 1));
  if (queryIndex !== -1) {
    const end = hashIndex === -1 ? url.length : hashIndex;
    collect(url.slice(queryIndex + 1, end));
  }

  return {
    accessToken: params['access_token'] || undefined,
    refreshToken: params['refresh_token'] || undefined,
    code: params['code'] || undefined,
    error: params['error'] || undefined,
    errorDescription: params['error_description'] || undefined,
  };
}

export default function AuthCallbackScreen() {
  const { setSession, setAuthState } = useCustomerStore();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // expo-router provides the current URL via Linking
    const processCallback = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (!url) {
          throw new Error('No callback URL received. Please try signing in again.');
        }

        const { accessToken, refreshToken, code, error, errorDescription } = parseAuthCallback(url);

        if (error) {
          throw new Error(errorDescription || error || 'Authentication was cancelled.');
        }

        let authData: SupabaseAuthResult;

        if (accessToken && refreshToken) {
          // Implicit flow — tokens arrive in the URL fragment
          authData = (await customerAuthApi.setSession(accessToken, refreshToken)) as SupabaseAuthResult;
        } else if (code) {
          // PKCE flow — exchange code for session
          authData = (await customerAuthApi.exchangeCodeForSession(code)) as SupabaseAuthResult;
        } else {
          throw new Error('No authentication tokens in callback URL.');
        }

        const token = authData.session?.access_token;
        const user = authData.user;

        if (!token || !user?.id) {
          throw new Error('Authentication did not return a valid session.');
        }

        // Fetch or create customer profile (same logic as customerAuth.ts buildSession)
        let customer: Customer | null = null;
        try {
          const res = await customerApi.getProfile(user.id, token);
          customer = res.data;
        } catch { /* will create below */ }

        if (!customer) {
          const email = user.email ?? '';
          const name = user.user_metadata?.full_name || (email ? email.split('@')[0] : 'User');
          try {
            const created = await customerApi.upsertProfile({ id: user.id, name, email }, token);
            customer = created.data ?? { id: user.id, name, email };
          } catch {
            customer = { id: user.id, name: user.user_metadata?.full_name || 'User', email: user.email ?? '' };
          }
        }

        const refreshTok = authData.session?.refresh_token;
        const session: CustomerSession = {
          token,
          refreshToken: refreshTok ?? undefined,
          customer,
          role: 'customer',
        };

        await saveCustomerSession(session);
        setSession(session);
        setAuthState('authenticated');

        // Navigate to the intended destination (tabs home by default)
        router.replace('/(tabs)');
      } catch (e: any) {
        console.error('[AuthCallback] Error:', e?.message ?? e);
        setErrorMessage(e?.message ?? 'Authentication failed. Please try again.');
        setStatus('error');
        // Redirect to login after a short delay
        setTimeout(() => router.replace('/(auth)/login'), 2500);
      }
    };

    processCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={s.container}>
      {status === 'processing' ? (
        <>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={s.text}>Completing sign-in…</Text>
        </>
      ) : (
        <>
          <Text style={s.errorIcon}>✕</Text>
          <Text style={s.errorText}>{errorMessage}</Text>
          <Text style={s.hint}>Redirecting to login…</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  text: {
    fontFamily: theme.fonts.medium,
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
  },
  errorIcon: {
    fontSize: 40,
    color: theme.colors.error,
  },
  errorText: {
    fontFamily: theme.fonts.medium,
    fontSize: theme.fontSize.md,
    color: theme.colors.error,
    textAlign: 'center',
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
  },
});
