/**
 * Root index — redirect to the correct screen based on auth state.
 *
 * IMPORTANT: Only redirects once authState is resolved ('authenticated' or
 * 'unauthenticated'). While authState === 'loading', renders nothing so the
 * splash screen (held by _layout.tsx) stays visible without any login flicker.
 */
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useRestaurantStore } from '../src/services/restaurantStore';
import { NIVA_COLORS } from '@niva/shared';

export default function Index() {
  const { authState } = useRestaurantStore();

  if (authState === 'loading') {
    // _layout.tsx is showing the loading indicator + splash screen.
    // Return an empty view — do NOT redirect to login yet.
    return <View style={{ flex: 1, backgroundColor: NIVA_COLORS.black }} />;
  }

  return authState === 'authenticated'
    ? <Redirect href="/(tabs)/orders" />
    : <Redirect href="/(auth)/login" />;
}
