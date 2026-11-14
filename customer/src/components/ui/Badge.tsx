import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@niva/shared';
import { theme } from '../../theme';

interface Props {
  status: string;
  style?: object;
}

export function StatusBadge({ status, style }: Props) {
  const color = ORDER_STATUS_COLORS[status] ?? theme.colors.textMuted;
  const label = ORDER_STATUS_LABELS[status] ?? status;

  return (
    <View style={[s.badge, { backgroundColor: color + '20', borderColor: color + '40' }, style]}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={[s.text, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSize.xs,
  },
});
