/**
 * NIVA — Offers & Streak Screen
 * Shows NIVA streak progress and reward coupons.
 * Publicly visible; streak progress shown only when logged in.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../../src/theme';
import { useCustomerStore } from '../../src/services/customerStore';
import { streakApi, walletApi } from '../../src/services/nivaApi';
import type { WalletSummary } from '../../src/services/nivaApi';

export default function OffersScreen() {
  const { session } = useCustomerStore();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!session) return;
    if (!silent) setLoading(true);
    try {
      const [streakRes, couponRes, walletRes] = await Promise.all([
        streakApi.getStreak(session.token).catch(() => ({ success: false, campaigns: [] })),
        streakApi.getRewardCoupons(session.token).catch(() => ({ success: false, coupons: [] })),
        walletApi.getWallet(session.token).catch(() => ({ success: false, wallet: null })),
      ]);
      if (streakRes.success) setCampaigns(streakRes.campaigns ?? []);
      if (couponRes.success) setCoupons(couponRes.coupons ?? []);
      if (walletRes.success && walletRes.wallet) setWallet(walletRes.wallet);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  if (!session) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}><Text style={s.headerTitle}>Offers & Rewards</Text></View>
        <View style={s.loginPrompt}>
          <Ionicons name="pricetags-outline" size={56} color={theme.colors.border} />
          <Text style={s.loginTitle}>Sign in to unlock rewards</Text>
          <Text style={s.loginSub}>View your NIVA streak, coupons, and wallet balance.</Text>
          <TouchableOpacity style={s.loginBtn} onPress={() => router.push('/(auth)/login')}>
            <Text style={s.loginBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}><Text style={s.headerTitle}>Offers & Rewards</Text></View>
        <View style={s.loadingWrap}><ActivityIndicator color={theme.colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>Offers & Rewards</Text></View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        contentContainerStyle={s.scroll}
      >
        {/* Wallet balance */}
        {wallet !== null && (
          <View style={s.walletCard}>
            <View>
              <Text style={s.walletLabel}>NIVA Wallet</Text>
              <Text style={s.walletBalance}>₹{wallet.balance?.toFixed(0) ?? 0}</Text>
              {!wallet.unlocked && (
                <Text style={s.walletLock}>Place more orders to unlock wallet usage</Text>
              )}
            </View>
            <Ionicons name="wallet-outline" size={32} color={theme.colors.primary} />
          </View>
        )}

        {/* Streak Campaigns */}
        {campaigns.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Your Streak</Text>
            {campaigns.map((c) => (
              <StreakCard key={c.id} campaign={c} />
            ))}
          </View>
        )}

        {/* Reward Coupons */}
        {coupons.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Reward Coupons</Text>
            {coupons.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </View>
        )}

        {campaigns.length === 0 && coupons.length === 0 && (
          <View style={s.emptyWrap}>
            <Ionicons name="ribbon-outline" size={56} color={theme.colors.border} />
            <Text style={s.emptyTitle}>No active offers</Text>
            <Text style={s.emptySub}>Keep ordering to unlock streak rewards!</Text>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StreakCard({ campaign }: { campaign: any }) {
  const progress = campaign.customer_progress ?? 0;
  const target = campaign.target_orders ?? 10;
  const pct = Math.min(progress / target, 1);

  return (
    <View style={s.streakCard}>
      <View style={s.streakTop}>
        <Ionicons name="flame" size={20} color="#F59E0B" />
        <Text style={s.streakName}>{campaign.name}</Text>
      </View>
      {campaign.description ? <Text style={s.streakDesc}>{campaign.description}</Text> : null}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={s.progressLabel}>{progress} / {target} orders</Text>
      {campaign.reward_coupon_code && progress >= target && (
        <View style={s.rewardBanner}>
          <Ionicons name="gift-outline" size={16} color={theme.colors.success} />
          <Text style={s.rewardText}>Reward unlocked! Coupon: {campaign.reward_coupon_code}</Text>
        </View>
      )}
    </View>
  );
}

function CouponCard({ coupon }: { coupon: any }) {
  return (
    <View style={s.couponCard}>
      <View style={s.couponLeft}>
        <Text style={s.couponCode}>{coupon.code}</Text>
        <Text style={s.couponDesc}>{coupon.description || 'Reward coupon'}</Text>
        {coupon.expiry_date && (
          <Text style={s.couponExpiry}>Expires {new Date(coupon.expiry_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
        )}
      </View>
      <View style={s.couponRight}>
        <Text style={s.couponDiscount}>
          {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `₹${coupon.discount_value}`}
        </Text>
        <Text style={s.couponOff}>OFF</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: 14 },
  headerTitle: { fontFamily: theme.fonts.bold, fontSize: 22, color: theme.colors.textPrimary },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: theme.spacing.lg, paddingBottom: 24 },
  loginPrompt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loginTitle: { ...theme.typography.heading, textAlign: 'center' },
  loginSub: { ...theme.typography.bodyMuted, textAlign: 'center' },
  loginBtn: {
    marginTop: 8, backgroundColor: theme.colors.primary, paddingHorizontal: 32, paddingVertical: 12,
    borderRadius: theme.radii.pill,
  },
  loginBtnText: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: '#fff' },
  walletCard: {
    backgroundColor: theme.colors.ink, borderRadius: theme.radii.lg,
    padding: theme.spacing.lg, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  walletLabel: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: 'rgba(255,255,255,0.7)' },
  walletBalance: { fontFamily: theme.fonts.bold, fontSize: 28, color: '#fff', marginTop: 4 },
  walletLock: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.lg, color: theme.colors.textPrimary, marginBottom: 12 },
  streakCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    padding: theme.spacing.lg, ...theme.shadows.card, marginBottom: 10,
  },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  streakName: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  streakDesc: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginBottom: 10 },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: theme.colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 4 },
  progressLabel: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 6 },
  rewardBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: theme.colors.successSoft, padding: 8, borderRadius: theme.radii.sm,
  },
  rewardText: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.sm, color: theme.colors.success },
  couponCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg,
    borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, overflow: 'hidden',
  },
  couponLeft: { flex: 1, padding: theme.spacing.lg },
  couponCode: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md, color: theme.colors.primary, letterSpacing: 2 },
  couponDesc: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 4 },
  couponExpiry: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 4 },
  couponRight: {
    width: 72, backgroundColor: theme.colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', padding: 10,
  },
  couponDiscount: { fontFamily: theme.fonts.bold, fontSize: 20, color: theme.colors.primary },
  couponOff: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.xs, color: theme.colors.primary },
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { ...theme.typography.heading },
  emptySub: { ...theme.typography.bodyMuted, textAlign: 'center' },
});
