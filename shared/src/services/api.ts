/**
 * NIVA API Service — shared between restaurant and partner apps.
 * All requests go to the existing NIVA backend.
 * No secrets are stored here — token is passed per-call from secure storage.
 */

import { API_BASE_URL } from '../constants';
import type {
  Order,
  Restaurant,
  Partner,
  MenuItem,
  SettlementDay,
  RestaurantLoginPayload,
  RestaurantSession,
  DeviceTokenPayload,
  AppVersionInfo,
  Customer,
} from '../types';

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * How many times to transparently retry a request that is rejected with
 * HTTP 429 (Too Many Requests). A 429 means the server never processed the
 * request, so retrying — even for PUT/POST — is safe and idempotent.
 * This absorbs transient rate-limit bursts (e.g. many devices behind the same
 * campus NAT / realtime refetch storms) so they never surface to the user.
 */
const MAX_429_RETRIES = 3;

// ─── 401 → token-refresh → retry (opt-in) ─────────────────────────────────────
//
// Root problem this solves: both apps authenticate with a Supabase access
// token (JWT) that expires after ~1 hour. When it expires, every authenticated
// request returns 401. Without an automatic refresh, the partner app treated
// that 401 as a permanent logout.
//
// An app registers a refresher via setAuthRefresher(). When a request that
// carried a bearer token receives a 401, the request layer transparently:
//   1. calls the refresher (which uses the stored refresh token to obtain a
//      new access token, persists it, and updates the in-memory session),
//   2. retries the ORIGINAL request ONCE with the new token.
// If no refresher is registered, or the refresh fails, the 401 propagates
// unchanged — so behaviour for apps that don't opt in is identical to before.
//
// Concurrency: many requests can 401 at the same moment (e.g. a screen firing
// several fetches). A single in-flight refresh promise is shared so we never
// burn the (single-use, rotating) Supabase refresh token on parallel refreshes.

type AuthRefresher = () => Promise<string | null>;
let _authRefresher: AuthRefresher | null = null;
let _refreshInFlight: Promise<string | null> | null = null;

/** Register (or clear with null) the token refresher for 401 auto-recovery. */
export function setAuthRefresher(fn: AuthRefresher | null): void {
  _authRefresher = fn;
}

/** Run the registered refresher, de-duplicating concurrent calls. */
async function runAuthRefresh(): Promise<string | null> {
  if (!_authRefresher) return null;
  if (!_refreshInFlight) {
    _refreshInFlight = Promise.resolve()
      .then(() => (_authRefresher ? _authRefresher() : null))
      .catch(() => null)
      .finally(() => { _refreshInFlight = null; });
  }
  return _refreshInFlight;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let attempt = 0;
  let authRetried = false;
  // Loop for retryable (429) responses and a single 401 refresh retry;
  // every other outcome returns/throws.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = { success: false, error: 'Invalid JSON response', status: response.status };
    }

    if (!response.ok) {
      // Access token expired → try one transparent refresh + retry.
      // Only when this request carried a bearer token and a refresher exists.
      if (response.status === 401 && token && !authRetried && _authRefresher) {
        authRetried = true;
        const newToken = await runAuthRefresh();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          continue;
        }
        // Refresh unavailable/failed — fall through and surface the 401.
      }

      // Transparently retry rate-limit responses with exponential backoff.
      if (response.status === 429 && attempt < MAX_429_RETRIES) {
        // Honour a Retry-After header if present, else back off exponentially
        // with a little jitter to avoid a thundering-herd retry.
        const retryAfterHeader = parseInt(response.headers.get('Retry-After') || '', 10);
        const backoff = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : Math.min(500 * 2 ** attempt, 4000) + Math.floor(Math.random() * 250);
        attempt += 1;
        await sleep(backoff);
        continue;
      }

      const msg =
        (body as any)?.message || (body as any)?.error || `HTTP ${response.status}`;
      const err = new Error(msg) as Error & { status: number; data: unknown };
      err.status = response.status;
      err.data = body;
      throw err;
    }

    return body as T;
  }
}

const get = <T>(path: string, token?: string) =>
  request<T>(path, { method: 'GET' }, token);

const post = <T>(path: string, body: unknown, token?: string) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, token);

const put = <T>(path: string, body: unknown, token?: string) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, token);

const del = <T>(path: string, body?: unknown, token?: string) =>
  request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }, token);

// ─── Restaurant Portal APIs ───────────────────────────────────────────────────

export const restaurantApi = {
  /** Public — no auth needed */
  getActiveRestaurants: () =>
    get<{ success: boolean; restaurants: Restaurant[] }>(
      '/api/restaurant-portal/restaurants/active'
    ),

  login: (payload: RestaurantLoginPayload) =>
    post<RestaurantSession>('/api/restaurant-portal/login', payload),

  logout: (token: string) =>
    post<{ success: boolean }>('/api/restaurant-portal/logout', {}, token),

  getOrders: (token: string) =>
    get<{ success: boolean; orders: Order[] }>('/api/restaurant-portal/orders', token),

  getOrder: (orderId: string, token: string) =>
    get<{ success: boolean; order: Order }>(
      `/api/restaurant-portal/orders/${orderId}`,
      token
    ),

  updateOrderStatus: (orderId: string, status: string, token: string) =>
    put<{ success: boolean; order: Partial<Order> }>(
      `/api/restaurant-portal/orders/${orderId}/status`,
      { status },
      token
    ),

  getOrderQr: (orderId: string, token: string) =>
    get<{ success: boolean; qr_token: string; qr_generated_at: string }>(
      `/api/restaurant-portal/orders/${orderId}/qr`,
      token
    ),

  getMenu: (token: string) =>
    get<{ success: boolean; items: MenuItem[] }>('/api/restaurant-portal/menu', token),

  updateMenuItemStock: (itemId: string, inStock: boolean, token: string) =>
    put<{ success: boolean; item: MenuItem }>(
      `/api/restaurant-portal/menu/${itemId}/stock`,
      { in_stock: inStock },
      token
    ),

  getRestaurant: (token: string) =>
    get<{ success: boolean; restaurant: Restaurant }>('/api/restaurant-portal/restaurant', token),

  setAvailability: (available: boolean, token: string) =>
    put<{ success: boolean; restaurant_available: boolean }>(
      '/api/restaurant-portal/restaurant/availability',
      { available },
      token
    ),

  getProfile: (token: string) =>
    get<{ success: boolean; profile: Partial<Restaurant> }>(
      '/api/restaurant-portal/profile',
      token
    ),

  getEarnings: (token: string) =>
    get<{ success: boolean; earnings: any }>('/api/restaurant-portal/earnings', token),

  getAnalytics: (token: string) =>
    get<{ success: boolean; analytics: any }>('/api/restaurant-portal/analytics', token),
};

// ─── Partner APIs ─────────────────────────────────────────────────────────────

export const partnerApi = {
  getProfile: (token: string) =>
    get<{ success: boolean; partner: Partner }>('/api/partner/profile', token),

  setOnlineStatus: (isOnline: boolean, token: string) =>
    put<{ success: boolean; partner: Partner }>(
      '/api/partner/online-status',
      { is_online: isOnline },
      token
    ),

  getAvailableOrders: (token: string) =>
    get<{ success: boolean; orders: Order[]; reason?: string }>(
      '/api/partner/available-orders',
      token
    ),

  getMyOrders: (token: string, statusFilter?: 'active' | 'completed' | 'all') =>
    get<{ success: boolean; orders: Order[] }>(
      `/api/partner/my-orders${statusFilter ? `?status=${statusFilter}` : ''}`,
      token
    ),

  acceptOrder: (orderId: string, token: string) =>
    post<{ success: boolean; message: string; order: Partial<Order> }>(
      `/api/partner/orders/${orderId}/accept`,
      {},
      token
    ),

  updateOrderStatus: (orderId: string, status: string, token: string) =>
    put<{ success: boolean; order: Partial<Order> }>(
      `/api/partner/orders/${orderId}/status`,
      { status },
      token
    ),

  scanQr: (qrToken: string, token: string) =>
    post<{ success: boolean; message: string; order: Partial<Order> }>(
      '/api/partner/scan-qr',
      { qr_token: qrToken },
      token
    ),

  scanQrForOrder: (orderId: string, qrToken: string, token: string) =>
    post<{ success: boolean; message: string; order: Partial<Order> }>(
      `/api/partner/orders/${orderId}/scan-qr`,
      { qr_token: qrToken },
      token
    ),

  getSettlement: (token: string) =>
    get<{ success: boolean; settlements: SettlementDay[] }>(
      '/api/partner/settlement',
      token
    ),

  updateSlotControl: (updates: Record<string, boolean>, token: string) =>
    put<{ success: boolean; partner: Partner }>(
      '/api/partner/slot-control',
      updates,
      token
    ),
};

// ─── Mobile-specific APIs (new endpoints we add to the backend) ───────────────

export const mobileApi = {
  registerDeviceToken: (payload: DeviceTokenPayload, token: string) =>
    post<{ success: boolean }>('/api/mobile/register-token', payload, token),

  unregisterDeviceToken: (fcmToken: string, token: string) =>
    del<{ success: boolean }>(
      '/api/mobile/unregister-token',
      { token: fcmToken },
      token
    ),

  getAppVersion: (appType: 'restaurant' | 'partner', installedVersion?: string) =>
    get<AppVersionInfo>(
      `/api/mobile/app-version?app=${appType}` +
        (installedVersion ? `&version=${encodeURIComponent(installedVersion)}` : '')
    ),
};

// ─── Restaurant token refresh ─────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

/**
 * Lightweight Supabase client used ONLY for session refresh operations.
 * No auto-refresh, no persistent session — we manage everything manually.
 */
const _refreshClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Refresh a Supabase session using the stored refresh token.
 *
 * Returns the new { access_token, refresh_token } on success, or null on
 * failure. The caller must persist the new tokens.
 *
 * This is the ONLY place token refresh happens in the restaurant app.
 * Called from _layout.tsx during startup validation and from the API layer
 * when a 401 is received on any authenticated request.
 */
export async function refreshRestaurantSession(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const { data, error } = await _refreshClient.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data?.session) return null;
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  } catch {
    return null;
  }
}

// ─── Partner Supabase auth (partner uses Supabase directly) ──────────────────

/**
 * Lightweight Supabase client used only for partner sign-in.
 * Partner auth uses synthetic email: phone@partner.com
 */
export const partnerSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // We manage session manually via expo-secure-store
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export const partnerAuthApi = {
  signIn: async (phone: string, password: string) => {
    const email = `${phone}@partner.com`;
    const { data, error } = await partnerSupabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  refreshSession: async (refreshToken: string) => {
    const { data, error } = await partnerSupabaseClient.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  signOut: async (token: string) => {
    // Sign out via supabase — best-effort
    try {
      await partnerSupabaseClient.auth.signOut();
    } catch {
      // ignore
    }
  },
};

// ─── Customer APIs (NIVA customer app) ────────────────────────────────────────
//
// Customers authenticate with Supabase (real email/password + Google OAuth),
// exactly like the web frontend (see NIVA-Frontend/src/pages/CustomerLogin.js).
// Profile reads/writes go through the existing protected backend endpoints,
// which derive ownership from the verified JWT — never from a client-sent id.
//
// Response envelope for every /api/customers/* endpoint is { success, data }.

interface CustomerProfileResponse {
  success: boolean;
  data: Customer | null;
  message?: string;
}

export const customerApi = {
  /** Fetch the authenticated customer's profile. data is null if no record. */
  getProfile: (customerId: string, token: string) =>
    get<CustomerProfileResponse>(`/api/customers/${customerId}`, token),

  /**
   * Create or update the customer record. The backend ignores a client-sent id
   * and uses the token's user id, so this only ever writes the caller's own
   * profile. Used on first login to create the record.
   */
  upsertProfile: (
    payload: { id: string; name: string; email: string; phone?: string; college?: string },
    token: string
  ) => post<CustomerProfileResponse>('/api/customers/upsert', payload, token),

  /** Update editable profile fields (name / phone / college). */
  updateProfile: (
    customerId: string,
    updates: { name?: string; phone?: string; college?: string },
    token: string
  ) => put<CustomerProfileResponse>(`/api/customers/update/${customerId}`, updates, token),
};

// ─── Customer Supabase auth ────────────────────────────────────────────────
//
// Mirrors the partner pattern: a lightweight client with NO auto-refresh and
// NO persisted session — the customer app persists tokens manually via
// expo-secure-store and refreshes them explicitly (startup validation + the
// 401 auto-recovery refresher registered in the app root layout).

export const customerSupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    // Implicit flow returns the tokens directly in the redirect URL fragment,
    // so native (deep-link) Google sign-in can read them without a persisted
    // PKCE code verifier — which this stateless client (persistSession: false)
    // would not retain between opening the browser and the callback.
    flowType: 'implicit',
  },
});

export const customerAuthApi = {
  signIn: async (email: string, password: string) => {
    const { data, error } = await customerSupabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  signUp: async (email: string, password: string) => {
    const { data, error } = await customerSupabaseClient.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Build the Google OAuth URL for a native (deep-link) redirect. The caller
   * opens this URL in an in-app browser (expo-web-browser) and, on return,
   * passes the token fragment / code back to completeOAuth().
   *
   * `redirectTo` MUST be a URL registered in the Supabase dashboard under
   * Authentication → URL Configuration → Redirect URLs (e.g. niva://auth-callback).
   */
  getOAuthUrl: async (redirectTo: string) => {
    const { data, error } = await customerSupabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw new Error(error.message);
    if (!data?.url) throw new Error('Could not start Google sign-in.');
    return data.url;
  },

  /** Exchange an OAuth authorization code (PKCE flow) for a session. */
  exchangeCodeForSession: async (code: string) => {
    const { data, error } = await customerSupabaseClient.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    return data;
  },

  /** Set a session directly from tokens returned in an OAuth redirect fragment. */
  setSession: async (accessToken: string, refreshToken: string) => {
    const { data, error } = await customerSupabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  refreshSession: async (refreshToken: string) => {
    const { data, error } = await customerSupabaseClient.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  signOut: async () => {
    try {
      await customerSupabaseClient.auth.signOut();
    } catch {
      // best-effort — local session is cleared by the caller regardless
    }
  },
};
