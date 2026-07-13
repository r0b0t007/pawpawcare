# Google Sign-In setup (owner-only)

Social login (Google + Apple) is **already implemented and merged**. Google
sign-in stays **disabled** — the button is hidden and the backend endpoint
returns `503` — until you create the OAuth client IDs below and wire them in.
This is a one-time setup. (Apple needs nothing here; it's auto-enabled by EAS
during the iOS build via `usesAppleSignIn`.)

**App identifiers (already set, don't change):**
- iOS bundle ID: `com.pawpawcare.app`
- Android package: `com.pawpawcare.app`

You'll create **three** OAuth clients — **Web**, **iOS**, **Android** — in one
Google Cloud project. The key mental model: the app authenticates with the
native iOS/Android clients, but the **ID token it sends to our backend always
carries the _Web_ client ID as its audience**. So the Web client ID is the value
that must match on both the app side and the backend side.

---

## Step 1 — Project + OAuth consent screen

1. Go to <https://console.cloud.google.com/> and create (or pick) a project,
   e.g. **PawPawCare**.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name **PawPawCare**, support email, developer contact.
   - **Scopes:** the defaults `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile` are all you need. These are **non-sensitive**,
     so **no Google verification/review is required**.
   - **Publishing status:** click **Publish app** (move to "In production"). While
     it's in "Testing", only explicitly-added test users can sign in. Publishing
     with only these basic scopes does **not** trigger a review.

---

## Step 2 — Web client ID (the audience)

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**. Name it `PawPawCare Web`.
3. You can leave the redirect URIs empty (the native flow doesn't use them).
4. **Create → copy the Client ID** (looks like `NNNNNN-xxxx.apps.googleusercontent.com`).

This one value goes in **two** places and they must be **identical**:
- Frontend: `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (in `eas.json`)
- Backend: `GOOGLE_WEB_CLIENT_ID` (in the server `.env`)

---

## Step 3 — iOS client ID

1. **Create credentials → OAuth client ID → iOS**. Name it `PawPawCare iOS`.
2. **Bundle ID:** `com.pawpawcare.app`.
3. **Create → copy the iOS Client ID** (`NNNNNN-yyyy.apps.googleusercontent.com`).

Two derived values:
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` = the iOS client ID as-is.
- **`iosUrlScheme`** in `frontend/app.json` = the iOS client ID **reversed**:
  strip `.apps.googleusercontent.com` and prefix `com.googleusercontent.apps.`.

  ```
  iOS client ID:  NNNNNN-yyyy.apps.googleusercontent.com
  iosUrlScheme:   com.googleusercontent.apps.NNNNNN-yyyy
  ```

  Replace the current `com.googleusercontent.apps.PLACEHOLDER-...` in `app.json`.

---

## Step 4 — Android client ID(s)

Android OAuth clients are matched by **package name + SHA-1 certificate
fingerprint**. Unlike iOS, there's no value to paste into the app — but the
client(s) **must exist** or Google sign-in fails on Android at runtime.

1. Get the SHA-1 of the keystore EAS builds with:
   ```bash
   cd frontend
   eas credentials -p android      # → Keystore → shows the SHA-1 fingerprint
   ```
2. **Create credentials → OAuth client ID → Android**. Name it `PawPawCare Android`.
   - Package name: `com.pawpawcare.app`
   - SHA-1: the fingerprint from step 1.
3. **Play Store gotcha (do this before/at production release):** Google Play
   **re-signs** your app with its own key (Play App Signing), so production
   installs present a *different* SHA-1 than your EAS keystore. Create a
   **second** Android OAuth client (same package `com.pawpawcare.app`) with the
   **Play App Signing SHA-1** from **Play Console → your app → Test and release →
   App integrity → App signing key certificate → SHA-1**. Without this, Google
   sign-in works in internal/preview builds but breaks for Play Store users.

---

## Step 5 — Wire the values

| Value | Goes in | Key |
|-------|---------|-----|
| **Web** client ID | `frontend/eas.json` (preview + production `env`) | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| **Web** client ID (same) | backend server `.env` | `GOOGLE_WEB_CLIENT_ID` |
| **iOS** client ID | `frontend/eas.json` (preview + production `env`) | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| **iOS** client ID, reversed | `frontend/app.json` | `iosUrlScheme` |
| **Android** client(s) | Google Cloud only (package + SHA-1) | — nothing in code — |

`eas.json` currently has `REPLACE_WITH_GOOGLE_WEB_CLIENT_ID` /
`REPLACE_WITH_GOOGLE_IOS_CLIENT_ID` placeholders in both the `preview` and
`production` build profiles — replace all four. For local dev, put the same two
`EXPO_PUBLIC_GOOGLE_*` in `frontend/.env.local`.

> The `EXPO_PUBLIC_*` values are embedded in the JS bundle — that's expected and
> fine (OAuth client IDs are public identifiers, not secrets). The only true
> secret here is the Apple/Google signing keys, which EAS manages.

---

## Step 6 — Rebuild and test

Native modules **cannot** ship over OTA, so you need a fresh build. Test on a
**`preview`** build:

```bash
cd frontend
npm run build:preview
```

Why `preview` and not `build:dev`: the `preview` profile is **release-signed
with the EAS keystore whose SHA-1 you registered** in Step 4, so Android Google
sign-in works. A `development` build is **debug-signed** (different SHA-1), so
Android Google sign-in would fail with `DEVELOPER_ERROR` unless you also register
that debug SHA-1 as its own Android OAuth client. (iOS is bundle-ID-based, so
Google works on either build there — Android is the constraint.) All three build
profiles now carry the `EXPO_PUBLIC_GOOGLE_*` vars, so the button shows on each.

Then on device:
- **Google** on **iOS + Android** → completes and loads the app.
- **Apple** on a **real iOS device** (not simulator for the first auth).
- **Android** shows **only** the Google button (Apple is correctly absent).
- Confirm the backend now returns `200` (not `503`) for `/auth/google`.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Backend `503 "Social login is not configured"` | `GOOGLE_WEB_CLIENT_ID` not set on the server |
| Google button doesn't appear at all | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` unset in that build (button is hidden by design) |
| `DEVELOPER_ERROR` on Android sign-in | SHA-1 / package mismatch — wrong or missing Android OAuth client (or missing the Play App Signing SHA-1 for Store builds) |
| Backend `401` on a real Google token | app's `webClientId` ≠ backend `GOOGLE_WEB_CLIENT_ID` (audience mismatch) |
| iOS sign-in opens then fails to return | `iosUrlScheme` wrong or still the placeholder (must be the reversed iOS client ID) |
| Apple sign-in always `401` | nonce mismatch — should not happen with the shipped code; verify the client sends `raw_nonce` |

See also: `docs/deploy-backend.md` for setting the server `.env`, and the
`## TODO` in `CLAUDE.md` for the checklist summary.
