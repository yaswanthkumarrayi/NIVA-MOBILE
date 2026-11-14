/**
 * Restaurant Menu Screen
 *
 * Mirrors RestaurantMenuPage.js from the website:
 *   • Fetches restaurant and menu items directly from Supabase (anon key).
 *   • Category tabs for filtering.
 *   • Veg / non-veg filter.
 *   • Add to cart with vendor mismatch dialog.
 *   • Floating cart bar.
 *   • Restaurant open/closed state.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  TextInput, ActivityIndicator, Alert, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { theme } from '../../src/theme';
import { menuApi } from '../../src/services/nivaApi';
import type { MenuItem, Restaurant } from '../../src/services/nivaApi';
import { useCart } from '../../src/services/cartStore';
import type { CartItem } from '../../src/services/cartStore';

export default function RestaurantMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items: cartItems, addItem, updateQuantity, totalItems, subtotal, vendorId: cartVendorId, replaceCart } = useCart();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnly, setVegOnly] = useState<boolean | null>(null);
  const [replaceDialog, setReplaceDialog] = useState<{ item: MenuItem } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      menuApi.getRestaurant(id as string),
      menuApi.getMenuItems(id as string),
    ])
      .then(([rest, items]) => {
        setRestaurant(rest);
        setMenuItems(items as MenuItem[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuItems.map((i) => i.category).filter(Boolean)));
    return ['All', ...cats];
  }, [menuItems]);

  const filtered = useMemo(() => {
    return menuItems.filter((i) => {
      if (activeCategory !== 'All' && i.category !== activeCategory) return false;
      if (vegOnly === true && !i.is_veg) return false;
      if (vegOnly === false && i.is_veg) return false;
      if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [menuItems, activeCategory, vegOnly, searchQuery]);

  const isOpen = restaurant?.restaurant_available !== false && restaurant?.is_active !== false;

  const getItemQty = (itemId: string) =>
    cartItems.find((i) => i.id === itemId)?.quantity ?? 0;

  const handleAdd = (item: MenuItem) => {
    if (!isOpen || item.in_stock === false) return;
    const result = addItem(item.restaurant_id, {
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      image_url: item.image_url,
      is_veg: item.is_veg,
      restaurant_id: item.restaurant_id,
      restaurant_name: restaurant?.name,
      category: item.category,
    } as CartItem);
    if (!result.ok && result.reason === 'vendor_mismatch') {
      setReplaceDialog({ item });
    }
  };

  const handleReplaceConfirm = () => {
    if (!replaceDialog) return;
    const item = replaceDialog.item;
    replaceCart(item.restaurant_id, {
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      image_url: item.image_url,
      is_veg: item.is_veg,
      restaurant_id: item.restaurant_id,
      restaurant_name: restaurant?.name,
      category: item.category,
    } as CartItem, restaurant?.name);
    setReplaceDialog(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={s.loadingWrap}><ActivityIndicator color={theme.colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle}>Restaurant</Text>
        </View>
        <View style={s.loadingWrap}>
          <Text style={s.errorText}>Restaurant not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Replace cart dialog */}
      {replaceDialog && (
        <View style={s.dialogOverlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Start a new cart?</Text>
            <Text style={s.dialogBody}>
              Your cart has items from {cartItems[0]?.restaurant_name ?? 'another restaurant'}.
              Adding this item will clear your current cart.
            </Text>
            <View style={s.dialogBtns}>
              <TouchableOpacity style={s.dialogCancel} onPress={() => setReplaceDialog(null)}>
                <Text style={s.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogConfirm} onPress={handleReplaceConfirm}>
                <Text style={s.dialogConfirmText}>Start New</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Nav */}
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.navInfo}>
          <Text style={s.navTitle} numberOfLines={1}>{restaurant.name}</Text>
          {!isOpen && <Text style={s.navClosed}>Closed</Text>}
        </View>
      </View>

      <ScrollView stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false}>
        {/* Banner */}
        <View style={s.heroBanner}>
          {restaurant.banner_url || restaurant.image_url ? (
            <Image source={{ uri: restaurant.banner_url ?? restaurant.image_url }} style={s.bannerImg} resizeMode="cover" />
          ) : (
            <View style={[s.bannerImg, s.bannerFallback]}>
              <Text style={{ fontSize: 48 }}>🍽️</Text>
            </View>
          )}
          {!isOpen && (
            <View style={s.closedBanner}>
              <Text style={s.closedBannerText}>This restaurant is currently closed</Text>
            </View>
          )}
          <View style={s.restaurantMeta}>
            {restaurant.cuisine ? <Text style={s.metaCuisine}>{restaurant.cuisine}</Text> : null}
            {restaurant.rating ? (
              <View style={s.ratingRow}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={s.ratingText}>{restaurant.rating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Search + filters sticky */}
        <View style={s.searchBar}>
          <View style={s.searchInput}>
            <Ionicons name="search" size={16} color={theme.colors.textMuted} />
            <TextInput
              style={s.searchText}
              placeholder="Search in menu…"
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <TouchableOpacity
            style={[s.vegBtn, vegOnly === true && s.vegBtnActive]}
            onPress={() => setVegOnly((v) => (v === true ? null : true))}
          >
            <View style={[s.vegDot, { backgroundColor: theme.colors.success }]} />
            <Text style={[s.vegBtnText, vegOnly === true && s.vegBtnTextActive]}>Veg</Text>
          </TouchableOpacity>
        </View>

        {/* Category tabs */}
        {categories.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catBar}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[s.catTab, activeCategory === cat && s.catTabActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[s.catTabText, activeCategory === cat && s.catTabTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Menu items */}
        <View style={s.menuList}>
          {filtered.length === 0 ? (
            <View style={s.emptyMenu}>
              <Text style={s.emptyMenuText}>No items found</Text>
            </View>
          ) : (
            filtered.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                qty={getItemQty(item.id)}
                isOpen={isOpen}
                onAdd={() => handleAdd(item)}
                onIncrease={() => updateQuantity(item.id, getItemQty(item.id) + 1)}
                onDecrease={() => updateQuantity(item.id, getItemQty(item.id) - 1)}
              />
            ))
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating cart */}
      {totalItems > 0 && (
        <TouchableOpacity style={s.floatingCart} onPress={() => router.push('/cart')}>
          <View style={s.fcLeft}>
            <View style={s.fcBadge}><Text style={s.fcBadgeText}>{totalItems}</Text></View>
            <Text style={s.fcLabel}>{totalItems} item{totalItems > 1 ? 's' : ''}</Text>
          </View>
          <View style={s.fcRight}>
            <Text style={s.fcAmount}>₹{subtotal}</Text>
            <Text style={s.fcCta}>View Cart</Text>
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

function MenuItemCard({
  item, qty, isOpen, onAdd, onIncrease, onDecrease,
}: {
  item: MenuItem; qty: number; isOpen: boolean;
  onAdd: () => void; onIncrease: () => void; onDecrease: () => void;
}) {
  const unavailable = !isOpen || item.in_stock === false;
  return (
    <View style={[s.menuCard, unavailable && s.menuCardDimmed]}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={s.menuImg} resizeMode="cover" />
      ) : (
        <View style={[s.menuImg, s.menuImgFallback]}>
          <Text style={{ fontSize: 20 }}>{item.is_veg ? '🥦' : '🍗'}</Text>
        </View>
      )}
      <View style={s.menuInfo}>
        <View style={s.nameRow}>
          <View style={[s.vegIndicator, { backgroundColor: item.is_veg ? theme.colors.success : theme.colors.error }]} />
          <Text style={s.menuName} numberOfLines={2}>{item.name}</Text>
        </View>
        {item.description ? <Text style={s.menuDesc} numberOfLines={2}>{item.description}</Text> : null}
        {item.in_stock === false ? (
          <Text style={s.outOfStock}>Out of stock</Text>
        ) : null}
        <View style={s.priceRow}>
          <Text style={s.menuPrice}>₹{item.price}</Text>
          {!unavailable && (
            qty === 0 ? (
              <TouchableOpacity style={s.addBtn} onPress={onAdd}>
                <Text style={s.addBtnText}>ADD</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.stepper}>
                <TouchableOpacity style={s.stepBtn} onPress={onDecrease}>
                  <Ionicons name="remove" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
                <Text style={s.stepQty}>{qty}</Text>
                <TouchableOpacity style={s.stepBtn} onPress={onIncrease}>
                  <Ionicons name="add" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            )
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { ...theme.typography.bodyMuted },
  navBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md,
    paddingVertical: 10, backgroundColor: theme.colors.background, gap: 10,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 6 },
  navInfo: { flex: 1 },
  navTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: theme.colors.textPrimary },
  navClosed: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.error, marginTop: 1 },
  heroBanner: { position: 'relative' },
  bannerImg: { width: '100%', height: 200 },
  bannerFallback: { backgroundColor: theme.colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  closedBanner: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 8, alignItems: 'center',
  },
  closedBannerText: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: '#fff' },
  restaurantMeta: {
    position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8, alignItems: 'center',
  },
  metaCuisine: {
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4, fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: '#fff',
  },
  ratingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
  },
  ratingText: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.xs, color: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.backgroundAlt, borderRadius: theme.radii.sm,
    paddingHorizontal: 10, height: 38,
  },
  searchText: { flex: 1, fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  vegBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: theme.radii.sm, borderWidth: 1, borderColor: theme.colors.success,
  },
  vegBtnActive: { backgroundColor: theme.colors.successSoft },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  vegBtnText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.success },
  vegBtnTextActive: { fontFamily: theme.fonts.bold },
  catBar: { paddingHorizontal: theme.spacing.lg, paddingVertical: 10, gap: 8, backgroundColor: theme.colors.background },
  catTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: theme.radii.pill, backgroundColor: theme.colors.backgroundAlt,
  },
  catTabActive: { backgroundColor: theme.colors.primary },
  catTabText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  catTabTextActive: { color: '#fff', fontFamily: theme.fonts.semibold },
  menuList: { paddingHorizontal: theme.spacing.lg, paddingTop: 8, gap: 10 },
  emptyMenu: { paddingVertical: 40, alignItems: 'center' },
  emptyMenuText: { ...theme.typography.bodyMuted },
  menuCard: {
    flexDirection: 'row', backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md, overflow: 'hidden', ...theme.shadows.card,
  },
  menuCardDimmed: { opacity: 0.55 },
  menuImg: { width: 90, height: 90 },
  menuImgFallback: { backgroundColor: theme.colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  menuInfo: { flex: 1, padding: theme.spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  vegIndicator: { width: 10, height: 10, borderRadius: 2, marginTop: 3, flexShrink: 0 },
  menuName: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  menuDesc: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textSecondary, marginTop: 2 },
  outOfStock: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.error, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  menuPrice: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  addBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 6, borderRadius: theme.radii.sm,
  },
  addBtnText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.sm, color: '#fff' },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.sm, paddingHorizontal: 4,
  },
  stepBtn: { padding: 6 },
  stepQty: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.sm, color: theme.colors.primary, minWidth: 20, textAlign: 'center' },
  floatingCart: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    backgroundColor: theme.colors.ink, borderRadius: theme.radii.lg,
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...theme.shadows.floating,
  },
  fcLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fcBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  fcBadgeText: { color: '#fff', fontFamily: theme.fonts.bold, fontSize: 11 },
  fcLabel: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: '#fff' },
  fcRight: { alignItems: 'flex-end' },
  fcAmount: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: '#fff' },
  fcCta: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: 'rgba(255,255,255,0.7)' },
  dialogOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  dialog: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl,
    padding: theme.spacing.xl, width: '100%',
  },
  dialogTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: theme.colors.textPrimary, marginBottom: 8 },
  dialogBody: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.md, color: theme.colors.textSecondary, marginBottom: 20 },
  dialogBtns: { flexDirection: 'row', gap: 10 },
  dialogCancel: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radii.sm,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center',
  },
  dialogCancelText: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.md, color: theme.colors.textSecondary },
  dialogConfirm: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primary, alignItems: 'center',
  },
  dialogConfirmText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: '#fff' },
});
