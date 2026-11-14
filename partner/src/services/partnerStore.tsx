import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { PartnerSession, Partner, AppVersionInfo } from '@niva/shared';

/**
 * Authentication lifecycle — mirrors the restaurant app so navigation never
 * mistakes a still-restoring session for a logged-out one:
 *   'loading'         → SecureStore read + token validation/refresh in progress
 *   'authenticated'   → valid session confirmed
 *   'unauthenticated' → no session, or explicit logout, or refresh genuinely failed
 *
 * A null `session` while authState === 'loading' must NEVER be treated as a
 * logout — that was the class of bug that logged partners out during startup.
 */
export type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface PartnerStore {
  session: PartnerSession | null;
  partner: Partner | null;
  setSession: (s: PartnerSession | null) => void;
  setPartner: (p: Partner) => void;
  authState: AuthState;
  setAuthState: (s: AuthState) => void;
  updateInfo: AppVersionInfo | null;
  setUpdateInfo: (info: AppVersionInfo) => void;
}

const PartnerContext = createContext<PartnerStore | null>(null);

export function PartnerProvider({ children }: { children: ReactNode }) {
  const [session, _setSession] = useState<PartnerSession | null>(null);
  const [authState, _setAuthState] = useState<AuthState>('loading');
  const [updateInfo, _setUpdateInfo] = useState<AppVersionInfo | null>(null);

  // Stable function references — these never change identity across renders,
  // so consumers that depend on them (useCallback, useEffect) don't re-fire.
  const setSession = useCallback((s: PartnerSession | null) => {
    _setSession(s);
  }, []);

  const setPartner = useCallback((p: Partner) => {
    _setSession(prev => prev ? { ...prev, partner: p } : null);
  }, []);

  const setAuthState = useCallback((s: AuthState) => {
    _setAuthState(s);
  }, []);

  const setUpdateInfo = useCallback((info: AppVersionInfo) => {
    _setUpdateInfo(info);
  }, []);

  const partner = session?.partner ?? null;

  // Stable context value — only changes when the data itself changes,
  // not on every render.
  const value = useMemo<PartnerStore>(
    () => ({ session, partner, setSession, setPartner, authState, setAuthState, updateInfo, setUpdateInfo }),
    [session, partner, setSession, setPartner, authState, setAuthState, updateInfo, setUpdateInfo]
  );

  return (
    <PartnerContext.Provider value={value}>
      {children}
    </PartnerContext.Provider>
  );
}

export function usePartnerStore(): PartnerStore {
  const ctx = useContext(PartnerContext);
  if (!ctx) throw new Error('usePartnerStore must be used inside PartnerProvider');
  return ctx;
}
