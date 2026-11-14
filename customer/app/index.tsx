/**
 * Root index — always sends the customer to the home screen.
 *
 * Guests browse freely. Authentication is only required at checkout.
 * Returns null while session is restoring (overlay in _layout.tsx covers it).
 */
import { Redirect } from 'expo-router';
import { useCustomerStore } from '../src/services/customerStore';

export default function Index() {
  const { authState } = useCustomerStore();

  // Still restoring the session — the loading overlay is visible.
  if (authState === 'loading') return null;

  // All users (authenticated or guest) go to the home screen.
  return <Redirect href="/(tabs)" />;
}
