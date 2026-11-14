/**
 * FCM Token Registration — Partner App
 *
 * Gets the native FCM token from google-services.json and registers it so
 * push notifications arrive on this device.
 *
 * Registration strategy:
 *   1. PRIMARY — POST /api/mobile/register-token via NIVA backend.
 *      Silent failure — backend deployment may be stale.
 *   2. FALLBACK — Upsert directly into Supabase `device_tokens` using the
 *      session JWT (authenticated role). Requires migration 015 to be applied.
 *
 * Noise policy: only one success log line. All expected failures are silent.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { mobileApi, SUPABASE_URL, SUPABASE_ANON_KEY } from '@niva/shared';
import { saveFcmToken } from '@niva/shared';

export async function registerFcmToken(
  authToken: string,
  role: 'partner',
  partnerId?: string
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
    if (finalStatus !== 'granted') return;

    // 2. Get native FCM token
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const newToken = tokenData.data as string;
    if (!newToken) return;

    // NOTE: We intentionally do NOT skip when the token is unchanged.
    // The backend row for this device can be deactivated (is_active=false) on
    // logout/unregister, or by FCM when a send fails. Skipping here would leave
    // a device that logs back in with the SAME token permanently silent.
    // Re-registering every call is an idempotent upsert that guarantees
    // is_active=true for THIS device, so alerts reach every logged-in device.

    // 4. PRIMARY — backend API
    let registered = false;
    try {
      await mobileApi.registerDeviceToken(
        { token: newToken, role, partnerId, platform: 'android' },
        authToken
      );
      registered = true;
    } catch {
      // Silently fall through to Supabase path below
    }

    // 5. FALLBACK — Supabase direct upsert using the session JWT so the
    //    authenticated-role RLS policies (migration 015) allow the write.
    if (!registered) {
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
      if (partnerId) record.partner_id = partnerId;

      const { error } = await supabase
        .from('device_tokens')
        .upsert(record, { onConflict: 'push_token' });

      if (error) {
        if (!error.message.includes('row-level security')) {
          console.warn('[FCM] Token registration failed:', error.message);
        }
        return;
      }
      registered = true;
    }

    if (registered) {
      await saveFcmToken(newToken);
      console.log('[FCM] Token registered for partner:', partnerId);
    }
  } catch (e: any) {
    console.warn('[FCM] Unexpected registration error:', e?.message ?? e);
  }
}
