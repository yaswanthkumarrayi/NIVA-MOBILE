/**
 * NIVA — Profile Screen
 * Customer profile, settings, and logout.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { theme } from '../../src/theme';
import { useCustomerStore } from '../../src/services/customerStore';
import { logout } from '../../src/services/customerAuth';
import { EmptyState } from '../../src/components/ui/EmptyState';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function ProfileRow({
  icon, label, value, onPress, danger,
}: { icon: IconName; label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress} disabled={!onPress}>
      <View style={[s.rowIcon, danger && s.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? theme.colors.error : theme.colors.primary} />
      </View>
      <View style={s.rowContent}>
        <Text style={[s.rowLabel, danger && s.rowLabelDanger]}>{label}</Text>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
      </View>
      {onPress && !danger && (
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { session, setSession, setAuthState, customer } = useCustomerStore();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!session || !customer) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.header}><Text style={s.headerTitle}>Profile</Text></View>
        <EmptyState
          icon="person-outline"
          title="Sign in to view your profile"
          subtitle="Manage your account, addresses and order history."
          action={{ label: 'Sign In', onPress: () => router.push('/(auth)/login') }}
        />
      </SafeAreaView>
    );
  }

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
          } finally {
            setSession(null);
            setAuthState('unauthenticated');
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const initials = (customer.name || 'U')
    .split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>Profile</Text></View>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + Name */}
        <View style={s.avatarSection}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.name}>{customer.name}</Text>
          <Text style={s.email}>{customer.email}</Text>
          {customer.phone ? <Text style={s.phone}>{customer.phone}</Text> : null}
        </View>

        {/* Account section */}
        <Text style={s.sectionLabel}>Account</Text>
        <View style={s.card}>
          <ProfileRow
            icon="person-outline"
            label="Edit Profile"
            value="Name, phone, college"
            onPress={() => router.push('/edit-profile')}
          />
          <View style={s.sep} />
          <ProfileRow
            icon="location-outline"
            label="Saved Addresses"
            value="Hostels and blocks"
            onPress={() => router.push('/addresses')}
          />
          <View style={s.sep} />
          <ProfileRow
            icon="receipt-outline"
            label="Order History"
            onPress={() => router.push('/(tabs)/orders')}
          />
        </View>

        {/* Rewards section */}
        <Text style={s.sectionLabel}>Rewards</Text>
        <View style={s.card}>
          <ProfileRow
            icon="flame-outline"
            label="NIVA Streak"
            onPress={() => router.push('/(tabs)/offers')}
          />
          <View style={s.sep} />
          <ProfileRow
            icon="wallet-outline"
            label="NIVA Wallet"
            onPress={() => router.push('/(tabs)/offers')}
          />
        </View>

        {/* Support section */}
        <Text style={s.sectionLabel}>Support</Text>
        <View style={s.card}>
          <ProfileRow icon="help-circle-outline" label="Help & Support" />
          <View style={s.sep} />
          <ProfileRow icon="document-text-outline" label="Terms & Privacy" />
        </View>

        {/* Logout */}
        <View style={[s.card, { marginTop: 8 }]}>
          <ProfileRow
            icon="log-out-outline"
            label={loggingOut ? 'Signing out…' : 'Sign Out'}
            onPress={loggingOut ? undefined : handleLogout}
            danger
          />
        </View>

        <Text style={s.versionText}>NIVA v1.0.0</Text>
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: 14 },
  headerTitle: { fontFamily: theme.fonts.bold, fontSize: 22, color: theme.colors.textPrimary },
  scroll: { paddingHorizontal: theme.spacing.lg },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontFamily: theme.fonts.bold, fontSize: 26, color: '#fff' },
  name: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.xl, color: theme.colors.textPrimary },
  email: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textSecondary, marginTop: 4 },
  phone: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 2 },
  sectionLabel: {
    fontFamily: theme.fonts.semibold, fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8, paddingHorizontal: 4,
  },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, ...theme.shadows.card },
  sep: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: theme.spacing.lg, gap: 14,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: theme.colors.errorSoft },
  rowContent: { flex: 1 },
  rowLabel: { fontFamily: theme.fonts.medium, fontSize: theme.fontSize.md, color: theme.colors.textPrimary },
  rowLabelDanger: { color: theme.colors.error },
  rowValue: { fontFamily: theme.fonts.regular, fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 2 },
  versionText: {
    fontFamily: theme.fonts.regular, fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted, textAlign: 'center', marginTop: 20, marginBottom: 10,
  },
});
