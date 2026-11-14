// ─── Shared NIVA Constants ────────────────────────────────────────────────────
// Keep in sync with backend delivery slots and status labels.

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://niva-backend.vercel.app';
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://nznofcpwjlidmlbkvwtg.supabase.co';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Siren timing
export const SIREN_DURATION_MS = 60_000; // 60 seconds

// Order status human labels
export const ORDER_STATUS_LABELS: Record<string, string> = {
  placed: 'New Order',
  taken: 'Accepted',
  prepared: 'Prepared',
  arrived_at_campus: 'Arrived at Campus',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Status color mapping (maps to a semantic color key)
export const ORDER_STATUS_COLORS: Record<string, string> = {
  placed: '#F59E0B',      // amber — new/pending
  taken: '#3B82F6',       // blue — accepted
  prepared: '#8B5CF6',    // purple — prepared
  arrived_at_campus: '#06B6D4', // cyan — arrived
  out_for_delivery: '#F97316', // orange — in transit
  delivered: '#10B981',   // green — done
  cancelled: '#EF4444',   // red — cancelled
};

// Delivery type labels
export const DELIVERY_TYPE_LABELS: Record<string, string> = {
  room: 'Room Delivery',
  normal: 'Normal Delivery',
  block: 'Block Delivery',
};

// Delivery slots (matching backend)
export const DELIVERY_SLOTS = {
  SLOT_12_2: '12:00 PM - 2:00 PM',
  SLOT_630_9: '6:30 PM - 9:00 PM',
  INSTANT: 'Instant Delivery',
};

// NIVA brand colors
export const NIVA_COLORS = {
  black: '#000000',
  white: '#FFFFFF',
  orange: '#F97316',
  orangeLight: '#FFF7ED',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  green: '#10B981',
  greenLight: '#ECFDF5',
  red: '#EF4444',
  redLight: '#FEF2F2',
  blue: '#3B82F6',
  blueLight: '#EFF6FF',
  amber: '#F59E0B',
  amberLight: '#FFFBEB',
  purple: '#8B5CF6',
  purpleLight: '#F5F3FF',
  cyan: '#06B6D4',
  cyanLight: '#ECFEFF',
};

// Notification channel IDs (must match Android native code)
export const NOTIFICATION_CHANNEL_ID = 'niva_orders';
export const NOTIFICATION_CHANNEL_NAME = 'NIVA Orders';

// Secure storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'niva_auth_token',
  REFRESH_TOKEN: 'niva_refresh_token',
  RESTAURANT_DATA: 'niva_restaurant_data',
  PARTNER_DATA: 'niva_partner_data',
  CUSTOMER_DATA: 'niva_customer_data',
  ROLE: 'niva_role',
  FCM_TOKEN: 'niva_fcm_token',
};

// Deep link schemes
export const DEEP_LINK_SCHEME_RESTAURANT = 'niva-restaurant';
export const DEEP_LINK_SCHEME_PARTNER = 'niva-partner';
export const DEEP_LINK_SCHEME_CUSTOMER = 'niva';
