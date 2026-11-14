/**
 * Partner Tab Navigator
 * Tabs: Available | Active | Scanner | Earnings | Profile
 */
import { Tabs, router } from 'expo-router';
import React, { useEffect } from 'react';
import { Text, Switch, View, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NIVA_COLORS } from '@niva/shared';
import { usePartnerStore } from '../../src/services/partnerStore';
import { partnerApi, savePartnerSession } from '@niva/shared';

// ─── Tab icons using Ionicons ─────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  available:  { active: 'cube',          inactive: 'cube-outline' },
  active:     { active: 'bicycle',       inactive: 'bicycle-outline' },
  scanner:    { active: 'qr-code',       inactive: 'qr-code-outline' },
  earnings:   { active: 'wallet',        inactive: 'wallet-outline' },
  profile:    { active: 'person',        inactive: 'person-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons = TAB_ICONS[name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  return (
    <Ionicons
      name={focused ? icons.active : icons.inactive}
      size={22}
      color={focused ? NIVA_COLORS.orange : NIVA_COLORS.gray400}
    />
  );
}

// ─── Online / Offline toggle ──────────────────────────────────────────────────

function OnlineToggle() {
  const { session, partner, setPartner } = usePartnerStore();
  const [toggling, setToggling] = React.useState(false);
  // Keep a ref so the async callback always reads the latest partner value,
  // avoiding the stale-closure bug that caused the toggle to revert.
  const partnerRef = React.useRef(partner);
  React.useEffect(() => { partnerRef.current = partner; }, [partner]);
  const isOnline = partner?.is_online ?? false;

  const handleToggle = async () => {
    if (!session || !partner || toggling) return;
    setToggling(true);
    const next = !isOnline;
    // Optimistic update — keep all existing fields, only flip is_online
    setPartner({ ...partner, is_online: next });
    try {
      const res = await partnerApi.setOnlineStatus(next, session.token);
      // Use partnerRef (latest) as the base so we never overwrite fields
      // that changed between press and response (avoids the stale-closure revert).
      const latest = partnerRef.current ?? partner;
      // The backend response is authoritative for is_online — reconcile to it.
      const confirmed = { ...latest, ...res.partner, is_online: res.partner.is_online };
      setPartner(confirmed);
      // Persist the backend-confirmed status so the on-disk cache matches the
      // authoritative value. This keeps a later cold-start restore consistent
      // and, together with the fail-safe-offline startup logic, guarantees a
      // stale cached ONLINE can never override a newer backend OFFLINE (Bug 3).
      savePartnerSession({ ...session, partner: confirmed }).catch(() => {});
    } catch {
      // Revert optimistic update on failure
      const latest = partnerRef.current ?? partner;
      setPartner({ ...latest, is_online: !next });
      Alert.alert('Error', 'Could not update online status. Please try again.');
    } finally {
      setToggling(false);
    }
  };

  return (
    <View style={styles.toggleRow}>
      <Text style={[
        styles.toggleLabel,
        { color: isOnline ? NIVA_COLORS.green : NIVA_COLORS.gray500 },
      ]}>
        {isOnline ? 'Online' : 'Offline'}
      </Text>
      {toggling ? (
        <ActivityIndicator color={NIVA_COLORS.orange} size="small" style={{ marginLeft: 8 }} />
      ) : (
        <Switch
          value={isOnline}
          onValueChange={handleToggle}
          trackColor={{ false: NIVA_COLORS.gray600, true: NIVA_COLORS.green }}
          thumbColor={NIVA_COLORS.white}
          style={{ marginLeft: 8, transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
        />
      )}
    </View>
  );
}

// ─── Tabs layout ──────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { session, partner, authState } = usePartnerStore();

  // Only redirect once auth is definitively resolved as unauthenticated
  // (explicit logout or a genuinely dead session). A null session while
  // authState is still 'loading' must NOT bounce the partner to login.
  useEffect(() => {
    if (authState === 'unauthenticated') router.replace('/(auth)/login');
  }, [authState]);

  if (!session) return null;

  // Show partner's first name in the available tab header
  const partnerFirstName = partner?.name
    ? partner.name.split(' ')[0]
    : 'Partner';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: NIVA_COLORS.orange,
        tabBarInactiveTintColor: NIVA_COLORS.gray400,
        tabBarStyle: {
          backgroundColor: NIVA_COLORS.white,
          borderTopWidth: 1,
          borderTopColor: NIVA_COLORS.gray100,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Montserrat-SemiBold' },
        headerStyle: { backgroundColor: NIVA_COLORS.black },
        headerTintColor: NIVA_COLORS.white,
        headerTitleStyle: { fontFamily: 'Montserrat-Bold', fontSize: 17 },
      }}
    >
      <Tabs.Screen
        name="available"
        options={{
          title: 'Available',
          // Show partner name in header, online toggle on the right
          headerTitle: partnerFirstName,
          headerRight: () => <OnlineToggle />,
          tabBarIcon: ({ focused }) => <TabIcon name="available" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: 'Active',
          headerTitle: 'Active Deliveries',
          tabBarIcon: ({ focused }) => <TabIcon name="active" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner',
          headerTitle: 'Scan QR Code',
          tabBarIcon: ({ focused }) => <TabIcon name="scanner" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          headerTitle: 'My Earnings',
          tabBarIcon: ({ focused }) => <TabIcon name="earnings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'My Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
  },
  toggleLabel: {
    fontSize: 13,
    fontFamily: 'Montserrat-SemiBold',
  },
});
