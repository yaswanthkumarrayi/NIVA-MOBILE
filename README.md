# NIVA Mobile Apps

Two separate Android companion apps for the existing NIVA platform.

| App | Package | Target |
|-----|---------|--------|
| **NIVA Restaurant** | `in.niva2026.restaurant` | Restaurant owners/staff |
| **NIVA Partner** | `in.niva2026.partner` | Delivery partners |

> The existing NIVA websites and web panels continue to work unchanged.
> The mobile apps consume the **same backend, same database, same accounts**.

---

## Directory Structure

```
mobile/
├── README.md               ← This file
├── shared/                 ← Shared TypeScript types, API client, services
│   └── src/
│       ├── types/          ← Order, Partner, Restaurant interfaces
│       ├── constants/      ← API URLs, colors, status labels
│       └── services/       ← api.ts, secureStorage.ts, alertManager.ts, realtimeService.ts
├── restaurant/             ← NIVA Restaurant app (Expo)
│   ├── app.json
│   ├── app/
│   │   ├── (auth)/login.tsx
│   │   ├── (tabs)/orders.tsx
│   │   ├── (tabs)/earnings.tsx
│   │   ├── (tabs)/menu.tsx
│   │   ├── (tabs)/notifications.tsx
│   │   ├── (tabs)/profile.tsx
│   │   └── order/[id].tsx
│   ├── plugins/withNivaSiren.js   ← Native Android siren config plugin
│   ├── assets/NIVA_Notification.mp3
│   └── src/
│       ├── services/       ← restaurantStore, fcmService, notificationHandler
│       ├── components/     ← OrderCard, StatusBadge, OrderQrDisplay, UpdateBanner
│       └── hooks/          ← useNotificationHistory
└── partner/                ← NIVA Partner app (Expo)
    ├── app.json
    ├── app/
    │   ├── (auth)/login.tsx
    │   ├── (tabs)/available.tsx
    │   ├── (tabs)/active.tsx
    │   ├── (tabs)/scanner.tsx   ← QR scanner
    │   ├── (tabs)/earnings.tsx
    │   ├── (tabs)/profile.tsx
    │   └── order/[id].tsx
    ├── plugins/withNivaSiren.js
    ├── assets/NIVA_Notification.mp3
    └── src/
        ├── services/       ← partnerStore, fcmService, notificationHandler
        ├── components/     ← PartnerOrderCard
        └── hooks/          ← useNotificationHistory
```

---

## Prerequisites

Install the following tools before proceeding:

```bash
# Node.js 18+
node --version

# Expo CLI
npm install -g expo-cli eas-cli

# Android Studio (for local builds)
# https://developer.android.com/studio

# Java 17 (required for Gradle)
java --version
```

---

## Installing Dependencies

### Restaurant App
```bash
cd mobile/restaurant
npm install
```

### Partner App
```bash
cd mobile/partner
npm install
```

---

## Environment Configuration

Both apps use `.env` files with `EXPO_PUBLIC_` prefix (public, non-secret values only).

```bash
# mobile/restaurant/.env  or  mobile/partner/.env
EXPO_PUBLIC_API_URL=https://niva-backend.vercel.app
EXPO_PUBLIC_SUPABASE_URL=https://nznofcpwjlidmlbkvwtg.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
EXPO_PUBLIC_APP_TYPE=restaurant
EXPO_PUBLIC_DOWNLOAD_BASE_URL=https://www.niva2026.in/download
```

> **Never put backend secrets, service-role keys, FCM server keys, or Razorpay secrets in the mobile app.**

---

## Firebase / FCM Setup

### Why Firebase is needed
Android push notifications require Firebase Cloud Messaging.
We use the **Expo Push API** as an intermediary, which means:
- No FCM server key needed in the app
- No FCM server key needed in the backend (we use Expo's push API)
- Only `google-services.json` is needed in each app for the Android build

### Steps

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create **two projects** (or one project with two apps):
   - `niva-restaurant` (Android package: `in.niva2026.restaurant`)
   - `niva-partner` (Android package: `in.niva2026.partner`)
3. Download `google-services.json` for each
4. Place them:
   ```
   mobile/restaurant/google-services.json
   mobile/partner/google-services.json
   ```
5. **Do NOT commit `google-services.json` to git** (add to `.gitignore`)

### Alternative: Single Firebase project
You can add both Android apps to one Firebase project. Download a separate `google-services.json` for each package name.

---

## Running Development Builds

Expo Go **cannot** support the native Android siren (foreground service). You must use a Development Build.

### Restaurant App

```bash
cd mobile/restaurant

# 1. Install native dependencies and generate android/ directory
npx expo prebuild --platform android

# 2. Build and install on connected device/emulator
npx expo run:android

# Or build the development APK
eas build --platform android --profile local-apk
```

### Partner App

```bash
cd mobile/partner
npx expo prebuild --platform android
npx expo run:android
```

---

## Building the APK

### Method 1: EAS Build (Recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo account
eas login

# Configure EAS project (first time only)
eas build:configure

# Build restaurant APK
cd mobile/restaurant
eas build --platform android --profile preview

# Build partner APK
cd mobile/partner
eas build --platform android --profile preview
```

The APK files will be downloadable from the Expo build dashboard.

### Method 2: Local Gradle Build

After running `expo prebuild`:

```bash
cd mobile/restaurant/android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

---

## APK Distribution

Host the APKs on your NIVA website:

```
https://www.niva2026.in/download/NIVA-Restaurant.apk
https://www.niva2026.in/download/NIVA-Partner.apk
```

On the download page, include installation instructions since users need to enable "Install from Unknown Sources" on their Android device:
1. Settings → Security → Unknown Sources → Enable
2. Download the APK
3. Open the downloaded file and install

---

## NIVA_Notification.mp3 — How It Works

**Source file**: `NIVA-Frontend/public/NIVA_Notification.mp3`

**How it gets into the APK**:
1. The `withNivaSiren.js` Expo config plugin runs during `expo prebuild`
2. It copies the MP3 to `android/app/src/main/res/raw/niva_notification.mp3`
3. The `NivaSirenService.kt` Kotlin class references it via `resources.getIdentifier("niva_notification", "raw", packageName)`
4. The file is embedded in the APK — no internet needed to play it

**Do NOT rename** the file. Android resource names must be lowercase with no hyphens.

---

## Native Android Siren — How It Works

The siren is a native Android `ForegroundService` written in Kotlin.

### Files generated by the config plugin (after `expo prebuild`):

**Restaurant app:**
```
android/app/src/main/java/in/niva2026/restaurant/
├── NivaSirenService.kt    ← Foreground service, plays looping MP3
├── NivaSirenModule.kt     ← React Native bridge (startSiren, stopSiren, stopAllSirens)
└── NivaSirenPackage.kt    ← Registers the native module with RN
```

**Partner app:** Same structure under `in/niva2026/partner/`

### JavaScript interface (`alertManager.ts`):
```typescript
alertManager.startAlert(orderId, orderNumber, 'restaurant_new_order')
// → calls NativeModules.NivaSirenModule.startSiren(orderId)

alertManager.stopAlert(orderId, 'accepted')
// → calls NativeModules.NivaSirenModule.stopSiren(orderId)

alertManager.stopAllAlerts('logout')
// → calls NativeModules.NivaSirenModule.stopAllSirens()
```

### Siren behavior:
- Starts when a new order FCM notification arrives (via `notificationHandler.ts`)
- Loops `NIVA_Notification.mp3` continuously
- Stops immediately on `Accept Order` / `Take Order` tap
- Auto-stops after 60 seconds (timer in `alertManager.ts`)
- Stops when another device accepts the same order (via realtime sync)
- Stops on logout

### Multiple orders:
Each order has its own `orderId` in the service's `activeOrderIds` set.
Two simultaneous orders → two separate siren tracking IDs → each stops independently.

---

## Required Android Permissions

Declared in `app.json` and written to `AndroidManifest.xml`:

| Permission | Required For |
|-----------|-------------|
| `FOREGROUND_SERVICE` | Native siren service |
| `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Playing audio in foreground service (Android 14+) |
| `POST_NOTIFICATIONS` | Push notifications (Android 13+) |
| `VIBRATE` | Vibration on notification |
| `WAKE_LOCK` | Keep device awake for alerts |
| `RECEIVE_BOOT_COMPLETED` | (reserved for future boot persistence) |
| `CAMERA` | Partner app QR scanner |
| `INTERNET` | All API calls |
| `ACCESS_NETWORK_STATE` | Offline detection |

---

## Known Android Limitations

1. **Force Stop**: If the user Force Stops the app, no push notifications or background services will run until the user manually opens the app again. This is an Android OS limitation. The app cannot override this.

2. **Battery Optimization (OEM)**: Some manufacturers (Xiaomi, Samsung, Oppo) aggressively kill background processes. Users may need to add the app to the battery optimization whitelist. The Profile screen includes a note about this.

3. **DND Mode**: When Do Not Disturb is enabled, notification sounds are silenced by the OS. The app does not attempt to bypass DND.

4. **Android 8.0+**: Notification channels must be created before sending notifications. The siren service creates the `niva_orders` channel on first launch.

5. **Android 13+**: `POST_NOTIFICATIONS` permission must be explicitly requested at runtime. The app does this in `_layout.tsx` on first launch.

---

## App Versioning

### Incrementing versions for a new APK release:

**`mobile/restaurant/app.json`:**
```json
"version": "1.1.0",
"android": {
  "versionCode": 2
}
```

**`mobile/partner/app.json`:** Same

**`NIVA-Backend/routes/mobile.js`:**
Update `APP_VERSIONS` to reflect the new version:
```js
const APP_VERSIONS = {
  restaurant: {
    currentVersion: '1.1.0',
    minVersion: '1.0.0',        // minimum supported version
    downloadUrl: 'https://www.niva2026.in/download/NIVA-Restaurant.apk',
    updateRequired: false,       // set true to force update
    updateAvailable: true,
  },
  ...
};
```

---

## Backend Changes Made

### New files:
- `NIVA-Backend/lib/fcmService.js` — FCM push notification dispatch
- `NIVA-Backend/routes/mobile.js` — `/api/mobile/*` endpoints
- `NIVA-Backend/migrations/013_mobile_device_tokens.sql` — device_tokens table

### Modified files:
- `NIVA-Backend/index.js` — imports and mounts `mobileRouter`
- `NIVA-Backend/lib/notificationService.js` — adds FCM push calls alongside existing email

### Migration to run:
```sql
-- Run in Supabase SQL Editor:
-- NIVA-Backend/migrations/013_mobile_device_tokens.sql
```

### Backward compatibility:
- All existing API routes unchanged
- Email notifications continue working exactly as before
- FCM push is additive — if the `device_tokens` table doesn't exist yet, the push silently fails
- Order creation flow is not affected if push fails

---

## Testing Notifications

### Test push token registration:
```bash
curl -X POST https://niva-backend.vercel.app/api/mobile/register-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[xxxxxx]","role":"restaurant_owner","restaurantId":"YOUR_RESTAURANT_ID","platform":"android"}'
```

### Test app version:
```bash
curl https://niva-backend.vercel.app/api/mobile/app-version?app=restaurant
```

### Test push notification (Expo Push API):
```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{"to":"ExponentPushToken[xxxxxx]","title":"Test","body":"Hello from NIVA"}'
```

---

## Realtime Synchronization

Both apps subscribe to Supabase Realtime on the `orders` table:
- `INSERT` → refresh order list, start siren for eligible new orders
- `UPDATE` → refresh orders, stop siren if order was claimed by another device

The backend (Postgres row-level locking) is the authoritative source of truth.
The frontend never trusts local state alone for "can I accept this order?" — it always relies on the backend response.

---

## Race Condition Protection

The backend already implements atomic order claiming:

**Partner order acceptance** (`/api/partner/orders/:orderId/accept`):
```sql
UPDATE orders
SET assigned_partner_id = ?, status = 'taken'
WHERE id = ?
  AND assigned_partner_id IS NULL  -- only succeeds if unclaimed
```

If two partners accept simultaneously, only the first `UPDATE` that matches `assigned_partner_id IS NULL` succeeds. The second gets `PGRST116` (zero rows updated) → returns `409 ORDER_ALREADY_CLAIMED`.

**Restaurant acceptance** (`PUT /api/restaurant-portal/orders/:id/status`):
Status transitions are validated against the current DB state. If two devices race, the second gets `409 Conflict` because the status already changed.

---

## Deep Linking

| App | Scheme | Example |
|-----|--------|---------|
| NIVA Restaurant | `niva-restaurant://` | `niva-restaurant://order/MR123` |
| NIVA Partner | `niva-partner://` | `niva-partner://order/D045` |

Notification payloads include `orderId` in the `data` field:
```json
{
  "type": "restaurant_new_order",
  "orderId": "uuid-here",
  "orderNumber": "MR123",
  "restaurantId": "uuid-here"
}
```

When a notification is tapped, `notificationHandler.ts` navigates to `/order/${orderId}`.

---

## Frequently Asked Questions

**Q: Do I need two Firebase projects?**
A: You can use one Firebase project with two Android apps, or two separate projects. Each needs a `google-services.json` placed in the respective app directory.

**Q: Can a restaurant employee log into the partner app by mistake?**
A: No. The partner login validates the `role` claim in the Supabase JWT. A `restaurant_owner` JWT will fail the partner role check and show an error.

**Q: What happens if the internet disconnects mid-delivery?**
A: The app shows a connection error and does not submit actions. When connectivity returns, the app re-fetches the authoritative backend state before allowing any actions.

**Q: Why not use Expo Go?**
A: Expo Go cannot run custom native modules (the foreground service for the looping siren). A development build with `expo-dev-client` or a prebuild is required.

**Q: Where is the FCM server key stored?**
A: Nowhere in the app. The backend uses Expo's push API (`exp.host/--/api/v2/push/send`) which handles FCM. No FCM server credentials are needed in the backend or app.
