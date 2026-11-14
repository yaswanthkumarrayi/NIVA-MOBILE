/**
 * NIVA Customer Cart Store
 *
 * Mirrors the website's cartStorage.js but uses AsyncStorage instead of
 * localStorage. Single-vendor enforcement: mixing items from two different
 * restaurants returns a vendor_mismatch result so the UI can confirm before
 * clearing.
 *
 * Cart is persisted across app restarts and survives unauthenticated sessions.
 * Authentication is NEVER required just to add items to the cart.
 *
 * NOTE: Requires @react-native-async-storage/async-storage.
 * Install: npx expo install @react-native-async-storage/async-storage
 */
import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useMemo, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CART_KEY = 'niva_cart_v2';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
  image?: string;
  category?: string;
  is_veg?: boolean;
  in_stock?: boolean;
  restaurant_id?: string;
  restaurant_name?: string;
  /** Backend catalog type. Restaurant menu items are 'fastfood' (website default). */
  productType?: string;
  vendorId?: string;
}

/** Default backend catalog type for restaurant menu items (matches the website). */
const DEFAULT_PRODUCT_TYPE = 'fastfood';

export interface CartState {
  vendorId: string | null;
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  updatedAt: number;
}

export type AddToCartResult =
  | { ok: true }
  | { ok: false; reason: 'vendor_mismatch'; currentVendorId: string; currentRestaurantName?: string };

const EMPTY: CartState = {
  vendorId: null, restaurantId: null, restaurantName: null, items: [], updatedAt: 0,
};

interface CartStore {
  items: CartItem[];
  vendorId: string | null;
  restaurantId: string | null;
  restaurantName: string | null;
  totalItems: number;
  subtotal: number;
  addItem: (vendorId: string, item: CartItem) => AddToCartResult;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, qty: number) => void;
  clearCart: () => void;
  replaceCart: (vendorId: string, item: CartItem, restaurantName?: string) => void;
  isLoading: boolean;
}

const CartContext = createContext<CartStore | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);

  // ── Hydrate from AsyncStorage on mount ──────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(CART_KEY)
      .then((raw) => { if (raw) setCart(JSON.parse(raw)); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const save = useCallback((next: CartState) => {
    setCart(next);
    AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const addItem = useCallback((vendorId: string, item: CartItem): AddToCartResult => {
    let result: AddToCartResult = { ok: true };
    setCart((prev) => {
      // Vendor mismatch — caller must confirm before clearing
      if (prev.vendorId && prev.vendorId !== vendorId && prev.items.length > 0) {
        result = {
          ok: false,
          reason: 'vendor_mismatch',
          currentVendorId: prev.vendorId,
          currentRestaurantName: prev.restaurantName ?? undefined,
        };
        return prev;
      }
      const existing = prev.items.find((i) => i.id === item.id);
      const newItems = existing
        ? prev.items.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev.items, { ...item, vendorId, productType: item.productType ?? DEFAULT_PRODUCT_TYPE, quantity: item.quantity || 1 }];
      const next: CartState = {
        vendorId,
        restaurantId: item.restaurant_id ?? prev.restaurantId ?? null,
        restaurantName: item.restaurant_name ?? prev.restaurantName ?? null,
        items: newItems,
        updatedAt: Date.now(),
      };
      AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return result;
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setCart((prev) => {
      const newItems = prev.items.filter((i) => i.id !== itemId);
      const next = newItems.length === 0 ? EMPTY : { ...prev, items: newItems, updatedAt: Date.now() };
      AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateQuantity = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) { removeItem(itemId); return; }
    setCart((prev) => {
      const newItems = prev.items.map((i) => i.id === itemId ? { ...i, quantity: qty } : i);
      const next = { ...prev, items: newItems, updatedAt: Date.now() };
      AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setCart(EMPTY);
    AsyncStorage.setItem(CART_KEY, JSON.stringify(EMPTY)).catch(() => {});
  }, []);

  const replaceCart = useCallback((vendorId: string, item: CartItem, restaurantName?: string) => {
    const next: CartState = {
      vendorId,
      restaurantId: item.restaurant_id ?? null,
      restaurantName: restaurantName ?? item.restaurant_name ?? null,
      items: [{ ...item, vendorId, productType: item.productType ?? DEFAULT_PRODUCT_TYPE, quantity: item.quantity || 1 }],
      updatedAt: Date.now(),
    };
    setCart(next);
    AsyncStorage.setItem(CART_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const totalItems = useMemo(() => cart.items.reduce((s, i) => s + i.quantity, 0), [cart.items]);
  const subtotal   = useMemo(() => cart.items.reduce((s, i) => s + i.price * i.quantity, 0), [cart.items]);

  const value = useMemo<CartStore>(() => ({
    items: cart.items,
    vendorId: cart.vendorId,
    restaurantId: cart.restaurantId,
    restaurantName: cart.restaurantName,
    totalItems, subtotal,
    addItem, removeItem, updateQuantity, clearCart, replaceCart, isLoading,
  }), [cart, totalItems, subtotal, addItem, removeItem, updateQuantity, clearCart, replaceCart, isLoading]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartStore {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
