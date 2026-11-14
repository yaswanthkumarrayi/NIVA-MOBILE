/**
 * Partner App Root Layout
 * Same startup sequence as the restaurant app, but for partner role.
 */
import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform, Alert, Linking } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Font from 'expo-font';
import Constants from 'expo-constants';
import {
  loadPartnerSession,
  savePartnerSession,
  clearSession,
  mobileApi,
  partnerApi,
  partnerAuthApi,
  setAuthRefresher,
  NIVA_COLORS,
} from '@niva/shared';
import type { PartnerSession } from '@niva/shared';
import { usePartnerStore, PartnerProvider } from '../src/services/partnerStore';
import { setupNotificationHandlers } from '../src/services/notificationHandler';
import { registerFcmToken } from '../src/services/fcmService';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // shouldShowAlert is deprecated in expo-notifications ~0.31;
    // shouldShowBanner + shouldShowList are the replacement (both required).
    shouldShowAlert: true,   // kept for back-compat with older SDK versions
    shouldShowBanner: true,  // required: show notification as heads-up banner
    shouldShowList: true,    // required: show in notification drawer list
    shouldPlaySound: true,   // Allow system sound; siren module handles looping alert
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  return (
    <PartnerProvider>
      <RootLayoutInner />
    </PartnerProvider>
  );
}

function RootLayoutInner() {
  const { authState, setAuthState, setSession, setUpdateInfo } = usePartnerStore();
  // Guard so initialize only ever runs once, even if the component re-renders
  // before the async work completes.
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    // ── Register the 401 → refresh → retry handler ─────────────────────────────
    // When any authenticated request 401s (access token expired), the shared
    // API layer calls this to mint a fresh access token from the stored refresh
    // token, persist it, update the in-memory session, and retry the request.
    // A network/refresh failure returns null → the 401 surfaces but we do NOT
    // log the partner out here (that decision is made only at cold start).
    setAuthRefresher(async () => {
      try {
        const stored = await loadPartnerSession();
        if (!stored?.refreshToken) return null;
        const data = await partnerAuthApi.refreshSession(stored.refreshToken);
        const newAccess = data.session?.access_token;
        const newRefresh = data.session?.refresh_token;
        if (!newAccess) return null;
        const updated: PartnerSession = {
          ...stored,
          token: newAccess,
          refreshToken: newRefresh ?? stored.refreshToken,
        };
        await savePartnerSession(updated);
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

        if (Platform.OS === 'android') {
          await Notifications.requestPermissionsAsync();
        }

        // ── Restore + validate the persisted session ──────────────────────────
        //
        // Strategy (mirrors the restaurant app, adapted for Supabase partner auth):
        //   a) No stored session       → unauthenticated.
        //   b) getProfile succeeds      → authenticated (fresh is_online too).
        //   c) getProfile returns 401   → access token expired. Try refresh with
        //      the stored refresh token:
        //        • refresh + retry ok   → persist new tokens, authenticated.
        //        • refresh 401/invalid  → refresh token dead → clear, unauthenticated.
        //        • refresh network error→ keep cached session optimistically
        //                                 (authenticated) — never log out on a
        //                                 temporary network failure.
        //   d) Any non-401 (network/5xx)→ keep cached session, authenticated.
        //
        // NOTE: the API layer's registered refresher already retries getProfile
        // once after a successful refresh, so a plain success here means the
        // session is valid (possibly already transparently refreshed).
        const stored = await loadPartnerSession();
        if (!stored) {
          setAuthState('unauthenticated');
          return;
        }

        let activeSession: PartnerSession = stored;
        try {
          const profileRes = await partnerApi.getProfile(stored.token);
          // getProfile may have triggered a transparent refresh; re-read the
          // latest persisted tokens so we keep the freshest access token.
          const latest = await loadPartnerSession();
          activeSession = {
            ...(latest ?? stored),
            // Backend is the single source of truth for is_online (and every
            // other partner field). We take profileRes.partner verbatim.
            partner: profileRes.partner,
          };
          setSession(activeSession);
          setAuthState('authenticated');
          // Persist the authoritative profile so the on-disk cache can never
          // drift from the backend (prevents a stale is_online from a previous
          // session being restored on a later cold start — see Bug 3).
          await savePartnerSession(activeSession).catch(() => {});
        } catch (e: any) {
          if (e?.status === 401) {
            // Access token expired AND the transparent refresh in the API layer
            // also failed → the refresh token is genuinely dead/revoked.
            await clearSession();
            setSession(null);
            setAuthState('unauthenticated');
            return;
          }
          // Non-401 (network, timeout, 5xx) → keep the cached session so the
          // partner stays logged in through a temporary connectivity loss.
          //
          // FAIL-SAFE OFFLINE (Bug 3): we could NOT confirm the partner's
          // online status with the backend, so we must NOT present them as
          // ONLINE from a stale cached value. The backend is authoritative for
          // online status; when it is unreachable we fall back to OFFLINE so
          // the partner is never silently put back online (and therefore never
          // receives order alerts the backend doesn't expect them to get)
          // after a restart / network loss. A real ONLINE requires an explicit,
          // backend-confirmed toggle once connectivity returns.
          activeSession = { ...stored, partner: { ...stored.partner, is_online: false } };
          setSession(activeSession);
          setAuthState('authenticated');
        }

        // Re-register FCM token on every launch — the native token may have
        // rotated. registerFcmToken is a no-op when unchanged.
        registerFcmToken(
          activeSession.token,
          'partner',
          activeSession.partner.id,
        ).catch(() => {});

        setupNotificationHandlers();

        mobileApi.getAppVersion('partner', Constants.expoConfig?.version)
          .then((info) => {
            setUpdateInfo(info);
            if (info.updateRequired) {
              Alert.alert(
                'Update Required',
                'A new version of NIVA Partner is required.',
                [{ text: 'Download', onPress: () => Linking.openURL(info.downloadUrl) }],
                { cancelable: false }
              );
            }
          })
          .catch(() => {});

      } catch (e) {
        console.error('[App] Initialization error:', e);
        // Unknown catastrophic error — resolve to unauthenticated so the user
        // can retry from the login screen rather than being stuck on splash.
        setAuthState('unauthenticated');
      } finally {
        SplashScreen.hideAsync();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — intentionally runs once on mount only

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
      <ErrorBoundary name="root">
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
        </Stack>
      </ErrorBoundary>
    </>
  );
}
