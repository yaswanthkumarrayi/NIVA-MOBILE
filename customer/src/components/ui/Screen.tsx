/**
 * Screen — safe-area aware page wrapper with the warm NIVA background.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, ScrollView } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { theme } from '../../theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll, padded = true, edges = ['top', 'bottom'], style }: Props) {
  const inner = padded ? [s.padded, style] : style;
  return (
    <SafeAreaView style={s.safe} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[s.scrollContent, inner]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.flex, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  padded: { padding: theme.spacing.xl },
});
