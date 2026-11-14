/**
 * Hostel data — mirrors NIVA-Frontend/src/data/hostelData.js
 * Boys: Ganga, Brahmaputra, Vedhavathi, Teesta
 * Girls: Krishna, Yamuna, Godavari, Narmada, Saraswathi
 */
export const MALE_HOSTELS = ['Ganga', 'Brahmaputra', 'Vedhavathi', 'Teesta'] as const;
export const FEMALE_HOSTELS = ['Krishna', 'Yamuna', 'Godavari', 'Narmada', 'Saraswathi'] as const;

export type MaleHostel = typeof MALE_HOSTELS[number];
export type FemaleHostel = typeof FEMALE_HOSTELS[number];

export const BLOCK_LOCATIONS = ['V-Block', 'SR-Block', 'X-Lab'] as const;
export type BlockLocation = typeof BLOCK_LOCATIONS[number];

export function getHostelsByGender(gender: 'boys' | 'girls' | 'male' | 'female'): readonly string[] {
  if (gender === 'male' || gender === 'boys') return MALE_HOSTELS;
  if (gender === 'female' || gender === 'girls') return FEMALE_HOSTELS;
  return [];
}

export function normalizeGender(value: string): 'boys' | 'girls' {
  if (value === 'male' || value === 'boys') return 'boys';
  return 'girls';
}

/** Delivery fee tiers — matches backend pricing.getNivaDeliveriesCharge() */
export const ROOM_DELIVERY_CHARGE = 29; // ₹29 flat per NIVA backend

/** Block delivery fee — ₹9 per order */
export const BLOCK_DELIVERY_CHARGE = 9;

/** Vendor platforms for NIVA room delivery */
export const VENDOR_PLATFORMS = [
  'Swiggy',
  'Zomato',
  'Amazon',
  'Flipkart',
  'Meesho',
  'Blinkit',
  'Zepto',
  'BigBasket',
  'Other',
] as const;

export type VendorPlatform = typeof VENDOR_PLATFORMS[number];
