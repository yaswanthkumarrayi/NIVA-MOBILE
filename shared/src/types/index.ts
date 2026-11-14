// ─── Shared NIVA Types ────────────────────────────────────────────────────────
// These types mirror the existing backend/database schema exactly.
// Do NOT invent new fields — keep in sync with NIVA-Backend.

export type OrderStatus =
  | 'placed'
  | 'taken'
  | 'prepared'
  | 'arrived_at_campus'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type DeliveryType = 'room' | 'normal' | 'block';

export type PaymentMethod = 'online' | 'cod' | 'razorpay' | 'prepaid' | string;

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  category?: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_college?: string;
  room_number?: string;
  hostel_name?: string;
  hostel_type?: 'boys' | 'girls';
  delivery_block?: string;
  block_delivery_charge?: number;
  items: OrderItem[] | string;
  total_amount: number;
  food_amount?: number;
  cod_tax?: number;
  room_delivery_charge?: number;
  partner_amount?: number;
  maintenance_amount?: number;
  status: OrderStatus;
  delivery_type: DeliveryType;
  delivery_slot?: string;
  delivery_date?: string;
  delivery_mode?: string;
  payment_method: PaymentMethod;
  number_of_packets?: number;
  vendor_platform?: string;
  vendor_name?: string;
  restaurant_id?: string;
  assigned_partner_id?: string;
  partner_name?: string;
  partner_phone?: string;
  order_date?: string;
  created_at: string;
  placed_at?: string;
  taken_at?: string;
  prepared_at?: string;
  arrived_at_campus_at?: string;
  out_for_delivery_at?: string;
  delivered_at?: string;
  // QR fields
  qr_token?: string;
  qr_generated_at?: string;
  qr_scanned_at?: string;
  qr_used?: boolean;
  qr_handover_verified?: boolean;
  qr_handover_partner_id?: string;
  // Enriched fields from backend
  restaurant_phone?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  cuisine?: string;
  location?: string;
  restaurant_available?: boolean;
  is_active?: boolean;
  owner_phone?: string;
}

export interface Partner {
  id: string;
  name: string;
  phone: string;
  gender: 'male' | 'female';
  email?: string;
  is_online: boolean;
  active: boolean;
  supabase_id?: string;
  // Slot controls
  lunch_slot_active?: boolean;
  evening_slot_active?: boolean;
  lunch_room_delivery_active?: boolean;
  evening_room_delivery_active?: boolean;
  fast_foods_active?: boolean;
  biryani_active?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  image_url?: string;
  is_veg: boolean;
  in_stock: boolean;
  price: number;
  restaurant_id?: string;
}

export interface SettlementDay {
  date: string;
  deliveryTotal: number;
  totalOrders: number;
  orders: SettlementOrder[];
}

export interface SettlementOrder {
  id: string;
  orderNumber?: string;
  customerName: string;
  customerPhone: string;
  hostelName?: string;
  roomNumber?: string;
  hostelType?: string;
  items: OrderItem[];
  partnerEarning: number;
  totalAmount: number;
  deliveryCharge?: number;
  paymentMethod: string;
  deliveryType: string;
  deliverySlot?: string;
  vendorName?: string;
  vendorPlatform?: string;
  restaurantId?: string;
  restaurantPhone?: string;
  orderDate?: string;
  createdAt: string;
  placedAt?: string;
  takenAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  status: string;
}

// Auth types
export interface RestaurantLoginPayload {
  restaurantId: string;
  phone: string;
  password: string;
}

export interface RestaurantSession {
  token: string;
  refreshToken: string;
  restaurant: Restaurant;
  role: 'restaurant_owner';
}

export interface PartnerSession {
  token: string;
  refreshToken?: string;
  partner: Partner;
  role: 'partner';
}

// ─── Customer (NIVA customer app) ─────────────────────────────────────────────
// Mirrors the `customers` table used by the web frontend. The id is the
// Supabase auth user id. Keep in sync with NIVA-Backend /api/customers/*.
export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  college?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerSession {
  token: string;
  refreshToken?: string;
  customer: Customer;
  role: 'customer';
}

// Notification / alert types
export interface OrderAlert {
  orderId: string;
  orderNumber: string;
  alertType: 'restaurant_new_order' | 'partner_new_delivery';
  startTime: number;   // Date.now()
  expiryTime: number;  // startTime + 60_000
  stopped: boolean;
}

// FCM / push
export interface DeviceTokenPayload {
  token: string;
  role: 'restaurant_owner' | 'partner';
  userId?: string;        // Supabase auth user ID
  restaurantId?: string;  // for restaurant_owner
  partnerId?: string;     // for partner
  platform: 'android';
}

// Version check
export interface AppVersionInfo {
  currentVersion: string;
  minVersion: string;
  downloadUrl: string;
  updateRequired: boolean;
  updateAvailable: boolean;
}
