/**
 * Placeholder — a tidy "coming soon" panel used by Phase 2 tab stubs. Each of
 * these screens is implemented in a later phase (Home/Search → Phase 3-4,
 * Orders → Phase 7, Offers → Phase 8).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './ui/Screen';
import { theme } from '../theme';

export function Placeholder({
  icon,
  title,
  subtitle,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
}) {
  return (
    <Screen>
      <View style={s.center}>
        <View style={s.badge}>
          <Ionicons name={icon} size={34} color={theme.colors.primary} />
        </View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 76,
    height: 76,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: { ...theme.typography.heading, marginBottom: 6 },
  subtitle: { ...theme.typography.bodyMuted, textAlign: 'center', paddingHorizontal: 24 },
});
