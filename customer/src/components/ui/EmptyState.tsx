import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { Button } from './Button';

interface Props {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon = 'alert-circle-outline', title, subtitle, action }: Props) {
  return (
    <View style={s.container}>
      <Ionicons name={icon} size={52} color={theme.colors.textMuted} />
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      {action ? (
        <View style={s.btn}>
          <Button label={action.label} onPress={action.onPress} variant="outline" />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { ...theme.typography.subheading, textAlign: 'center' },
  subtitle: { ...theme.typography.bodyMuted, textAlign: 'center' },
  btn: { marginTop: 8 },
});
