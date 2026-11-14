/**
 * Restaurant Tab Navigator
 * Tabs: Orders | Earnings | Menu | Notifications | Profile
 *
 * Restaurant availability (Open/Closed) toggle lives in the header of the
 * Orders tab, matching the NIVA web restaurant panel.
 */
import { Tabs, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, Text, Switch, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { NIVA_COLORS } from '@niva/shared';
import { restaurantApi } from '@niva/shared';
import { useRestaurantStore, type AuthState } from '../../src/services/restaurantStore';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  // Clean Unicode icons — no emoji, professional appearance
  const icons: Record<string, string> = {
    orders: '≡',      // list
    earnings: '₹',    // rupee
    menu: '▤',        // menu/grid
    notifications: '⏰', // bell-like
    profile: '◉',     // person-like
  };
  const color = focused ? NIVA_COLORS.orange : NIVA_COLORS.gray400;
  return (
    <Text style={{ fontSize: focused ? 20 : 18, color, fontWeight: '600' }}>
      {icons[name] ?? '●'}
    </Text>
  );
}

/**
 * Restaurant Open/Closed availability toggle for the Orders tab header.
 */
function AvailabilityToggle() {
  const { session } = useRestaurantStore();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!session) return;
    restaurantApi.getRestaurant(session.token)
      .then((res) => setAvailable(res.restaurant.restaurant_available ?? true))
      .catch(() => setAvailable(true));
  }, [session]);

  const handleToggle = async () => {
    if (!session || toggling || available === null) return;
    setToggling(true);
    const next = !available;
    setAvailable(next);
    try {
      await restaurantApi.setAvailability(next, session.token);
    } catch {
      setAvailable(!next);
      Alert.alert('Error', 'Failed to update availability.');
    } finally {
      setToggling(false);
    }
  };

  if (available === null) {
    return <ActivityIndicator color={NIVA_COLORS.orange} size="small" style={{ marginRight: 14 }} />;
  }

  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: available ? NIVA_COLORS.green : NIVA_COLORS.gray400 }]}>
        {available ? '● Open' : '○ Closed'}
      </Text>
      {toggling ? (
        <ActivityIndicator color={NIVA_COLORS.orange} size="small" style={{ marginLeft: 8 }} />
      ) : (
        <Switch
          value={available}
          onValueChange={handleToggle}
          trackColor={{ false: NIVA_COLORS.gray600, true: NIVA_COLORS.green }}
          thumbColor={NIVA_COLORS.white}
          style={{ marginLeft: 8, transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
        />
      )}
    </View>
  );
}

export default function TabsLayout() {
  const { session, authState } = useRestaurantStore();
  const restaurantName = session?.restaurant.name ?? 'NIVA Restaurant';

  useEffect(() => {
    // Only redirect to login if auth is fully resolved as unauthenticated.
    // Never redirect while state is 'loading' — that would cause a login flash.
    if (authState === 'unauthenticated') router.replace('/(auth)/login');
  }, [authState]);

  if (authState !== 'authenticated') return null;

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
        headerTitleStyle: { fontFamily: 'Montserrat-Bold', fontSize: 18 },
      }}
    >
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          headerTitle: restaurantName,
          headerRight: () => <AvailabilityToggle />,
          tabBarIcon: ({ focused }) => <TabIcon name="orders" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          headerTitle: 'Earnings',
          tabBarIcon: ({ focused }) => <TabIcon name="earnings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          headerTitle: 'Menu',
          tabBarIcon: ({ focused }) => <TabIcon name="menu" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          headerTitle: 'Notifications',
          tabBarIcon: ({ focused }) => <TabIcon name="notifications" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  toggleLabel: { fontSize: 12, fontFamily: 'Montserrat-SemiBold' },
});
