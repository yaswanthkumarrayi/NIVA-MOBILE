/**
 * Secure Storage Service
 * Wraps expo-secure-store for token/session persistence.
 * Never stores passwords in plaintext.
 */
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants';
import type { RestaurantSession, PartnerSession, CustomerSession } from '../types';

// expo-secure-store key names must be alphanumeric + underscore, max 255 chars
const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9_]/g, '_');

export async function setSecure(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(sanitizeKey(key), value);
}

export async function getSecure(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(sanitizeKey(key));
}

export async function deleteSecure(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(sanitizeKey(key));
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export async function saveRestaurantSession(session: RestaurantSession): Promise<void> {
  await setSecure(STORAGE_KEYS.AUTH_TOKEN, session.token);
  await setSecure(STORAGE_KEYS.REFRESH_TOKEN, session.refreshToken);
  await setSecure(STORAGE_KEYS.RESTAURANT_DATA, JSON.stringify(session.restaurant));
  await setSecure(STORAGE_KEYS.ROLE, 'restaurant_owner');
}

export async function loadRestaurantSession(): Promise<RestaurantSession | null> {
  const [token, refreshToken, restaurantRaw, role] = await Promise.all([
    getSecure(STORAGE_KEYS.AUTH_TOKEN),
    getSecure(STORAGE_KEYS.REFRESH_TOKEN),
    getSecure(STORAGE_KEYS.RESTAURANT_DATA),
    getSecure(STORAGE_KEYS.ROLE),
  ]);
  if (!token || role !== 'restaurant_owner' || !restaurantRaw) return null;
  try {
    const restaurant = JSON.parse(restaurantRaw);
    return { token, refreshToken: refreshToken ?? '', restaurant, role: 'restaurant_owner' };
  } catch {
    return null;
  }
}

export async function savePartnerSession(session: PartnerSession): Promise<void> {
  await setSecure(STORAGE_KEYS.AUTH_TOKEN, session.token);
  if (session.refreshToken) {
    await setSecure(STORAGE_KEYS.REFRESH_TOKEN, session.refreshToken);
  }
  await setSecure(STORAGE_KEYS.PARTNER_DATA, JSON.stringify(session.partner));
  await setSecure(STORAGE_KEYS.ROLE, 'partner');
}

export async function loadPartnerSession(): Promise<PartnerSession | null> {
  const [token, refreshToken, partnerRaw, role] = await Promise.all([
    getSecure(STORAGE_KEYS.AUTH_TOKEN),
    getSecure(STORAGE_KEYS.REFRESH_TOKEN),
    getSecure(STORAGE_KEYS.PARTNER_DATA),
    getSecure(STORAGE_KEYS.ROLE),
  ]);
  if (!token || role !== 'partner' || !partnerRaw) return null;
  try {
    const partner = JSON.parse(partnerRaw);
    return {
      token,
      refreshToken: refreshToken ?? undefined,
      partner,
      role: 'partner',
    };
  } catch {
    return null;
  }
}

export async function saveCustomerSession(session: CustomerSession): Promise<void> {
  await setSecure(STORAGE_KEYS.AUTH_TOKEN, session.token);
  if (session.refreshToken) {
    await setSecure(STORAGE_KEYS.REFRESH_TOKEN, session.refreshToken);
  }
  await setSecure(STORAGE_KEYS.CUSTOMER_DATA, JSON.stringify(session.customer));
  await setSecure(STORAGE_KEYS.ROLE, 'customer');
}

export async function loadCustomerSession(): Promise<CustomerSession | null> {
  const [token, refreshToken, customerRaw, role] = await Promise.all([
    getSecure(STORAGE_KEYS.AUTH_TOKEN),
    getSecure(STORAGE_KEYS.REFRESH_TOKEN),
    getSecure(STORAGE_KEYS.CUSTOMER_DATA),
    getSecure(STORAGE_KEYS.ROLE),
  ]);
  if (!token || role !== 'customer' || !customerRaw) return null;
  try {
    const customer = JSON.parse(customerRaw);
    return {
      token,
      refreshToken: refreshToken ?? undefined,
      customer,
      role: 'customer',
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    deleteSecure(STORAGE_KEYS.AUTH_TOKEN),
    deleteSecure(STORAGE_KEYS.REFRESH_TOKEN),
    deleteSecure(STORAGE_KEYS.RESTAURANT_DATA),
    deleteSecure(STORAGE_KEYS.PARTNER_DATA),
    deleteSecure(STORAGE_KEYS.CUSTOMER_DATA),
    deleteSecure(STORAGE_KEYS.ROLE),
  ]);
}

export async function saveFcmToken(token: string): Promise<void> {
  await setSecure(STORAGE_KEYS.FCM_TOKEN, token);
}

export async function loadFcmToken(): Promise<string | null> {
  return getSecure(STORAGE_KEYS.FCM_TOKEN);
}
