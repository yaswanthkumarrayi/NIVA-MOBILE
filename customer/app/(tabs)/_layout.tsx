/**
 * Customer Tab Navigator
 * Tabs: Home | Search | Orders | Offers | Profile
 *
 * GUEST BROWSING: Unauthenticated users can access Home, Search, Offers.
 * Orders and Profile prompt login only when tapped while unauthenticated.
 * Cart and Checkout gate authentication at the point of order placement.
 */
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IconName; inactive: IconName }> = {
  index:   { active: 'home',        inactive: 'home-outline' },
  search:  { active: 'search',      inactive: 'search-outline' },
  orders:  { active: 'receipt',     inactive: 'receipt-outline' },
  offers:  { active: 'pricetags',   inactive: 'pricetags-outline' },
  profile: { active: 'person',      inactive: 'person-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons = TAB_ICONS[name] ?? { active: 'ellipse', inactive: 'ellipse-outline' };
  return (
    <Ionicons
      name={focused ? icons.active : icons.inactive}
      size={22}
      color={focused ? theme.colors.primary : theme.colors.textMuted}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: theme.fonts.semibold },
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Home',    tabBarIcon: ({ focused }) => <TabIcon name="index"   focused={focused} /> }} />
      <Tabs.Screen name="search"  options={{ title: 'Search',  tabBarIcon: ({ focused }) => <TabIcon name="search"  focused={focused} /> }} />
      <Tabs.Screen name="orders"  options={{ title: 'Orders',  tabBarIcon: ({ focused }) => <TabIcon name="orders"  focused={focused} /> }} />
      <Tabs.Screen name="offers"  options={{ title: 'Offers',  tabBarIcon: ({ focused }) => <TabIcon name="offers"  focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabIcon name="profile" focused={focused} /> }} />
    </Tabs>
  );
}
