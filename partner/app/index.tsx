/**
 * Root index — redirect based on the resolved auth state.
 *
 * While authState === 'loading', render an empty view so the splash / loading
 * indicator held by _layout.tsx stays up. NEVER redirect to login during
 * loading — a still-restoring session is not a logged-out session.
 */
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { usePartnerStore } from '../src/services/partnerStore';
import { NIVA_COLORS } from '@niva/shared';

export default function Index() {
  const { authState } = usePartnerStore();

  if (authState === 'loading') {
    return <View style={{ flex: 1, backgroundColor: NIVA_COLORS.black }} />;
  }

  return authState === 'authenticated'
    ? <Redirect href="/(tabs)/available" />
    : <Redirect href="/(auth)/login" />;
}
