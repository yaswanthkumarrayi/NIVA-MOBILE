/**
 * NIVA Customer — Root Layout
 *
 * Key rule for expo-router v5.1+: the root layout MUST always render the
 * <Stack> so the navigation context is established on first render.
 * Returning a plain <View> before the <Stack> (expo-router v5.0 pattern)
 * silently prevents navigation initialising in v5.1+, producing a black screen.
 * We handle the loading state with an absoluteFill overlay on top of the Stack.
 *
 * Startup sequence:
 *   1. Register the 401 → refresh → retry handler with the shared API layer.
 *   2. Load fonts.
 *   3. Restore + validate the persisted session (customerAuth.restoreSession).
 *   4. Resolve authState → 'authenticated' | 'unauthenticated', hide splash.
 */
import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import {
  loadCustomerSession,
  saveCustomerSession,
  customerAuthApi,
  setAuthRefresher,
} from '@niva/shared';
import type { CustomerSession } from '@niva/shared';
import { CustomerProvider, useCustomerStore } from '../src/services/customerStore';
import { CartProvider } from '../src/services/cartStore';
import { restoreSession } from '../src/services/customerAuth';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <CustomerProvider>
        <CartProvider>
          <RootLayoutInner />
        </CartProvider>
      </CustomerProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutInner() {
  const { authState, setAuthState, setSession } = useCustomerStore();
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    // 401 → refresh → retry handler (shared API layer)
    setAuthRefresher(async () => {
      try {
        const stored = await loadCustomerSession();
        if (!stored?.refreshToken) return null;
        const data = await customerAuthApi.refreshSession(stored.refreshToken);
        const newAccess = data.session?.access_token;
        const newRefresh = data.session?.refresh_token;
        if (!newAccess) return null;
        const updated: CustomerSession = {
          ...stored,
          token: newAccess,
          refreshToken: newRefresh ?? stored.refreshToken,
        };
        await saveCustomerSession(updated);
        setSession(updated);
        return newAccess;
      } catch {
        return null;
      }
    });

    (async () => {
      try {
        await Font.loadAsync({
          'Montserrat-Regular': require('../assets/fonts/Montserrat-Regular.ttf'),
          'Montserrat-Medium': require('../assets/fonts/Montserrat-Medium.ttf'),
          'Montserrat-SemiBold': require('../assets/fonts/Montserrat-SemiBold.ttf'),
          'Montserrat-Bold': require('../assets/fonts/Montserrat-Bold.ttf'),
        }).catch(() => {});

        const session = await restoreSession();
        if (session) {
          setSession(session);
          setAuthState('authenticated');
        } else {
          setAuthState('unauthenticated');
        }
      } catch (e) {
        console.error('[App] Init error:', e instanceof Error ? e.message : e);
        setAuthState('unauthenticated');
      } finally {
        SplashScreen.hideAsync().catch(() => {});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <ErrorBoundary name="root">
        {/* Stack is ALWAYS rendered — navigation context must exist from frame 1 */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFF9F3' } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth-callback" />
          <Stack.Screen name="restaurant/[id]" />
          <Stack.Screen name="cart" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="deliveries" />
          <Stack.Screen name="order/[id]" />
          <Stack.Screen name="addresses" />
          <Stack.Screen name="edit-profile" />
        </Stack>
      </ErrorBoundary>

      {/* Loading overlay sits on top while session is being restored */}
      {authState === 'loading' && (
        <View style={s.overlay}>
          <ActivityIndicator color="#F47738" size="large" />
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF9F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
