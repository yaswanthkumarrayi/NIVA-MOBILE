/**
 * Notification Handler — Restaurant App
 *
 * Handles:
 *   1. Foreground notification received → start siren + log to history
 *   2. Notification tap (from system tray) → sync siren state + navigate
 *   3. restaurant_stop_siren data message → stop the specific order's siren
 *
 * Background siren strategy
 * ─────────────────────────
 * When a high-priority FCM data message arrives while the app is backgrounded,
 * removed from Recents, or terminated, Android delivers it to NivaFcmService.kt
 * which starts NivaSirenService directly — no JS involvement needed.
 *
 * When the user taps the notification, the app comes to foreground and
 * addNotificationResponseReceivedListener fires. We sync JS alertManager state
 * (startAlert is idempotent — it re-arms if the JS map is empty due to cold
 * start, and is a no-op if the siren is already tracked).
 *
 * restaurant_stop_siren
 * ─────────────────────
 * Sent by the backend when another device accepts the order. Received here via
 * addNotificationReceivedListener when the app is in the foreground. In the
 * background/killed state, NivaFcmService.kt handles it natively.
 */
import * as Notifications from 'expo-notifications';
import { NativeModules, Platform } from 'react-native';
import { router } from 'expo-router';
import { alertManager } from '@niva/shared';
import { addNotificationToHistory } from '../hooks/useNotificationHistory';

// Direct reference to native siren module
const SirenModule = Platform.OS === 'android' ? NativeModules.NivaSirenModule : null;

// ─── Subscription refs (one per type, kept module-level) ─────────────────────
let _responseSubscription:   Notifications.Subscription | null = null;
let _foregroundSubscription: Notifications.Subscription | null = null;

/**
 * Set up all notification listeners.
 * Call once at app startup from _layout.tsx.
 * Safe to call multiple times — removes stale subscriptions first.
 */
export function setupNotificationHandlers() {
  // Clean up any existing subscriptions
  _responseSubscription?.remove();
  _foregroundSubscription?.remove();

  // ── Foreground: notification received while app is open ─────────────────────
  _foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const data        = notification.request.content.data as Record<string, any>;
      const type        = data?.type as string | undefined;
      const orderId     = data?.orderId as string | undefined;
      const orderNumber = data?.orderNumber as string | undefined;
      const title       = notification.request.content.title ?? 'NIVA Restaurant';
      const body        = notification.request.content.body  ?? '';

      if (type === 'restaurant_new_order' && orderId) {
        // Start the siren (idempotent — no-op if already running for this order)
        alertManager.startAlert(orderId, orderNumber ?? orderId, 'restaurant_new_order');
        // Ensure native siren is running (belt-and-suspenders)
        if (SirenModule) {
          try { SirenModule.startSiren(orderId); } catch { /* non-fatal */ }
        }
      }

      if (type === 'restaurant_stop_siren' && orderId) {
        // Another device accepted this order — stop its siren on this device
        alertManager.stopAlert(orderId, 'taken_by_other');
      }

      // Log to in-app notification history
      if (orderId) {
        addNotificationToHistory({
          id:         notification.request.identifier,
          orderId,
          title,
          body,
          receivedAt: new Date().toISOString(),
        });
      }
    }
  );

  // ── Tap: user tapped notification from system tray ──────────────────────────
  // This fires when:
  //   a) App was backgrounded/in Recents → user taps the heads-up or drawer notification
  //   b) App was cold-started by the notification tap
  //
  // In case (b) the JS alertManager map is empty because the native siren was
  // started by NivaFcmService.kt before JS loaded. We call startAlert() here
  // which re-arms the JS state and calls SirenModule.startSiren() again
  // (NivaSirenService handles duplicate starts idempotently via its activeOrderIds set).
  _responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data        = response.notification.request.content.data as Record<string, any>;
      const type        = data?.type as string | undefined;
      const orderId     = data?.orderId as string | undefined;
      const orderNumber = data?.orderNumber as string | undefined;

      if (orderId && type === 'restaurant_new_order') {
        // Sync JS state (idempotent re-arm if this is a cold start)
        if (SirenModule) {
          try { SirenModule.startSiren(orderId); } catch { /* non-fatal */ }
        }
        alertManager.startAlert(orderId, orderNumber ?? orderId, 'restaurant_new_order');
        // Navigate to the order — user must tap ACCEPT to stop the siren
        router.push(`/order/${orderId}`);
      }
    }
  );
}

export function teardownNotificationHandlers() {
  _responseSubscription?.remove();
  _foregroundSubscription?.remove();
  _responseSubscription   = null;
  _foregroundSubscription = null;
}
