import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../theme';

export function Divider({ style }: { style?: object }) {
  return <View style={[s.divider, style]} />;
}

const s = StyleSheet.create({
  divider: { height: 1, backgroundColor: theme.colors.border },
});
