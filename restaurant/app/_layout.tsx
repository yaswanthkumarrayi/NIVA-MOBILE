/**
 * Root layout — App startup entry point.
 *
 * Auth state machine (lives in RestaurantProvider so index.tsx can read it):
 *   'loading'         → SecureStore read + token refresh in progress
 *   'authenticated'   → valid session confirmed, navigate to dashboard
 *   'unauthenticated' → no session or explicit logout, navigate to login
 *
 * Critical fixes (v1.0.1):
 *   1. Never treat session===null as logout while state is 'loading'.
 *   2. Try token refresh BEFORE treating a 401 as a real logout.
 *   3. Only clear session when refresh ALSO fails with 401 (genuinely expired).
 *   4. Network / 5xx / timeout errors NEVER cause logout.
 *   5. Splash screen stays up until authState is resolved — no login flicker.
 */
import { useEffect, useCallback, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform, Alert, Linking } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Font from 'expo-font';
import Constants from 'expo-constants';
import {
  loadRestaurantSession,
  saveRestaurantSession,
  clearSession,
  mobileApi,
  restaurantApi,
  refreshRestaurantSession,
  setAuthRefresher,
  NIVA_COLORS,
} from '@niva/shared';
import { useRestaurantStore, RestaurantProvider } from '../src/services/restaurantStore';
import { setupNotificationHandlers } from '../src/services/notificationHandler';
import { registerFcmToken } from '../src/services/fcmService';

SplashScreen.preventAutoHideAsync();

// Show foreground notifications with sound (JS path, while app is open).
// The native NivaSirenService is the primary path for background/locked/recents.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

export default function RootLayout() {
  return (
    <RestaurantProvider>
      <RootLayoutInner />
    </RestaurantProvider>
  );
}

function RootLayoutInner() {
  const { authState, setAuthState, setSession, setUpdateInfo } = useRestaurantStore();
  // Guard against double-init in React StrictMode
  const initializedRef = useRef(false);

  const initialize = useCallback(async () => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // ── Register the 401 → refresh → retry handler ─────────────────────────────
    // When any authenticated request 401s (access token expired mid-session),
    // the shared API layer calls this to mint a fresh access token from the
    // stored refresh token, persist it, update the in-memory session, and retry
    // the original request ONCE. Without this, the restaurant app surfaced
    // "Invalid or expired token" on order updates / QR-related calls after the
    // ~1h token lifetime and only recovered on a cold restart.
    setAuthRefresher(async () => {
      try {
        const stored = await loadRestaurantSession();
        if (!stored?.refreshToken) return null;
        const refreshed = await refreshRestaurantSession(stored.refreshToken);
        if (!refreshed?.access_token) return null;
        const updated = {
          ...stored,
          token:        refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? stored.refreshToken,
        };
        await saveRestaurantSession(updated);
        setSession(updated);
        return refreshed.access_token;
      } catch {
        return null;
      }
    });

    try {
      // ── 1. Fonts ────────────────────────────────────────────────────────────
      await Font.loadAsync({
        'Montserrat-Regular':  require('../assets/fonts/Montserrat-Regular.ttf'),
        'Montserrat-Medium':   require('../assets/fonts/Montserrat-Medium.ttf'),
        'Montserrat-SemiBold': require('../assets/fonts/Montserrat-SemiBold.ttf'),
        'Montserrat-Bold':     require('../assets/fonts/Montserrat-Bold.ttf'),
      }).catch(() => { /* system font fallback is acceptable */ });

      // ── 2. Notification permission (Android 13+) ────────────────────────────
      if (Platform.OS === 'android') {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') console.warn('[App] Notification permission not granted');
      }

      // ── 3. Load stored session ──────────────────────────────────────────────
      const stored = await loadRestaurantSession();
      if (!stored) {
        setAuthState('unauthenticated');
        return;
      }

      // ── 4. Validate / refresh the access token ─────────────────────────────
      //
      // Strategy:
      //   a) Call an authenticated endpoint with the stored access token.
      //   b) If it succeeds → session is valid, proceed.
      //   c) If it returns 401 → access token has expired.
      //      Try refreshRestaurantSession(stored.refreshToken).
      //      • Refresh succeeds  → persist new tokens, proceed.
      //      • Refresh fails 401 → both tokens dead, clear session, go to login.
      //      • Refresh fails     → network/server error, keep stored session
      //                            optimistically (do NOT log the user out).
      //   d) Any non-401 error (network, 5xx, timeout) → keep session, proceed.
      //      Never log the user out due to a temporary network failure.

      let activeSession = { ...stored };

      try {
        await restaurantApi.getRestaurant(stored.token);
        // Token valid — nothing to update
      } catch (e: any) {
        if (e?.status === 401) {
          // ── 4c. Access token expired ──────────────────────────────────────
          if (stored.refreshToken) {
            const refreshed = await refreshRestaurantSession(stored.refreshToken);

            if (refreshed) {
              // Persist new tokens
              activeSession = {
                ...stored,
                token:        refreshed.access_token,
                refreshToken: refreshed.refresh_token,
              };
              await saveRestaurantSession(activeSession);

              // Verify the refreshed token (catches edge cases where refresh
              // returned a token that the backend still rejects)
              try {
                await restaurantApi.getRestaurant(activeSession.token);
              } catch (e2: any) {
                if (e2?.status === 401) {
                  // Refreshed token also rejected — session is genuinely dead
                  await clearSession();
                  setAuthState('unauthenticated');
                  return;
                }
                // Non-401 after refresh → keep session optimistically
              }
            } else {
              // refreshRestaurantSession returned null (network/server error).
              // Do NOT log the user out. Keep the stored session and let the
              // dashboard handle any auth errors at request time.
              console.warn('[App] Token refresh failed (network?) — keeping stored session');
              // activeSession stays as stored
            }
          } else {
            // No refresh token at all — 401 means genuinely logged out
            await clearSession();
            setAuthState('unauthenticated');
            return;
          }
        }
        // Non-401 (network, 5xx) → fall through, session kept as stored
      }

      // ── 5. Session is good (or optimistically kept) ─────────────────────────
      setSession(activeSession);
      setAuthState('authenticated');

      // Register FCM token with the current (possibly refreshed) token
      registerFcmToken(
        activeSession.token,
        'restaurant_owner',
        activeSession.restaurant.id
      ).catch(() => { /* non-fatal */ });

      // ── 6. Notification tap/response handlers ───────────────────────────────
      setupNotificationHandlers();

      // ── 7. Version check (non-blocking, non-fatal) ──────────────────────────
      mobileApi.getAppVersion('restaurant', Constants.expoConfig?.version)
        .then((info) => {
          setUpdateInfo(info);
          if (info.updateRequired) {
            Alert.alert(
              'Update Required',
              'A new version of NIVA Restaurant is required. Please download the update.',
              [{ text: 'Download', onPress: () => Linking.openURL(info.downloadUrl) }],
              { cancelable: false }
            );
          }
        })
        .catch(() => { /* non-fatal */ });

    } catch (err) {
      console.error('[App] Initialization error:', err);
      // Unknown catastrophic error — go to unauthenticated so the user can retry
      setAuthState('unauthenticated');
    } finally {
      SplashScreen.hideAsync();
    }
  }, [setAuthState, setSession, setUpdateInfo]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // While auth state is resolving, the native splash screen is shown.
  // This View is a safety net for the brief gap between splash hide and
  // the navigator rendering the correct first screen.
  if (authState === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: NIVA_COLORS.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={NIVA_COLORS.orange} size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
