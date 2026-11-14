# NIVA Customer App

React Native (Expo SDK 53) Android app for NIVA customers. Built to match the
existing `mobile/partner` and `mobile/restaurant` apps and to reuse the
`@niva/shared` library — same fetch wrapper, 401-refresh + 429-retry logic, and
manual `expo-secure-store` session management. No Zustand / React Query /
NativeWind: styling is React Native `StyleSheet`, state is React context.

## Architecture

- **Auth**: Supabase email/password + Google OAuth (real customer accounts, the
  same ones used on the NIVA website). Session tokens are persisted manually in
  `expo-secure-store` and refreshed explicitly — Supabase auto-refresh is off.
- **Profile**: the `customers` table via the protected backend endpoints
  (`/api/customers/*`), which derive ownership from the JWT.
- **Data layer (later phases)**: restaurants / menus / coupons are read
  **directly from Supabase** (RLS + Realtime), matching the web frontend. The
  backend is used for payments, orders, addresses, wallet and streak.

```
app/                      Expo Router (file-based)
  _layout.tsx             Root: session restore + 401 refresher + fonts + splash
  index.tsx               Auth-state redirect
  (auth)/                 login, register
  (tabs)/                 Home | Search | Orders | Offers | Profile
src/
  components/             ErrorBoundary, Placeholder, ui/ (Button, Input, Card, Screen, GoogleButton)
  services/               customerStore (auth context), customerAuth (auth orchestration)
  theme/                  Design system (colors, spacing, radii, typography, shadows)
```

Shared additions live in `../shared/src` (customer types, `customerApi`,
`customerAuthApi`, `customerSupabaseClient`, and secure-store helpers).

## Setup

```bash
# from mobile/customer
cp .env.example .env     # fill in EXPO_PUBLIC_* values (anon key only)
npm install
npm start                # Metro on port 8083 (partner=8082, restaurant=8081)
```

Run on Android:

```bash
npm run android          # dev client / emulator or device
npm run build:apk        # EAS preview APK
```

## Google OAuth configuration (required for the Google button)

Native Google sign-in opens an in-app browser and returns to a deep link. For
it to work, in the Supabase dashboard → **Authentication → URL Configuration →
Redirect URLs**, add the app's redirect URL:

- Release build: `niva://auth-callback`
- Expo dev: the `exp://…/--/auth-callback` URL printed by `Linking.createURL`

The Google provider itself is already enabled for the web app. Email/password
login needs no extra configuration.

## Scope

This is **Phase 2** (foundation) only: project setup, shared integration, auth,
session persistence, protected navigation, bottom tabs, and the design system.
Home / Search / Orders / Offers are intentionally placeholders — they are built
in later phases.
