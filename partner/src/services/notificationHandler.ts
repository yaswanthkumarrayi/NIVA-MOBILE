/**
 * Partner notification handler
 *
 * Same pattern as the restaurant handler — no expo-task-manager needed.
 * Background siren is handled natively by the NivaSirenService via FCM.
 * JS side re-arms on notification tap (addNotificationResponseReceivedListener).
 */
import * as Notifications from 'expo-notifications';
import { NativeModules, Platform } from 'react-native';
import { alertManager } from '@niva/shared';
import { addNotificationToHistory } from '../hooks/useNotificationHistory';

const SirenModule = Platform.OS === 'android' ? NativeModules.NivaSirenModule : null;

let _responseSubscription: Notifications.Subscription | null = null;
let _foregroundSubscription: Notifications.Subscription | null = null;

export function setupNotificationHandlers() {
  _responseSubscription?.remove();
  _foregroundSubscription?.remove();

  // On (re)start, stop any siren that may still be playing from a previous
  // session. The native foreground service survives app restarts on Android,
  // so we must explicitly silence it here.
  if (SirenModule) {
    try { SirenModule.stopAllSirens(); } catch { /* non-fatal */ }
  }
  // Also clear JS-side alert state so it's in sync with the silenced native side.
  alertManager.stopAllAlerts('app_restart');

  _foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as Record<string, any>;
    const orderId = data?.orderId as string | undefined;
    const orderNumber = data?.orderNumber as string | undefined;
    const title = notification.request.content.title ?? 'NIVA Partner';
    const body = notification.request.content.body ?? '';

    if (data?.type === 'partner_new_delivery' && orderId) {
      alertManager.startAlert(orderId, orderNumber ?? orderId, 'partner_new_delivery');
    }

    // Another partner accepted — stop siren immediately (app is in foreground/bg)
    if (data?.type === 'partner_stop_siren' && orderId) {
      alertManager.stopAlert(orderId, 'taken_by_other');
    }

    if (orderId && data?.type === 'partner_new_delivery') {
      addNotificationToHistory({
        id: notification.request.identifier,
        orderId,
        title,
        body,
        receivedAt: new Date().toISOString(),
      });
    }
  });

  _responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, any>;
    const orderId = data?.orderId as string | undefined;
    const orderNumber = data?.orderNumber as string | undefined;

    if (orderId && data?.type === 'partner_new_delivery') {
      // Ensure the alert is tracked in JS state so the siren can be stopped
      // when the partner accepts. Do NOT start the native siren here — it is
      // already playing (triggered by the FCM data message on Android).
      alertManager.startAlert(orderId, orderNumber ?? orderId, 'partner_new_delivery');
      // Stay on the Available tab — partner accepts from there, not from a push tap.
    }
  });
}

export function teardownNotificationHandlers() {
  _responseSubscription?.remove();
  _foregroundSubscription?.remove();
  _responseSubscription = null;
  _foregroundSubscription = null;
}
