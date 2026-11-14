/**
 * FCM Token Registration — Restaurant App
 *
 * Gets the native FCM token from the google-services.json embedded in the APK
 * (no EAS project ID needed) and registers it with the backend so push
 * notifications arrive on this device.
 *
 * Registration strategy:
 *   1. PRIMARY — POST /api/mobile/register-token via NIVA backend.
 *      Uses the restaurant owner's auth token. Silent failure — the backend
 *      deployment may be stale; we fall through to Supabase in that case.
 *   2. FALLBACK — Upsert directly into Supabase `device_tokens` using the
 *      session JWT (authenticated role). This works as long as migration 015
 *      (device_tokens RLS policies) has been applied.
 *
 * Either path succeeding is sufficient. The token only needs to exist in
 * device_tokens when an order arrives; how it got there doesn't matter.
 *
 * Noise policy:
 *   - Routine path (token unchanged, re-registration skipped): no logging.
 *   - Success: single [FCM] info line.
 *   - Expected failures (404 from stale deploy, known RLS): completely silent.
 *   - Unexpected failures: single warn line, no stack trace.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { mobileApi, SUPABASE_URL, SUPABASE_ANON_KEY } from '@niva/shared';
import { saveFcmToken } from '@niva/shared';

export async function registerFcmToken(
  authToken: string,
  role: 'restaurant_owner',
  restaurantId?: string
): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // 1. Check/request notification permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return; // User denied — nothing to register

    // 2. Get native FCM token
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const newToken = tokenData.data as string;
    if (!newToken) return;

    // NOTE: We intentionally do NOT skip when the token is unchanged.
    // The backend row for this device can be deactivated (is_active=false) on
    // logout/unregister, or by FCM when a send fails. If we skipped here, a
    // device that logs back in with the SAME token would never re-activate its
    // row and would stay permanently silent. Re-registering every call is an
    // idempotent upsert that guarantees is_active=true for THIS device — this
    // is what makes the siren ring on EVERY logged-in device, not just one.

    // 4. PRIMARY — backend API (uses service-role key on server, most reliable)
    let registered = false;
    try {
      await mobileApi.registerDeviceToken(
        { token: newToken, role, restaurantId, platform: 'android' },
        authToken
      );
      registered = true;
    } catch {
      // Silently fall through — backend may be stale (404) or temporarily down.
      // The Supabase path below is the reliable fallback.
    }

    // 5. FALLBACK — write directly to Supabase using the session JWT so that
    //    the authenticated-role RLS policies (migration 015) allow the upsert.
    if (!registered) {
      // Build a per-request Supabase client authenticated with the session JWT.
      // Using the anon key + Authorization header lets Supabase resolve the
      // `authenticated` role correctly, which the RLS policies require.
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${authToken}` } },
      });

      const record: Record<string, unknown> = {
        role,
        push_token: newToken,
        platform: 'android',
        is_active: true,
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };
      if (restaurantId) record.restaurant_id = restaurantId;

      const { error } = await supabase
        .from('device_tokens')
        .upsert(record, { onConflict: 'push_token' });

      if (error) {
        // Only log genuinely unexpected errors — not the RLS violation we're
        // fixing (that goes away once migration 015 is applied).
        if (!error.message.includes('row-level security')) {
          console.warn('[FCM] Token registration failed:', error.message);
        }
        return; // Don't save — will retry next launch
      }
      registered = true;
    }

    // 6. Persist locally — skips re-registration on the next app open
    if (registered) {
      await saveFcmToken(newToken);
      console.log('[FCM] Token registered for restaurant:', restaurantId);
    }
  } catch (e: any) {
    // Non-fatal — app works without push, but only the siren + realtime will fire
    console.warn('[FCM] Unexpected registration error:', e?.message ?? e);
  }
}
