/**
 * Alert Manager — manages active siren state for restaurant new orders.
 *
 * Responsibilities:
 *   - Track which orders are currently alerting (JS-side state)
 *   - Prevent duplicate sirens for the same order
 *   - Enforce a 60-second JS-side maximum alert duration as a belt-and-
 *     suspenders fallback (the authoritative stop is always the backend event)
 *   - Stop alerts when: order accepted (status='taken'), cancelled, expired,
 *     60-second expiry, or remote stop FCM arrives
 *   - Keep the native layer in sync via NivaSirenModule bridge calls
 *
 * The actual audio playback and foreground service is handled natively by
 * NivaSirenService (Kotlin). The manager coordinates JS state with native.
 *
 * TWO PATHS to stop the siren:
 *   1. FCM data message (restaurant_stop_siren) → NivaFcmService → ACTION_STOP
 *      Works even when app is killed. This is the primary background path.
 *   2. JS side (this manager) → NivaSirenModule.stopSiren(orderId)
 *      Works when app is foreground/background. Belt-and-suspenders.
 *
 * MULTIPLE ORDER SUPPORT:
 *   Each order has its own independent siren state keyed by orderId.
 *   Accepting Order A never stops Order B's siren.
 */

import { NativeModules, Platform } from 'react-native';
import type { OrderAlert } from '../types';
import { SIREN_DURATION_MS } from '../constants';

// Native Android siren module — registered in MainApplication.kt
const SirenModule = Platform.OS === 'android' ? NativeModules.NivaSirenModule : null;

class AlertManager {
  /** Active alerts keyed by orderId */
  private alerts = new Map<string, OrderAlert & { timerId?: ReturnType<typeof setTimeout> }>();

  /**
   * Start a siren alert for a new order.
   * No-op if an active (unstopped) alert for this orderId already exists —
   * prevents duplicate sirens when realtime and FCM both deliver the same event.
   *
   * A 60-second JS-side timer is started as a belt-and-suspenders fallback so
   * the siren stops even if the backend stop-siren FCM is never delivered
   * (FCM quota exceeded, device offline > 60s, etc.).
   */
  startAlert(orderId: string, orderNumber: string, alertType: OrderAlert['alertType']) {
    const existing = this.alerts.get(orderId);
    // Skip if already alerting and not stopped (idempotent)
    if (existing && !existing.stopped) return;

    // Clear any stale timer from a previous stopped alert
    if (existing?.timerId) clearTimeout(existing.timerId);

    const now        = Date.now();
    const expiryTime = now + SIREN_DURATION_MS;

    // 60-second JS fallback timer
    const timerId = setTimeout(() => {
      console.log(`[AlertManager] 60s timeout reached for order ${orderId} — stopping`);
      this.stopAlert(orderId, 'timeout');
    }, SIREN_DURATION_MS);

    const alert = {
      orderId,
      orderNumber,
      alertType,
      startTime:  now,
      expiryTime,
      stopped:    false,
      timerId,
    };
    this.alerts.set(orderId, alert);

    // Start native siren
    if (SirenModule) {
      try {
        SirenModule.startSiren(orderId);
      } catch (e) {
        console.warn('[AlertManager] SirenModule.startSiren failed:', e);
      }
    }

    console.log(`[AlertManager] order_id=${orderId} action=START alertType=${alertType} expiry=${new Date(expiryTime).toISOString()}`);
  }

  /**
   * Stop a specific order's siren.
   *
   * IMPORTANT: always sends the stop command to the native layer even if the
   * JS map has no entry for this order. The native siren can be started by
   * NivaFcmService (background FCM) without going through JS, so the JS map
   * may be empty while native audio is still playing.
   *
   * reason: 'accepted' | 'cancelled' | 'expired' | 'timeout' | 'manual' | 'taken_by_other'
   */
  stopAlert(orderId: string, reason = 'manual') {
    const alert = this.alerts.get(orderId);
    if (alert) {
      if (alert.timerId) clearTimeout(alert.timerId);
      alert.stopped  = true;
      alert.timerId  = undefined;
      this.alerts.set(orderId, alert);
    }

    // Always tell native to stop — don't gate on JS map state
    if (SirenModule) {
      try {
        SirenModule.stopSiren(orderId);
      } catch (e) {
        console.warn('[AlertManager] SirenModule.stopSiren failed:', e);
      }
    }

    console.log(`[AlertManager] order_id=${orderId} action=STOP reason=${reason}`);
  }

  /**
   * Stop all active alerts (e.g. on logout or app restart).
   */
  stopAllAlerts(reason = 'logout') {
    for (const [, alert] of this.alerts.entries()) {
      if (alert.timerId) clearTimeout(alert.timerId);
      alert.stopped = true;
      alert.timerId = undefined;
    }
    this.alerts.clear();

    // Belt-and-suspenders: tell native to stop everything
    if (SirenModule) {
      try {
        SirenModule.stopAllSirens();
      } catch (e) {
        console.warn('[AlertManager] SirenModule.stopAllSirens failed:', e);
      }
    }

    console.log(`[AlertManager] action=STOP_ALL reason=${reason}`);
  }

  /**
   * Called when realtime/FCM indicates an order is no longer available
   * (accepted by another device, cancelled, etc.).
   * Always stops the native siren regardless of JS map state.
   */
  handleOrderUnavailable(orderId: string) {
    this.stopAlert(orderId, 'taken_by_other');
  }

  /**
   * Reconcile JS alert state against the current fetched orders list.
   * Called after every fetchOrders so stale sirens are cleaned up.
   *
   * For RESTAURANT orders: an order is still alertable only if its status
   * is exactly 'placed'. Any other status means it was accepted, cancelled,
   * or otherwise resolved — stop the siren.
   *
   * Also stops the native siren for orders that have DISAPPEARED from the
   * fetched list entirely (e.g. soft-deleted, or backend filtered them out),
   * even if the JS map has no entry for them (covers background-FCM-started
   * siren where JS was never involved).
   */
  syncWithOrders(
    orders: Array<{ id: string; status: string; assigned_partner_id?: string | null }>,
    previousOrderIds?: Set<string>
  ) {
    // Build set of order IDs that are still genuinely pending (status='placed')
    const stillPendingIds = new Set(
      orders
        .filter(o => o.status === 'placed')
        .map(o => o.id)
    );

    // 1. Stop JS-tracked alerts for orders no longer pending
    for (const [orderId] of this.alerts.entries()) {
      if (!stillPendingIds.has(orderId)) {
        this.stopAlert(orderId, 'taken_by_other');
      }
    }

    // 2. Stop native sirens for orders that vanished from the list since the
    //    last fetch (background FCM case — no JS map entry existed)
    if (previousOrderIds) {
      for (const orderId of previousOrderIds) {
        if (!stillPendingIds.has(orderId)) {
          if (SirenModule) {
            try { SirenModule.stopSiren(orderId); } catch { /* non-fatal */ }
          }
        }
      }
    }

    // 3. If zero orders are pending, stop everything unconditionally
    if (stillPendingIds.size === 0) {
      const hasActiveAlerts = Array.from(this.alerts.values()).some(a => !a.stopped);
      if (hasActiveAlerts) {
        console.log('[AlertManager] No pending orders — stopping all sirens');
        this.stopAllAlerts('no_pending_orders');
      } else if (SirenModule) {
        // Belt-and-suspenders: stop native even if JS map is empty
        try { SirenModule.stopAllSirens(); } catch { /* non-fatal */ }
      }
    }
  }

  /**
   * Returns true if an order currently has an active (unstopped) alert.
   */
  isAlerting(orderId: string): boolean {
    const alert = this.alerts.get(orderId);
    return !!alert && !alert.stopped;
  }

  /**
   * Get all currently active alerts.
   */
  getActiveAlerts(): OrderAlert[] {
    return Array.from(this.alerts.values())
      .filter((a) => !a.stopped)
      .map(({ timerId: _, ...rest }) => rest as OrderAlert);
  }

  /**
   * Re-arm alerts for placed orders after the app returns to foreground or
   * after a polling fetch.
   *
   * Only arms orders that are still in 'placed' status.
   * Orders already stopped (accepted/taken) are NOT re-started.
   * startAlert() is idempotent — it is a no-op if the order is already alerting.
   */
  resumeAlertsForPlacedOrders(
    orders: Array<{ id: string; order_number?: string | null; status: string; assigned_partner_id?: string | null }>
  ) {
    for (const o of orders) {
      if (o.status === 'placed') {
        // Use 'restaurant_new_order' alertType — this IS a restaurant app
        this.startAlert(o.id, o.order_number ?? o.id, 'restaurant_new_order');
      }
    }
  }

  /**
   * Clean up stopped alerts from memory (housekeeping only, not audio-related).
   * Safe to call on foreground transitions.
   */
  pruneStale() {
    for (const [orderId, alert] of this.alerts.entries()) {
      if (alert.stopped) {
        if (alert.timerId) clearTimeout(alert.timerId);
        this.alerts.delete(orderId);
      }
    }
  }
}

// Singleton — one AlertManager for the entire app lifetime
export const alertManager = new AlertManager();
