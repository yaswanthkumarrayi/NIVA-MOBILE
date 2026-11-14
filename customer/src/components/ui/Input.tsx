/**
 * Input — labeled text field primitive with focus + error styling.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { theme } from '../../theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.wrap}>
      {!!label && <Text style={s.label}>{label}</Text>}
      <TextInput
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          s.input,
          focused && s.inputFocused,
          !!error && s.inputError,
          style,
        ]}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: theme.spacing.lg },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fonts.regular,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
  },
  inputFocused: { borderColor: theme.colors.primary },
  inputError: { borderColor: theme.colors.error },
  error: {
    marginTop: 6,
    color: theme.colors.error,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fonts.medium,
  },
});
