/**
 * Realtime Service — Supabase channel subscription for order updates.
 * Used by both apps to get live order state changes from the backend.
 * The backend (Postgres → Supabase → realtime) is the source of truth.
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

// One shared Supabase client for realtime only (uses anon key, read-only pubsub)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export type OrderChangeCallback = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => void;

let activeChannel: RealtimeChannel | null = null;

/**
 * Subscribe to order table changes.
 * Calls onInsert for new orders, onUpdate for status changes.
 * Safe to call multiple times — unsubscribes previous channel first.
 */
export function subscribeToOrders(
  channelName: string,
  onInsert: OrderChangeCallback,
  onUpdate: OrderChangeCallback
): RealtimeChannel {
  // Clean up any existing subscription
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload: any) => onInsert({ eventType: 'INSERT', new: payload.new, old: payload.old ?? {} })
    )
    .on(
      'postgres_changes' as any,
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload: any) => onUpdate({ eventType: 'UPDATE', new: payload.new, old: payload.old ?? {} })
    )
    .subscribe((status: string) => {
      console.log(`[Realtime] Channel ${channelName}: ${status}`);
    });

  activeChannel = channel;
  return channel;
}

/**
 * Unsubscribe from all realtime channels.
 * Call on logout or app background (optional — background realtime stops automatically).
 */
export function unsubscribeAll() {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }
}

export { supabase as realtimeSupabase };
