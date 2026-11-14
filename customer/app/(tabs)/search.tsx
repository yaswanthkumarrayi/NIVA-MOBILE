/**
 * NIVA — Search Screen
 * Search restaurants and menu items. Publicly accessible.
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, Image, ActivityIndicator, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../../src/theme';
import { menuApi } from '../../src/services/nivaApi';
import type { Restaurant, MenuItem } from '../../src/services/nivaApi';
import { useCart } from '../../src/services/cartStore';

type SearchSection = 'all' | 'restaurants' | 'items';

export default function SearchScreen() {
  const { addItem, totalItems } = useCart();
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<SearchSection>('all');
  const [loading, setLoading] = useState(false);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setRestaurants([]); setMenuItems([]); setSearched(false); return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const [rests, items] = await Promise.all([
        menuApi.searchRestaurants(q).catch(() => []),
        menuApi.searchItems(q).catch(() => []),
      ]);
      setRestaurants(rests as Restaurant[]);
      setMenuItems(items);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const handleChange = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => doSearch(text), 400);
  };

  const clear = () => { setQuery(''); setRestaurants([]); setMenuItems([]); setSearched(false); };

  const totalResults = restaurants.length + menuItems.length;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Search bar */}
      <View style={s.bar}>
        <View style={s.inputWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} style={s.searchIcon} />
          <TextInput
            style={s.input}
            placeholder="Search restaurants, dishes…"
            placeholderTextColor={theme.colors.textMuted}
            value={query}
            onChangeText={handleChange}
            returnKeyType="search"
            onSubmitEditing={() => { Keyboard.dismiss(); doSearch(query); }}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={clear} style={s.clearBtn}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <View style={s.pills}>
        {(['all', 'restaurants', 'items'] as SearchSection[]).map((sec) => (
          <TouchableOpacity
            key={sec}
            style={[s.pill, section === sec && s.pillActive]}
            onPress={() => setSection(sec)}
          >
            <Text style={[s.pillText, section === sec && s.pillTextActive]}>
              {sec === 'all' ? 'All' : sec === 'restaurants' ? 'Restaurants' : 'Dishes'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {!searched && (
          <View style={s.placeholder}>
            <Ionicons name="search-outline" size={56} color={theme.colors.border} />
            <Text style={s.placeholderText}>Search for restaurants or dishes</Text>
          </View>
        )}

        {loading && (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}

        {searched && !loading && totalResults === 0 && (
          <View style={s.placeholder}>
            <Ionicons name="search-circle-outline" size={56} color={theme.colors.border} />
            <Text style={s.placeholderText}>No results for "{query}"</Text>
          </View>
        )}

        {/* Restaurants section */}
        {!loading && (section === 'all' || section === 'restaurants') && restaurants.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Restaurants</Text>
            {restaurants.map((r) => (
              <TouchableOpacity key={r.id} style={s.restRow} onPress={() => router.push(`/restaurant/${r.id}`)}>
                {r.image_url ? (
                  <Image source={{ uri: r.image_url }} style={s.restImg} resizeMode="cover" />
                ) : (
                  <View style={[s.restImg, s.restImgFallback]}><Text style={{ fontSize: 20 }}>🍽️</Text></View>
                )}
                <View style={s.restRowInfo}>
                  <Text style={s.restRowName}>{r.name}</Text>
                  {r.cuisine ? <Text style={s.restRowCuisine}>{r.cuisine}</Text> : null}
                  <Text style={[s.restRowStatus, { color: r.restaurant_available !== false ? theme.colors.success : theme.colors.error }]}>
                    {r.restaurant_available !== false ? '● Open' : '● Closed'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Dishes section */}
        {!loading && (section === 'all' || section === 'items') && menuItems.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Dishes</Text>
            {menuItems.map((item: any) => (
              <TouchableOpacity
                key={item.id}
                style={s.itemRow}
                onPress={() => router.push(`/restaurant/${item.restaurant_id}`)}
              >
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={s.itemImg} resizeMode="cover" />
                ) : (
                  <View style={[s.itemImg, s.restImgFallback]}>
                    <Text style={{ fontSize: 16 }}>{item.is_veg ? '🥦' : '🍗'}</Text>
                  </View>
                )}
                <View style={s.restRowInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[s.vegDot, { backgroundColor: item.is_veg ? theme.colors.success : theme.colors.error }]} />
                    <Text style={s.restRowName}>{item.name}</Text>
                  </View>
                  <Text style={s.restRowCuisine}>{item.restaurants?.name ?? item.category}</Text>
                  <Text style={s.price}>₹{item.price}</Text>
                </View>
                {item.in_stock !== false && (
                  <TouchableOpacity
                    style={s.addBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      addItem(item.restaurant_id, {
                        id: item.id, name: item.name, price: item.price,
                        quantity: 1, image_url: item.image_url,
                        is_veg: item.is_veg, restaurant_id: item.restaurant_id,
                        restaurant_name: item.restaurants?.name,
                      });
                    }}
                  >
                    <Text style={s.addBtnText}>ADD</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  bar: { paddingHorizontal: theme.spacing.lg, paddingVertical: 10 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    borderWidth: 1, borderColor: theme.colors.border, height: 46,
  },
  searchIcon: { marginLeft: 12 },
  input: {
    flex: 1, paddingHorizontal: 10, fontFamily: theme.fonts.regular,
    fontSize: theme.fontSize.md, color: theme.colors.textPrimary,
  },
  clearBtn: { padding: 10 },
  pills: { flexDirection: 'row', paddingHorizontal: theme.spacing.lg, gap: 8, marginBottom: 8 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  pillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  pillText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  pillTextActive: { color: '#fff' },
  scroll: { paddingHorizontal: theme.spacing.lg },
  placeholder: { alignItems: 'center', paddingTop: 60, gap: 12 },
  placeholderText: { ...theme.typography.bodyMuted, textAlign: 'center' },
  loadingWrap: { paddingTop: 40, alignItems: 'center' },
  section: { marginTop: 16, gap: 10 },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary, marginBottom: 4 },
  restRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    padding: theme.spacing.md, ...theme.shadows.card,
  },
  restImg: { width: 56, height: 56, borderRadius: theme.radii.sm },
  restImgFallback: { backgroundColor: theme.colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  restRowInfo: { flex: 1 },
  restRowName: { fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  restRowCuisine: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 2 },
  restRowStatus: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, marginTop: 3 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.md,
    padding: theme.spacing.md, ...theme.shadows.card,
  },
  itemImg: { width: 56, height: 56, borderRadius: theme.radii.sm },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  price: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary, marginTop: 3 },
  addBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: theme.radii.sm,
  },
  addBtnText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.xs, color: '#fff' },
});
