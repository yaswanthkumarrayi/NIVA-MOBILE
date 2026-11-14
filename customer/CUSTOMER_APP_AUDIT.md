# NIVA Customer App — Functionality Audit & Remediation

_Investigation of `mobile/customer` traced against the production website
(`NIVA-Frontend`) and backend (`NIVA-Backend`). Every item below was verified by
reading the actual code and backend routes, not by assuming a screen works
because it renders._

## Executive summary

The customer app is **substantially more complete than the brief described.**
The screens, navigation, icons, search, cart, and profile are all genuinely
implemented and wired to real backend endpoints — they are **not** placeholders
with dead buttons. The reported "nothing works" experience is consistent with
two things:

1. **A stale build.** `run-android.log` shows the last run never reached a
   device (`Could not find device with name: emulator-5554`) and `metro.log`
   shows Metro failing to start its transformer. The APK under test predates the
   current source.
2. **Two real, code-level blockers** that do break specific flows:
   - **Google sign-in → website:** the Supabase redirect allow-list is missing
     `niva://auth-callback` (external config, not a code bug).
   - **Checkout/order placement was broken** against the backend contract
     (missing `deliveryDate`, wrong response parsing, wrong COD endpoint, wrong
     coupon path). **Fixed in this pass.**

The app flow **already opens to Home** (guests browse freely; auth is only
required at checkout) — acceptance criteria #1–#3 were already satisfied in code.

---

## What was fixed in this pass

| File | Problem (root cause) | Fix |
|---|---|---|
| `src/services/nivaApi.ts` | `create-order` response was parsed as `res.razorpayOrderId/amount`, but the backend returns `res.order.id` / `res.order.amount` (paise) / `res.key`. | Retyped `CreateOrderResult` to the real shape; checkout reads `order.id`/`order.amount`. |
| `src/services/nivaApi.ts` | COD was routed through the prepaid `create-order` with a non-existent `isCod` flag. | Added the real two-step COD endpoints `initiateCod` (`/api/orders/foods-cod-initiate`) and `verifyCod` (`/api/payment/verify-foods-cod-advance`). |
| `src/services/nivaApi.ts` | Coupon called `/api/coupons/validate` (does not exist) with the wrong body/response. | Pointed to `/api/coupon/validate` with the website's body; reads `pricing.discountAmount`. |
| `app/checkout.tsx` | Backend **always** requires a valid `deliverySlot` + `deliveryDate`; the app never sent `deliveryDate` and only sent a slot for one type, so **every room/block order 400'd**. Delivery model also conflated "when" and "where". | Reworked to the website model: orthogonal `deliveryMode` (instant/slot) × `deliveryType` (room/block/normal); always sends `deliverySlot` + `deliveryDate`; instant → `Instant Delivery` + today. |
| `app/checkout.tsx` | COD path never created an order. | COD now runs the two-step advance flow (initiate → Razorpay advance → verify). |
| `app/checkout.tsx` | Verify success was not confirmed robustly. | On verify failure the prepaid flow calls `/api/payment/recover`; the order id is read from `verifyRes.order.id`; cart only treated as placed after server confirmation. |
| `src/services/cartStore.tsx` | Cart items lacked `productType`, which the backend catalog lookup expects. | `productType` added to the item model and defaulted to `'fastfood'` centrally. |
| `src/services/customerAuth.ts` | Google failure gave a generic message, hiding the real cause. | Failure now names the exact remedy (allow-list `niva://auth-callback`); logs the computed redirect URL in dev. |

All changes pass `tsc --noEmit` (strict). They were **not** verified on a device
in this environment — see "Not yet verified".

---

## Google authentication — root cause & required configuration

**Root cause (not a code bug):** `signInWithGoogle()` asks Supabase to redirect
to `niva://auth-callback`. If that URL is not in the Supabase allow-list,
Supabase ignores it and falls back to the **Site URL (the website)** — exactly
the reported symptom.

The app is already correct:
- `app.json` → `"scheme": "niva"`, package `in.niva2026.customer`, and an
  Android intent filter for the `niva` scheme.
- `customerSupabaseClient` uses the implicit flow; `auth-callback.tsx` exists to
  receive the deep link; tokens are persisted in `expo-secure-store`.

### Required external configuration (you must apply these)

1. **Supabase → Authentication → URL Configuration → Redirect URLs** — add:
   ```
   niva://auth-callback
   ```
   (Keep the existing website URLs. This does not affect web login.)

2. **Google Cloud Console → OAuth client → Authorized redirect URIs** — this
   should **already** contain the Supabase callback (web Google login works),
   so no change is normally needed:
   ```
   https://nznofcpwjlidmlbkvwtg.supabase.co/auth/v1/callback
   ```

3. **SHA-1 / SHA-256 fingerprints are NOT required here.** This flow uses
   Supabase's hosted Google OAuth through a Chrome Custom Tab, not the native
   Google Sign-In SDK. Fingerprints only matter if you switch to the native SDK.

After step 1, Google sign-in returns to the app via `niva://auth-callback`, the
session is saved, the profile is fetched/created, and checkout resumes.

---

## Functionality inventory (code-verified)

Legend: **OK** = implemented and correctly wired to a real endpoint/handler ·
**Fixed** = was broken, fixed this pass · **Config** = needs dashboard config ·
**Cosmetic** = renders but is non-functional by design (noted, low priority).

### Launch & auth
| Element | Expected | Status |
|---|---|---|
| Splash → session restore → Home | Open to Home, guests browse | OK |
| Guest browsing (home/search/offers) | No login required | OK |
| Login screen Google button | Returns to app | Config (allow-list) |
| Login email/password | Supabase sign-in | OK |
| Session persistence / token refresh | 401→refresh→retry | OK (shared API layer) |
| Logout | Supabase sign-out + clear store | OK |

### Home (`(tabs)/index.tsx`)
| Element | Expected | Status |
|---|---|---|
| Cart icon | Opens `/cart` | OK |
| Search icon | Opens Search tab | OK |
| Cart badge count | Reflects cart | OK |
| Hero banners | `/api/hero-banners?platform=foods` | OK |
| Restaurant cards | Open `/restaurant/[id]` | OK |
| NIVA Deliveries card | Opens `/deliveries` | OK |
| Floating cart bar | Opens `/cart` | OK |
| Category chips | Filter restaurants | Cosmetic (restaurants have no category; chips change visual state only) |

### Search (`(tabs)/search.tsx`)
| Element | Expected | Status |
|---|---|---|
| Debounced query | Searches as you type | OK |
| Restaurant results | Supabase `restaurants` | OK |
| Dish results | Supabase `menu_items` | OK |
| Open result | Navigates to restaurant | OK |
| Add dish to cart | Updates cart + badge | OK |
| Clear / empty / no-results states | Shown | OK |

### Bottom navigation (`(tabs)/_layout.tsx`)
| Tab | Expected | Status |
|---|---|---|
| Home / Search / Orders / Offers / Profile | Correct icons, active state, destinations | OK |
| Orders (guest) | Sign-in prompt, not forced login | OK |
| Profile (guest) | Sign-in prompt, guest browsing preserved | OK |

### Restaurant menu (`restaurant/[id].tsx`)
| Element | Expected | Status |
|---|---|---|
| Restaurant + menu load | Supabase | OK |
| Category tabs / veg filter / in-menu search | Filter items | OK |
| ADD / +/- steppers | Update cart | OK |
| Vendor-mismatch dialog | Confirm before clearing | OK |
| Floating cart | Opens `/cart` | OK |

### Cart (`cart.tsx`)
| Element | Expected | Status |
|---|---|---|
| Quantity +/- / remove / clear | Mutate cart | OK |
| Subtotal / bill | Computed | OK |
| Persisted across restart + guest→login | AsyncStorage | OK |
| Checkout button | Login gate → `/checkout` | OK |

### Checkout (`checkout.tsx`) — **reworked this pass**
| Element | Expected | Status |
|---|---|---|
| Delivery type: room / block / normal | Select where | Fixed |
| Delivery timing: instant / slot (+date) | Select when, always sent | Fixed |
| Address / block selectors | Required per type | OK/Fixed |
| Coupon apply | `/api/coupon/validate` | Fixed |
| Online payment | create-order → Razorpay → verify (+recover) | Fixed |
| COD | initiate advance → Razorpay → verify-cod | Fixed |
| Server-authoritative amounts | Client never sets final price | OK (by design) |

### Orders / Offers / Profile / Addresses
| Element | Expected | Status |
|---|---|---|
| Order history + detail + live tracking | `/api/orders/customer/:id` + realtime | OK |
| Streak / coupons / wallet | `/api/streak`, `/api/wallet` | OK |
| Profile info + edit + logout | `/api/customers/*` | OK |
| Saved addresses CRUD + default | `/api/customers/:id/addresses*` | OK |
| Profile "Help & Support" / "Terms" rows | No destination yet | Cosmetic (inert, disabled — not a fake button) |

---

## Delivery business rules (verified against backend)

The backend (`lib/pricing.js`, `index.js`) is authoritative for every amount.
NIVA **Foods** (restaurant) room fee is quantity-based (≤4 → ₹19, >4 → ₹29);
block delivery is DB-driven (~₹9). The external **NIVA Deliveries** room tiers
in the brief (₹29/₹49/₹55/₹59/₹69) apply to `deliveries.tsx`
(`/api/orders/external-room-delivery`), a separate flow, and are unchanged. The
app sends only estimates for display; it never computes the charged total.

---

## Not yet verified (requires a device/emulator — not available here)

The following need a real build on an Android device/emulator; I could not run
one in this environment and do **not** claim they pass:

- End-to-end Google sign-in after the allow-list change.
- Razorpay sheet opening and a live prepaid + COD order round-trip.
- Realtime order-status updates on the order screen.
- Push notifications.
- Deep-link cold vs warm start for the OAuth callback.

Suggested manual run:
```
cd mobile/customer
npx expo run:android      # with an emulator running, or a device attached
```
If Metro's transformer errors recur, clear caches: `npx expo start -c`.
