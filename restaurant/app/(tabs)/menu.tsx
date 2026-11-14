/**
 * Menu Tab
 *
 * Category filter bar at the top (All + each category as chips).
 * Tapping a chip filters the list to that category only.
 * Stock toggle per item.
 */
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Switch,
  ActivityIndicator, StyleSheet, RefreshControl, Alert, ScrollView,
} from 'react-native';
import { restaurantApi } from '@niva/shared';
import { NIVA_COLORS } from '@niva/shared';
import type { MenuItem } from '@niva/shared';
import { useRestaurantStore } from '../../src/services/restaurantStore';

export default function MenuScreen() {
  const { session } = useRestaurantStore();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [error, setError] = useState('');

  const fetchMenu = useCallback(async (silent = false) => {
    if (!session) return;
    if (!silent) setLoading(true);
    try {
      const res = await restaurantApi.getMenu(session.token);
      const fetched = res.items || [];
      setItems(fetched);
      setError('');
    } catch (e: any) {
      setError(e?.data?.message ?? 'Could not load menu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  // Derive unique categories in the order they appear
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      const cat = item.category?.trim() || 'Other';
      if (!seen.has(cat)) { seen.add(cat); result.push(cat); }
    }
    return result;
  }, [items]);

  // Filter items by selected category
  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return items;
    return items.filter(i => (i.category?.trim() || 'Other') === selectedCategory);
  }, [items, selectedCategory]);

  const toggleStock = async (item: MenuItem) => {
    if (!session || updatingId === item.id) return;
    setUpdatingId(item.id);
    const next = !item.in_stock;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, in_stock: next } : i));
    try {
      await restaurantApi.updateMenuItemStock(item.id, next, session.token);
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, in_stock: !next } : i));
      Alert.alert('Error', 'Failed to update stock status.');
    } finally { setUpdatingId(null); }
  };

  if (loading) {
    return <View style={s.loader}><ActivityIndicator size="large" color={NIVA_COLORS.orange} /></View>;
  }

  if (items.length === 0) {
    return (
      <View style={s.container}>
        <View style={s.empty}>
          <Text style={s.emptyTitle}>{error ? 'Could not load menu' : 'No menu items'}</Text>
          <Text style={s.emptySub}>{error || 'Add items from the web restaurant panel.'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => fetchMenu()}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const inStock = filteredItems.filter(i => i.in_stock).length;
  const outOfStock = filteredItems.filter(i => !i.in_stock).length;

  return (
    <View style={s.container}>
      {/* Category filter bar */}
      <View style={s.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 10 }}
        >
          {['All', ...categories].map(cat => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[s.chip, active && s.chipActive]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.7}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Summary strip */}
      <View style={s.summaryStrip}>
        <Text style={s.summaryText}>
          {filteredItems.length} items
          {inStock > 0 ? `  ·  ${inStock} available` : ''}
          {outOfStock > 0 ? `  ·  ${outOfStock} out of stock` : ''}
        </Text>
      </View>

      {/* Item list — no further category grouping since the chip handles it */}
      <FlatList
        data={filteredItems}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchMenu(); }}
            tintColor={NIVA_COLORS.orange}
          />
        }
        renderItem={({ item: menuItem }) => (
          <View style={[s.menuItem, !menuItem.in_stock && s.menuItemOos]}>
            {/* Veg/non-veg indicator */}
            <View style={[s.vegBox, { borderColor: menuItem.is_veg ? NIVA_COLORS.green : NIVA_COLORS.red }]}>
              <View style={[s.vegDot, { backgroundColor: menuItem.is_veg ? NIVA_COLORS.green : NIVA_COLORS.red }]} />
            </View>

            {/* Name + category */}
            <View style={s.itemInfo}>
              <Text style={[s.itemName, !menuItem.in_stock && s.itemNameOos]}>{menuItem.name}</Text>
              <Text style={s.itemCat}>{menuItem.category || 'Uncategorised'}</Text>
            </View>

            {/* Price + toggle */}
            <View style={s.itemRight}>
              <Text style={s.price}>₹{menuItem.price}</Text>
              {updatingId === menuItem.id ? (
                <ActivityIndicator size="small" color={NIVA_COLORS.orange} style={{ marginLeft: 8 }} />
              ) : (
                <Switch
                  value={menuItem.in_stock}
                  onValueChange={() => toggleStock(menuItem)}
                  trackColor={{ false: NIVA_COLORS.gray200, true: NIVA_COLORS.green }}
                  thumbColor={NIVA_COLORS.white}
                  style={{ marginLeft: 8, transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                />
              )}
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: NIVA_COLORS.gray100, marginHorizontal: 4 }} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: NIVA_COLORS.gray50 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray600, marginBottom: 6 },
  emptySub: { fontSize: 13, color: NIVA_COLORS.gray400, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: NIVA_COLORS.black, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryText: { color: '#fff', fontFamily: 'Montserrat-SemiBold' },

  // Filter bar
  filterBar: { backgroundColor: NIVA_COLORS.white, borderBottomWidth: 1, borderBottomColor: NIVA_COLORS.gray100 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: NIVA_COLORS.gray200,
    backgroundColor: NIVA_COLORS.white,
  },
  chipActive: { backgroundColor: NIVA_COLORS.black, borderColor: NIVA_COLORS.black },
  chipText: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray600 },
  chipTextActive: { color: NIVA_COLORS.white },

  // Summary
  summaryStrip: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: NIVA_COLORS.white },
  summaryText: { fontSize: 12, color: NIVA_COLORS.gray400, fontFamily: 'Montserrat-Regular' },

  // Menu item row
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: NIVA_COLORS.white,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  menuItemOos: { opacity: 0.5 },
  vegBox: {
    width: 14, height: 14, borderRadius: 2, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontFamily: 'Montserrat-Medium', color: NIVA_COLORS.gray900 },
  itemNameOos: { color: NIVA_COLORS.gray400 },
  itemCat: { fontSize: 11, color: NIVA_COLORS.gray400, marginTop: 1 },
  itemRight: { flexDirection: 'row', alignItems: 'center' },
  price: { fontSize: 13, fontFamily: 'Montserrat-SemiBold', color: NIVA_COLORS.gray700 },
});
