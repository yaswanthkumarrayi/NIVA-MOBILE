/**
 * Button — primary action primitive for the NIVA customer app.
 * Variants: primary (orange), secondary (ink), outline. Handles loading state.
 */
import React from 'react';
import {
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { theme } from '../../theme';

type Variant = 'primary' | 'secondary' | 'outline';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[s.base, s[variant], isDisabled && s.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? theme.colors.primary : theme.colors.white} />
      ) : (
        <Text style={[s.label, variant === 'outline' ? s.labelOutline : s.labelFilled]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  base: {
    borderRadius: theme.radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.ink },
  outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.colors.primary },
  disabled: { opacity: 0.55 },
  label: { fontFamily: theme.fonts.bold, fontSize: theme.fontSize.md },
  labelFilled: { color: theme.colors.textOnPrimary },
  labelOutline: { color: theme.colors.primary },
});
