/**
 * NIVA Customer — Home Screen
 *
 * Publicly accessible — no login required.
 * Mirrors the data shown on the NIVA website's FoodsPage:
 *   • Hero banners (admin-managed, platform=foods)
 *   • NIVA Streak progress (authenticated only)
 *   • Category filter row
 *   • Restaurant listing from the backend
 *   • Floating cart indicator
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  Image, StyleSheet, ActivityIndicator, Dimensions, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/theme';
import { useCustomerStore } from '../../src/services/customerStore';
import { useCart } from '../../src/services/cartStore';
import { restaurantsApi, bannersApi, streakApi } from '../../src/services/nivaApi';
import type { Restaurant, HeroBanner } from '../../src/services/nivaApi';

const { width: SCREEN_W } = Dimensions.get('window');
const BANNER_H = 180;

const CATEGORIES = [
  { id: 'all',    label: 'All',       icon: '🍽️' },
  { id: 'rice',   label: 'Rice',      icon: '🍛' },
  { id: 'noodle', label: 'Noodles',   icon: '🍜' },
  { id: 'snacks', label: 'Snacks',    icon: '🍟' },
  { id: 'meals',  label: 'Meals',     icon: '🥘' },
  { id: 'drinks', label: 'Drinks',    icon: '🥤' },
];

export default function HomeScreen() {
  const { session, authState } = useCustomerStore();
  const { totalItems, subtotal } = useCart();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [streak, setStreak] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCat, setActiveCat] = useState('all');
  const [bannerIdx, setBannerIdx] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [restRes, bannerRes] = await Promise.all([
        restaurantsApi.getActive().catch(() => ({ success: false, restaurants: [] })),
        bannersApi.getBanners('foods').catch(() => ({ success: false, banners: [] })),
      ]);
      if (restRes.success) setRestaurants(restRes.restaurants ?? []);
      if (bannerRes.success) setBanners(bannerRes.banners ?? []);

      // Streak only for authenticated users
      if (session?.token) {
        streakApi.getStreak(session.token)
          .then((r) => { if (r.success && r.campaigns?.length) setStreak(r.campaigns[0]); })
          .catch(() => {});
      }
    } catch { /* network — keep previous data */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  // Auto-advance banners
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setBannerIdx((i) => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners.length]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.brandRow}>
          <Text style={s.brand}>NIVA</Text>
          <Text style={s.tagline}>Fresh on campus</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/cart')}>
            <Ionicons name="bag-outline" size={22} color={theme.colors.ink} />
            {totalItems > 0 && (
              <View style={s.cartBadge}>
                <Text style={s.cartBadgeText}>{totalItems > 9 ? '9+' : totalItems}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/(tabs)/search')}>
            <Ionicons name="search-outline" size={22} color={theme.colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        contentContainerStyle={s.scroll}
      >
        {/* Hero Banners */}
        {banners.length > 0 ? (
          <View style={s.bannerWrap}>
            <Image
              source={{ uri: banners[bannerIdx]?.image_url }}
              style={s.banner}
              resizeMode="cover"
            />
            {banners.length > 1 && (
              <View style={s.dots}>
                {banners.map((_, i) => (
                  <View key={i} style={[s.dot, i === bannerIdx && s.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={[s.bannerWrap, s.bannerFallback]}>
            <Text style={s.bannerFallbackText}>🍜  Welcome to NIVA</Text>
            <Text style={s.bannerFallbackSub}>Order from campus restaurants</Text>
          </View>
        )}

        {/* Streak Banner */}
        {streak && session && (
          <TouchableOpacity style={s.streakCard} onPress={() => router.push('/(tabs)/offers')}>
            <Ionicons name="flame" size={20} color="#F59E0B" />
            <View style={s.streakText}>
              <Text style={s.streakTitle}>{streak.name}</Text>
              <Text style={s.streakSub}>
                {streak.customer_progress ?? 0}/{streak.target_orders ?? 10} orders — keep going!
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Category Row */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Restaurants</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catScroll}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.catChip, activeCat === c.id && s.catChipActive]}
              onPress={() => setActiveCat(c.id)}
            >
              <Text style={s.catIcon}>{c.icon}</Text>
              <Text style={[s.catLabel, activeCat === c.id && s.catLabelActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* NIVA Deliveries Feature Card */}
        <TouchableOpacity style={s.deliveryCard} onPress={() => router.push('/deliveries')}>
          <View style={s.deliveryCardLeft}>
            <Text style={s.deliveryCardTitle}>NIVA Deliveries</Text>
            <Text style={s.deliveryCardSub}>Room delivery from Swiggy, Zomato & more</Text>
            <View style={s.deliveryTag}>
              <Text style={s.deliveryTagText}>From ₹29</Text>
            </View>
          </View>
          <View style={s.deliveryCardRight}>
            <Text style={s.deliveryEmoji}>🚚</Text>
          </View>
        </TouchableOpacity>

        {/* Restaurant List */}
        {loading ? (
          <View style={s.loadingWrap}>
            {[1, 2, 3].map((k) => <RestaurantSkeleton key={k} />)}
          </View>
        ) : restaurants.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>No restaurants available right now</Text>
          </View>
        ) : (
          <View style={s.restaurantList}>
            {restaurants.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Cart */}
      {totalItems > 0 && (
        <TouchableOpacity style={s.floatingCart} onPress={() => router.push('/cart')}>
          <View style={s.fcLeft}>
            <View style={s.fcBadge}>
              <Text style={s.fcBadgeText}>{totalItems}</Text>
            </View>
            <Text style={s.fcLabel}>View Cart</Text>
          </View>
          <Text style={s.fcAmount}>₹{subtotal.toFixed(0)}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const isOpen = restaurant.restaurant_available !== false && restaurant.is_active !== false;

  return (
    <TouchableOpacity
      style={s.restCard}
      onPress={() => router.push(`/restaurant/${restaurant.id}` as any)}
      disabled={!isOpen}
    >
      <View style={s.restImageWrap}>
        {restaurant.image_url || restaurant.banner_url ? (
          <Image
            source={{ uri: restaurant.image_url ?? restaurant.banner_url }}
            style={s.restImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[s.restImage, s.restImageFallback]}>
            <Text style={{ fontSize: 32 }}>🍽️</Text>
          </View>
        )}
        {!isOpen && (
          <View style={s.closedOverlay}>
            <Text style={s.closedText}>Closed</Text>
          </View>
        )}
      </View>
      <View style={s.restInfo}>
        <Text style={s.restName}>{restaurant.name}</Text>
        {restaurant.cuisine ? <Text style={s.restCuisine}>{restaurant.cuisine}</Text> : null}
        <View style={s.restMeta}>
          {restaurant.rating ? (
            <View style={s.ratingRow}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={s.ratingText}>{restaurant.rating.toFixed(1)}</Text>
              {restaurant.rating_count ? (
                <Text style={s.ratingCount}>({restaurant.rating_count > 1000
                  ? `${(restaurant.rating_count / 1000).toFixed(1)}K`
                  : restaurant.rating_count})</Text>
              ) : null}
            </View>
          ) : null}
          {restaurant.avg_delivery_time ? (
            <Text style={s.deliveryTime}> · {restaurant.avg_delivery_time}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function RestaurantSkeleton() {
  return (
    <View style={[s.restCard, { opacity: 0.5 }]}>
      <View style={[s.restImage, { backgroundColor: theme.colors.border }]} />
      <View style={s.restInfo}>
        <View style={{ width: '60%', height: 16, backgroundColor: theme.colors.border, borderRadius: 4, marginBottom: 6 }} />
        <View style={{ width: '40%', height: 12, backgroundColor: theme.colors.border, borderRadius: 4 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingVertical: 12,
    backgroundColor: theme.colors.background,
  },
  brandRow: {},
  brand: { fontFamily: theme.fonts.bold, fontSize: 22, color: theme.colors.ink, letterSpacing: 1 },
  tagline: { fontFamily: theme.fonts.regular, fontSize: 11, color: theme.colors.textMuted },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    alignItems: 'center', justifyContent: 'center', ...theme.shadows.card,
  },
  cartBadge: {
    position: 'absolute', top: 2, right: 2, width: 16, height: 16,
    borderRadius: 8, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  cartBadgeText: { color: '#fff', fontSize: 9, fontFamily: theme.fonts.bold },
  scroll: { paddingBottom: 24 },
  bannerWrap: { marginHorizontal: theme.spacing.lg, marginTop: 8, borderRadius: theme.radii.lg, overflow: 'hidden' },
  banner: { width: '100%', height: BANNER_H, borderRadius: theme.radii.lg },
  bannerFallback: {
    height: BANNER_H, backgroundColor: theme.colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerFallbackText: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.primary },
  bannerFallbackSub: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  dots: { flexDirection: 'row', gap: 4, position: 'absolute', bottom: 10, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  streakCard: {
    marginHorizontal: theme.spacing.lg, marginTop: 12,
    backgroundColor: '#FFFBEB', borderRadius: theme.radii.md,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: theme.spacing.md, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  streakText: { flex: 1 },
  streakTitle: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.sm, color: '#92400E' },
  streakSub: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: '#B45309', marginTop: 2 },
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, marginTop: 20, marginBottom: 10,
  },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: theme.colors.textPrimary },
  catScroll: { paddingHorizontal: theme.spacing.lg, gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  catChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  catIcon: { fontSize: 14 },
  catLabel: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  catLabelActive: { color: '#fff' },
  deliveryCard: {
    marginHorizontal: theme.spacing.lg, marginTop: 16,
    backgroundColor: theme.colors.ink, borderRadius: theme.radii.lg,
    padding: theme.spacing.lg, flexDirection: 'row', alignItems: 'center',
  },
  deliveryCardLeft: { flex: 1 },
  deliveryCardTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: '#fff' },
  deliveryCardSub: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  deliveryTag: {
    marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radii.pill,
  },
  deliveryTagText: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.xs, color: '#fff' },
  deliveryCardRight: { marginLeft: 12 },
  deliveryEmoji: { fontSize: 40 },
  loadingWrap: { paddingHorizontal: theme.spacing.lg, gap: 12, marginTop: 16 },
  emptyWrap: { alignItems: 'center', padding: 40 },
  emptyText: { ...theme.typography.bodyMuted },
  restaurantList: { paddingHorizontal: theme.spacing.lg, gap: 12, marginTop: 16 },
  restCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    overflow: 'hidden', ...theme.shadows.card,
  },
  restImageWrap: { position: 'relative' },
  restImage: { width: '100%', height: 140 },
  restImageFallback: { backgroundColor: theme.colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  closedText: { fontFamily: theme.fonts.bold, fontSize: 16, color: '#fff' },
  restInfo: { padding: theme.spacing.md },
  restName: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  restCuisine: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 2 },
  restMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.xs, color: '#78350F' },
  ratingCount: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted },
  deliveryTime: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted },
  // Floating cart
  floatingCart: {
    position: 'absolute', bottom: 80, left: 20, right: 20,
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
  fcLabel: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.md, color: '#fff' },
  fcAmount: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: '#fff' },
});
