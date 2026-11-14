/**
 * NIVA — Cart Screen
 * Shows cart items, quantity controls, subtotal and checkout button.
 * Cart is accessible without login; authentication is checked at checkout.
 */
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../src/theme';
import { useCart } from '../src/services/cartStore';
import { useCustomerStore } from '../src/services/customerStore';
import { EmptyState } from '../src/components/ui/EmptyState';

export default function CartScreen() {
  const { items, updateQuantity, removeItem, clearCart, totalItems, subtotal, restaurantName } = useCart();
  const { session } = useCustomerStore();

  const handleCheckout = () => {
    if (!session) {
      router.push('/(auth)/login');
      return;
    }
    router.push('/checkout');
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.navBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle}>Cart</Text>
        </View>
        <EmptyState
          icon="bag-outline"
          title="Your cart is empty"
          subtitle="Browse restaurants and add items to get started."
          action={{ label: 'Browse Restaurants', onPress: () => router.push('/(tabs)') }}
        />
      </SafeAreaView>
    );
  }

  // Delivery fee — restaurant orders have no delivery fee shown here (backend calculates)
  const GST = Math.round(subtotal * 0.05);
  const total = subtotal + GST;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Nav */}
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.navInfo}>
          <Text style={s.navTitle}>Cart</Text>
          {restaurantName && <Text style={s.navSub}>{restaurantName}</Text>}
        </View>
        <TouchableOpacity onPress={() => { clearCart(); }} style={s.clearBtn}>
          <Text style={s.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Items */}
        <View style={s.card}>
          {items.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && <View style={s.sep} />}
              <View style={s.itemRow}>
                <View style={[s.vegDot, { backgroundColor: item.is_veg ? theme.colors.success : theme.colors.error }]} />
                <View style={s.itemInfo}>
                  <Text style={s.itemName}>{item.name}</Text>
                  <Text style={s.itemPrice}>₹{item.price}</Text>
                </View>
                <View style={s.stepper}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => updateQuantity(item.id, item.quantity - 1)}>
                    <Ionicons name={item.quantity === 1 ? 'trash-outline' : 'remove'} size={15} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <Text style={s.stepQty}>{item.quantity}</Text>
                  <TouchableOpacity style={s.stepBtn} onPress={() => updateQuantity(item.id, item.quantity + 1)}>
                    <Ionicons name="add" size={15} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={s.itemTotal}>₹{item.price * item.quantity}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Bill summary */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Bill Details</Text>
          <View style={s.billRow}>
            <Text style={s.billLabel}>Item total</Text>
            <Text style={s.billValue}>₹{subtotal}</Text>
          </View>
          <View style={s.billRow}>
            <Text style={s.billLabel}>Taxes & charges</Text>
            <Text style={s.billValue}>₹{GST}</Text>
          </View>
          <View style={s.billRow}>
            <Text style={s.billLabel}>Delivery fee</Text>
            <Text style={[s.billValue, { color: theme.colors.success }]}>Calculated at checkout</Text>
          </View>
          <View style={[s.sep, { marginVertical: 10 }]} />
          <View style={s.billRow}>
            <Text style={s.totalLabel}>Estimated Total</Text>
            <Text style={s.totalValue}>₹{total}</Text>
          </View>
        </View>

        {/* Login nudge for guests */}
        {!session && (
          <View style={s.loginNudge}>
            <Ionicons name="person-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={s.loginNudgeText}>Sign in to place your order</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Checkout button */}
      <View style={s.footer}>
        <TouchableOpacity style={s.checkoutBtn} onPress={handleCheckout}>
          <View style={s.checkoutLeft}>
            <Text style={s.checkoutCount}>{totalItems} item{totalItems > 1 ? 's' : ''}</Text>
          </View>
          <Text style={s.checkoutLabel}>
            {!session ? 'Sign In & Checkout' : 'Proceed to Checkout'}
          </Text>
          <Text style={s.checkoutAmount}>₹{total}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  navBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md,
    paddingVertical: 10, gap: 10,
  },
  backBtn: { padding: 6 },
  navInfo: { flex: 1 },
  navTitle: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.textPrimary },
  navSub: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textMuted },
  clearBtn: { padding: 8 },
  clearBtnText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.error },
  scroll: { paddingHorizontal: theme.spacing.lg, gap: 12, paddingTop: 8, paddingBottom: 20 },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    padding: theme.spacing.lg, ...theme.shadows.card,
  },
  cardTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary, marginBottom: 12 },
  sep: { height: 1, backgroundColor: theme.colors.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  vegDot: { width: 10, height: 10, borderRadius: 2, flexShrink: 0 },
  itemInfo: { flex: 1 },
  itemName: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  itemPrice: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 2 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.sm, paddingHorizontal: 4,
  },
  stepBtn: { padding: 6 },
  stepQty: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.sm, color: theme.colors.primary, minWidth: 20, textAlign: 'center' },
  itemTotal: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary, minWidth: 48, textAlign: 'right' },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  billLabel: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary },
  billValue: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.textPrimary },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  totalValue: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.primary },
  loginNudge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.primarySoft, padding: theme.spacing.md,
    borderRadius: theme.radii.md,
  },
  loginNudgeText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.primary },
  footer: {
    padding: theme.spacing.lg, paddingBottom: 28,
    backgroundColor: theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  checkoutBtn: {
    backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg,
    paddingHorizontal: 20, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  checkoutLeft: {},
  checkoutCount: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: 'rgba(255,255,255,0.8)' },
  checkoutLabel: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: '#fff' },
  checkoutAmount: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: '#fff' },
});
