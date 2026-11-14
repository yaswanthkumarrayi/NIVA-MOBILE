/**
 * NIVA Customer API
 *
 * Thin wrappers around the existing backend endpoints.
 * Mirrors the patterns from NIVA-Frontend/src/utils/apiClient.js.
 * Uses the shared `get`, `post`, `put`, `del` helpers from @niva/shared.
 *
 * All auth-required calls pass the token explicitly — the shared API layer
 * adds `Authorization: Bearer <token>` for us.
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE_URL } from '@niva/shared';

// ─── Public Supabase client (read-only data, no auth persistence) ─────────────
export const publicSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ─── Generic fetch helper ─────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as any)?.message || (data as any)?.error || `Request failed (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

const apiGet  = <T>(path: string, token?: string) => apiFetch<T>(path, { method: 'GET' }, token);
const apiPost = <T>(path: string, body: unknown, token?: string) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }, token);
const apiPut  = <T>(path: string, body: unknown, token?: string) => apiFetch<T>(path, { method: 'PUT',  body: JSON.stringify(body) }, token);
const apiDel  = <T>(path: string, body?: unknown, token?: string) => apiFetch<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }, token);

// ─── Restaurants ─────────────────────────────────────────────────────────────
export const restaurantsApi = {
  /** Public list of active restaurants from the backend */
  getActive: () =>
    apiGet<{ success: boolean; restaurants: Restaurant[] }>('/api/restaurant-portal/restaurants/active'),

  /** All vendors (restaurant + vendor platforms) */
  getVendors: () =>
    apiGet<{ success: boolean; vendors: VendorInfo[] }>('/api/vendors/list'),
};

// ─── Menu ────────────────────────────────────────────────────────────────────
export const menuApi = {
  /** Fetch menu items directly from Supabase (matches RestaurantMenuPage.js) */
  getMenuItems: async (restaurantId: string) => {
    const { data, error } = await publicSupabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('category');
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  getRestaurant: async (restaurantId: string) => {
    const { data, error } = await publicSupabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /** Search menu items */
  searchItems: async (query: string, restaurantId?: string) => {
    let q = publicSupabase
      .from('menu_items')
      .select('*, restaurants(name)')
      .eq('is_active', true)
      .ilike('name', `%${query}%`);
    if (restaurantId) q = q.eq('restaurant_id', restaurantId);
    const { data, error } = await q.limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  searchRestaurants: async (query: string) => {
    const { data, error } = await publicSupabase
      .from('restaurants')
      .select('*')
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,cuisine.ilike.%${query}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};

// ─── Hero Banners ─────────────────────────────────────────────────────────────
export const bannersApi = {
  getBanners: (platform: 'foods' | 'deliveries') =>
    apiGet<{ success: boolean; banners: HeroBanner[] }>(`/api/hero-banners?platform=${platform}`),
};

// ─── Customer Orders ──────────────────────────────────────────────────────────
export const ordersApi = {
  // Returns { success, data: Order[] }
  getMyOrders: (customerId: string, token: string) =>
    apiGet<{ success: boolean; data: any[] }>(`/api/orders/customer/${customerId}`, token),
};

// ─── Single Order — no dedicated endpoint; fetch from customer list ───────────
// Use Supabase Realtime for live status (see realtimeService in @niva/shared).

// ─── Saved Addresses ─────────────────────────────────────────────────────────
// Backend returns { success, data: address[] }
export const addressApi = {
  getAddresses: (customerId: string, token: string) =>
    apiGet<{ success: boolean; data: SavedAddress[] }>(`/api/customers/${customerId}/addresses`, token),

  addAddress: (customerId: string, address: Partial<SavedAddress> & { hostelName: string; roomNumber: string }, token: string) =>
    apiPost<{ success: boolean; data: SavedAddress }>(`/api/customers/${customerId}/addresses`, address, token),

  updateAddress: (customerId: string, addressId: string, updates: Partial<SavedAddress>, token: string) =>
    apiPut<{ success: boolean; data: SavedAddress }>(`/api/customers/${customerId}/addresses/${addressId}`, updates, token),

  setDefault: (customerId: string, addressId: string, token: string) =>
    apiPut<{ success: boolean }>(`/api/customers/${customerId}/addresses/${addressId}/default`, {}, token),

  deleteAddress: (customerId: string, addressId: string, token: string) =>
    apiDel<{ success: boolean }>(`/api/customers/${customerId}/addresses/${addressId}`, undefined, token),
};

// ─── Streak ───────────────────────────────────────────────────────────────────
export const streakApi = {
  getStreak: (token: string) =>
    apiGet<{ success: boolean; campaigns: any[] }>('/api/streak', token),

  getRewardCoupons: (token: string) =>
    apiGet<{ success: boolean; coupons: any[] }>('/api/streak/coupons', token),
};

// ─── Wallet ───────────────────────────────────────────────────────────────────
export const walletApi = {
  getWallet: (token: string) =>
    apiGet<{ success: boolean; wallet: WalletSummary }>('/api/wallet', token),

  getRewards: (token: string) =>
    apiGet<{ success: boolean; rewards: WalletReward[] }>('/api/wallet/rewards', token),

  claimReward: (rewardId: string, token: string) =>
    apiPost<{ success: boolean; amount: number; message: string }>(`/api/wallet/rewards/${rewardId}/claim`, {}, token),
};

// ─── Delivery Availability ────────────────────────────────────────────────────
export const deliveryApi = {
  checkAvailability: () =>
    apiGet<{ available: boolean; reason?: string; slots?: DeliverySlotInfo }>('/api/delivery-availability'),
};

// ─── Room Delivery Order Creation ─────────────────────────────────────────────
export const roomDeliveryApi = {
  createOrder: (payload: RoomDeliveryPayload, token: string) =>
    apiPost<RoomDeliveryOrderResult>('/api/orders/external-room-delivery', payload, token),

  verifyPayment: (payload: RazorpayVerifyPayload, token: string) =>
    apiPost<PaymentVerifyResult>('/api/payment/verify', payload, token),

  verifyPaymentCod: (payload: RazorpayVerifyPayload, token: string) =>
    apiPost<PaymentVerifyResult>('/api/payment/verify-external-room-delivery-cod', payload, token),
};

// ─── Restaurant Order (checkout) ─────────────────────────────────────────────
//
// Contract mirrors the production website (NIVA-Frontend/src/pages/CheckoutPage.js):
//   • Prepaid  → POST /api/payment/create-order → { key, order:{ id, amount } }
//                then open Razorpay, then POST /api/payment/verify.
//   • COD      → two-step advance flow: POST /api/orders/foods-cod-initiate
//                → open Razorpay for the advance → POST /api/payment/verify-foods-cod-advance.
// The backend is authoritative for every amount; the client never computes the
// payable total for order creation.
export const checkoutApi = {
  /** Prepaid: create a server-priced Razorpay order. */
  createOrder: (payload: CheckoutPayload, token: string) =>
    apiPost<CreateOrderResult>('/api/payment/create-order', payload, token),

  /** Prepaid: verify a captured payment (webhook is the source of truth). */
  verifyPayment: (payload: RazorpayVerifyPayload & { customer_id?: string }, token: string) =>
    apiPost<VerifyPaymentResult>('/api/payment/verify', payload, token),

  /** Prepaid: recover an order when verify never confirmed. */
  recoverPayment: (payload: { razorpay_order_id: string; razorpay_payment_id?: string; customer_id?: string }, token: string) =>
    apiPost<VerifyPaymentResult>('/api/payment/recover', payload, token),

  /** COD step 1: create a Razorpay order for the COD advance only. */
  initiateCod: (payload: CheckoutPayload, token: string) =>
    apiPost<CodInitiateResult>('/api/orders/foods-cod-initiate', payload, token),

  /** COD step 2: verify the advance payment and create the COD order. */
  verifyCod: (payload: RazorpayVerifyPayload & { customer_id?: string }, token: string) =>
    apiPost<CodVerifyResult>('/api/payment/verify-foods-cod-advance', payload, token),
};

// ─── Coupons ──────────────────────────────────────────────────────────────────
// Mirrors the website: POST /api/coupon/validate (singular). The backend
// re-prices the cart from the DB and returns the authoritative discount in
// `pricing.discountAmount`. This is a preview; order creation re-validates.
export interface CouponValidateBody {
  couponCode: string;
  cartItems: Array<{ id: string; quantity: number; price?: number; name?: string; restaurant_id?: string | null }>;
  deliveryType?: string;
  hostelType?: string | null;
  hostelName?: string | null;
  customerId?: string | null;
}

export interface CouponValidateResult {
  success: boolean;
  message?: string;
  error_code?: string;
  coupon?: {
    code: string;
    name?: string;
    discountType?: string;
    discountValue?: number;
    freeRoomDelivery?: boolean;
    waiveGst?: boolean;
  };
  pricing?: {
    discountAmount?: number;
    finalTotal?: number;
    roomDeliveryDiscount?: number;
    originalRoomDeliveryCharge?: number;
    finalRoomDeliveryCharge?: number;
  };
}

export const couponApi = {
  validateCoupon: (body: CouponValidateBody, token?: string) =>
    apiPost<CouponValidateResult>('/api/coupon/validate', body, token),
};

// ─── Types (matches backend / shared types) ───────────────────────────────────
export interface Restaurant {
  id: string;
  name: string;
  cuisine?: string;
  location?: string;
  restaurant_available?: boolean;
  is_active?: boolean;
  rating?: number;
  rating_count?: number;
  image_url?: string;
  banner_url?: string;
  owner_phone?: string;
  description?: string;
  min_order?: number;
  avg_delivery_time?: string;
}

export interface VendorInfo {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  description?: string;
  banner_image?: string;
  logo_image?: string;
  isOpen?: boolean;
  acceptingOrders?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url?: string;
  is_veg: boolean;
  in_stock: boolean;
  restaurant_id: string;
  description?: string;
  rating?: number;
}

export interface HeroBanner {
  id: string;
  platform: 'foods' | 'deliveries';
  image_url: string;
  title?: string;
  description?: string;
  button_text?: string;
  redirect_link?: string;
  display_order: number;
}

export interface SavedAddress {
  id: string;
  customer_id?: string;
  label?: string;
  hostel_name: string;
  hostel_type: 'boys' | 'girls';
  room_number: string;
  college?: string;
  landmark?: string;
  delivery_notes?: string;
  recipient_name?: string;
  recipient_phone?: string;
  address_type?: 'self' | 'other';
  is_default?: boolean;
  created_at?: string;
}

export interface WalletSummary {
  balance: number;
  spendable: number;
  total_earned: number;
  total_spent: number;
  unlocked: boolean;
}

export interface WalletReward {
  id: string;
  status: 'pending' | 'claimed' | 'credited' | 'void';
  amount?: number;
  order_id: string;
  created_at: string;
}

export interface DeliverySlotInfo {
  lunch?: { available: boolean; label: string };
  evening?: { available: boolean; label: string };
}

export interface RoomDeliveryPayload {
  customerId: string;
  hostelName: string;
  hostelType: 'boys' | 'girls';
  roomNumber?: string;
  numberOfPackets: number;
  vendorPlatform: string;
  paymentMethod: 'online' | 'cod';
  foodAmount?: number;
  vendorOrderType: 'prepaid' | 'cod';
  description?: string;
  recipientName?: string;
  recipientPhone?: string;
  college?: string;
}

export interface RoomDeliveryOrderResult {
  success: boolean;
  razorpayOrderId?: string;
  orderId?: string;
  amount?: number;
  key?: string;
  message?: string;
}

export interface RazorpayVerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_college?: string;
}

/** Order row returned by the backend after a successful order creation. */
export interface OrderRecord {
  id: string;
  order_number?: string;
  customer_id?: string;
  total_amount?: number;
  status?: string;
  [key: string]: unknown;
}

export interface VerifyPaymentResult {
  success: boolean;
  order?: OrderRecord;
  message?: string;
  error_code?: string;
}

/**
 * Verify result for the NIVA Deliveries (external room-delivery) flow.
 * That family of endpoints returns `orderId` directly; kept separate from the
 * restaurant checkout's VerifyPaymentResult to avoid conflating the two.
 */
export interface PaymentVerifyResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  order?: OrderRecord;
  message?: string;
}

/**
 * Checkout request — identical in shape to the website's create-order /
 * foods-cod-initiate body. `deliveryMode` (WHEN) and `deliveryType` (WHERE) are
 * orthogonal, and `deliverySlot` + `deliveryDate` are ALWAYS required by the
 * backend (instant orders send 'Instant Delivery' + today's date).
 */
export interface CheckoutPayload {
  customerId: string;
  vendorId: string | null;
  cartItems: Array<{ id: string; name: string; quantity: number; productType: string; type: string }>;
  deliveryMode: 'instant' | 'slot';
  deliverySlot: string;
  deliveryDate: string;
  deliveryType: 'room' | 'block' | 'normal';
  hostelName?: string | null;
  hostelType?: string | null;
  roomNumber?: string | null;
  deliveryBlock?: string | null;
  roomDeliveryCharge?: number;
  couponCode?: string | null;
}

/** POST /api/payment/create-order response (prepaid). */
export interface CreateOrderResult {
  success: boolean;
  key?: string;
  order?: { id: string; amount: number; amountInRupees?: number; currency?: string; receipt?: string };
  pricing?: { finalAmount?: number; grossAmount?: number; [key: string]: unknown };
  message?: string;
  error_code?: string;
}

/** POST /api/orders/foods-cod-initiate response (COD advance). */
export interface CodInitiateResult {
  success: boolean;
  key?: string;
  razorpayOrderId?: string;
  amount?: number;          // paise — Razorpay uses this
  amountInRupees?: number;  // for display
  codAdvance?: number;      // advance collected online
  message?: string;
  error_code?: string;
}

/** POST /api/payment/verify-foods-cod-advance response. */
export interface CodVerifyResult {
  success: boolean;
  orderId?: string;
  codAdvance?: number;
  message?: string;
}
