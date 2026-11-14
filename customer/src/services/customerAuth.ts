/**
 * Customer authentication service.
 *
 * Thin orchestration layer over the shared Supabase auth + profile APIs. It is
 * the ONLY place in the customer app that turns Supabase credentials into a
 * persisted CustomerSession, so there is no duplicate auth logic scattered
 * across screens (one of the Phase 2 rules).
 *
 * Model (mirrors the web frontend, see NIVA-Frontend/src/pages/CustomerLogin.js
 * and utils/customerProfile.js):
 *   • Auth      → Supabase (email/password + Google OAuth), real user accounts.
 *   • Profile   → `customers` table via the protected backend endpoints, which
 *                 derive ownership from the JWT. Created on first login.
 *   • Sessions  → persisted manually in expo-secure-store; refreshed explicitly
 *                 (no Supabase auto-refresh), identical to the partner app.
 */
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import {
  customerAuthApi,
  customerApi,
  saveCustomerSession,
  loadCustomerSession,
  clearSession,
} from '@niva/shared';
import type { Customer, CustomerSession } from '@niva/shared';

WebBrowser.maybeCompleteAuthSession();

/** Profile completeness — matches the web frontend's isCustomerProfileComplete. */
export function isProfileComplete(c: Customer | null | undefined): boolean {
  if (!c) return false;
  const name = (c.name || '').trim();
  const email = (c.email || '').trim();
  const phone = String(c.phone || '').trim();
  const college = (c.college || '').trim();
  if (!name || !email) return false;
  if (!phone || phone.length !== 10) return false;
  if (!college || college === 'Select your university') return false;
  return true;
}

interface SupabaseAuthResult {
  session: { access_token: string; refresh_token: string } | null;
  user: { id: string; email?: string | null; user_metadata?: Record<string, any> | null } | null;
}

/**
 * Turn a Supabase auth result into a persisted CustomerSession, fetching the
 * customer profile and creating it on first login if it does not exist yet.
 * The returned profile may be incomplete — callers route to profile completion
 * using isProfileComplete().
 */
async function buildSession(auth: SupabaseAuthResult): Promise<CustomerSession> {
  const token = auth.session?.access_token;
  const refreshToken = auth.session?.refresh_token;
  const user = auth.user;
  if (!token || !user?.id) {
    throw new Error('No active session. If you just signed up, confirm your email first.');
  }

  let customer: Customer | null = null;

  // Try to read the existing profile. A 401 here is fatal (bad token), but a
  // null `data` simply means "no record yet" → create it.
  const res = await customerApi.getProfile(user.id, token);
  customer = res.data;

  if (!customer) {
    const email = user.email ?? '';
    const name = user.user_metadata?.full_name || (email ? email.split('@')[0] : 'User');
    const created = await customerApi.upsertProfile({ id: user.id, name, email }, token);
    customer = created.data ?? { id: user.id, name, email };
  }

  const session: CustomerSession = {
    token,
    refreshToken: refreshToken ?? undefined,
    customer,
    role: 'customer',
  };
  await saveCustomerSession(session);
  return session;
}

/** Email + password sign-in. Throws a user-friendly Error on failure. */
export async function signInWithEmail(email: string, password: string): Promise<CustomerSession> {
  const data = await customerAuthApi.signIn(email, password);
  return buildSession(data as SupabaseAuthResult);
}

export interface RegisterResult {
  session: CustomerSession | null;
  /** True when Supabase requires email confirmation before a session exists. */
  needsEmailConfirmation: boolean;
}

/**
 * Email + password registration.
 * When the Supabase project has email confirmation ON, signUp returns no
 * session — we report needsEmailConfirmation so the UI tells the user to check
 * their inbox, and the profile is created on first login instead.
 */
export async function registerWithEmail(email: string, password: string): Promise<RegisterResult> {
  const data = (await customerAuthApi.signUp(email, password)) as SupabaseAuthResult;
  if (!data.session?.access_token) {
    return { session: null, needsEmailConfirmation: true };
  }
  const session = await buildSession(data);
  return { session, needsEmailConfirmation: false };
}

/**
 * Google OAuth via an in-app browser + deep-link callback.
 *
 * REQUIRES (Supabase dashboard → Authentication → URL Configuration):
 *   • the redirect URL printed below (niva://auth-callback in a release build)
 *     added to the allow-list, and
 *   • the Google provider enabled (already configured for the web app).
 *
 * Uses the implicit flow (set on customerSupabaseClient), so the tokens arrive
 * in the callback URL fragment and we hand them straight to setSession.
 */
export async function signInWithGoogle(): Promise<CustomerSession> {
  // In a standalone/release build this resolves to `niva://auth-callback`.
  // This EXACT string must be in the Supabase dashboard allow-list
  // (Authentication → URL Configuration → Redirect URLs). If it is not,
  // Supabase ignores redirectTo and falls back to the Site URL (the website) —
  // which is the "Google sign-in opens the website" bug.
  const redirectTo = Linking.createURL('auth-callback');
  if (__DEV__) console.log('[GoogleAuth] redirectTo =', redirectTo);

  const authUrl = await customerAuthApi.getOAuthUrl(redirectTo);

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== 'success' || !result.url) {
    // 'cancel'/'dismiss' also lands here when Supabase redirected to the website
    // (allow-list miss) and the user closed the tab without returning to the app.
    throw new Error('Google sign-in was cancelled.');
  }

  const { accessToken, refreshToken, code } = parseAuthCallback(result.url);

  if (accessToken && refreshToken) {
    const data = (await customerAuthApi.setSession(accessToken, refreshToken)) as SupabaseAuthResult;
    return buildSession(data);
  }
  if (code) {
    const data = (await customerAuthApi.exchangeCodeForSession(code)) as SupabaseAuthResult;
    return buildSession(data);
  }
  // Returned to the app but with no tokens/code — almost always a redirect-URL
  // allow-list miss in the Supabase dashboard.
  throw new Error(
    'Google sign-in did not return a session. Ensure "niva://auth-callback" is added to the Supabase redirect allow-list.',
  );
}

/**
 * Parse tokens/code from an OAuth redirect URL (fragment or query).
 * Parsed by hand rather than via URLSearchParams — React Native's polyfill is
 * incomplete and `.get()` is not reliable across versions.
 */
function parseAuthCallback(url: string): {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
} {
  const params: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  const collect = (segment: string) => {
    for (const pair of segment.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const val = eq === -1 ? '' : pair.slice(eq + 1);
      try {
        params[decodeURIComponent(key)] = decodeURIComponent(val);
      } catch {
        params[key] = val;
      }
    }
  };

  // Fragment (implicit flow): niva://auth-callback#access_token=...&refresh_token=...
  if (hashIndex !== -1) collect(url.slice(hashIndex + 1));
  // Query (PKCE fallback): niva://auth-callback?code=...
  if (queryIndex !== -1) {
    const end = hashIndex === -1 ? url.length : hashIndex;
    collect(url.slice(queryIndex + 1, end));
  }

  return {
    accessToken: params['access_token'] || undefined,
    refreshToken: params['refresh_token'] || undefined,
    code: params['code'] || undefined,
  };
}

/**
 * Restore and validate a persisted session at cold start.
 *
 * Strategy (mirrors the partner app):
 *   a) No stored session         → null (unauthenticated).
 *   b) getProfile succeeds        → authenticated (refresh the cached profile).
 *   c) getProfile 401             → access token expired AND the API layer's
 *      transparent refresh also failed → refresh token dead → clear → null.
 *   d) Non-401 (network/5xx)      → keep the cached session optimistically so a
 *      temporary connectivity loss never logs the customer out.
 */
export async function restoreSession(): Promise<CustomerSession | null> {
  const stored = await loadCustomerSession();
  if (!stored) return null;

  try {
    const res = await customerApi.getProfile(stored.customer.id, stored.token);
    // getProfile may have triggered a transparent refresh — re-read the latest
    // persisted tokens so we keep the freshest access token.
    const latest = (await loadCustomerSession()) ?? stored;
    const session: CustomerSession = {
      ...latest,
      customer: res.data ?? latest.customer,
    };
    await saveCustomerSession(session).catch(() => {});
    return session;
  } catch (e: any) {
    if (e?.status === 401) {
      await clearSession();
      return null;
    }
    // Temporary failure — stay logged in with the cached session.
    return stored;
  }
}

/** Sign out: best-effort Supabase sign-out + local secure-store clear. */
export async function logout(): Promise<void> {
  await customerAuthApi.signOut();
  await clearSession();
}
