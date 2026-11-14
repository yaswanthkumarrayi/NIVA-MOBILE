/**
 * Restaurant App State Store — lightweight React context + useState.
 *
 * Exposes authState so that index.tsx can distinguish between:
 *   'loading'         → session restoration in progress, do not redirect yet
 *   'authenticated'   → valid session, show dashboard
 *   'unauthenticated' → no session, show login
 *
 * This prevents the "login flash" where session === null (still loading) was
 * incorrectly treated as an unauthenticated state.
 */
import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { RestaurantSession, AppVersionInfo } from '@niva/shared';

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface RestaurantStore {
  session:      RestaurantSession | null;
  setSession:   (s: RestaurantSession | null) => void;
  authState:    AuthState;
  setAuthState: (s: AuthState) => void;
  updateInfo:   AppVersionInfo | null;
  setUpdateInfo: (info: AppVersionInfo) => void;
}

const RestaurantContext = createContext<RestaurantStore | null>(null);

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const [session,    setSession]    = useState<RestaurantSession | null>(null);
  const [authState,  setAuthState]  = useState<AuthState>('loading');
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);

  return (
    <RestaurantContext.Provider value={{ session, setSession, authState, setAuthState, updateInfo, setUpdateInfo }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurantStore(): RestaurantStore {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurantStore must be used inside RestaurantProvider');
  return ctx;
}
