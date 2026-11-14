import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { CustomerSession, Customer } from '@niva/shared';

/**
 * Authentication lifecycle — mirrors the partner app so navigation never
 * mistakes a still-restoring session for a logged-out one:
 *   'loading'         → SecureStore read + token validation/refresh in progress
 *   'authenticated'   → valid session confirmed
 *   'unauthenticated' → no session, explicit logout, or refresh genuinely failed
 *
 * A null `session` while authState === 'loading' must NEVER be treated as a
 * logout — that is the class of bug that logs users out during startup.
 */
export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface CustomerStore {
  session: CustomerSession | null;
  customer: Customer | null;
  setSession: (s: CustomerSession | null) => void;
  setCustomer: (c: Customer) => void;
  authState: AuthState;
  setAuthState: (s: AuthState) => void;
}

const CustomerContext = createContext<CustomerStore | null>(null);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [session, _setSession] = useState<CustomerSession | null>(null);
  const [authState, _setAuthState] = useState<AuthState>('loading');

  // Stable function identities so consumers (useEffect/useCallback) don't re-fire.
  const setSession = useCallback((s: CustomerSession | null) => _setSession(s), []);
  const setCustomer = useCallback(
    (c: Customer) => _setSession((prev) => (prev ? { ...prev, customer: c } : prev)),
    []
  );
  const setAuthState = useCallback((s: AuthState) => _setAuthState(s), []);

  const customer = session?.customer ?? null;

  const value = useMemo<CustomerStore>(
    () => ({ session, customer, setSession, setCustomer, authState, setAuthState }),
    [session, customer, setSession, setCustomer, authState, setAuthState]
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomerStore(): CustomerStore {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomerStore must be used inside CustomerProvider');
  return ctx;
}
