# Store privacy disclosures

What to enter in **App Store Connect → App Privacy** and **Play Console → App content → Data safety** for PawPawCare, based on what the app and server actually collect (October 2026: Sentry, PostHog from the app and the server with an in-app opt-out, RevenueCat subscriptions, Google/Apple sign-in). Keep this in sync with `website/privacy/index.html`; both stores reject listings whose answers contradict the privacy policy.

Update this file whenever a new SDK or data flow ships, then update both store forms.

## Facts both forms depend on

| Question | Answer |
|---|---|
| Used for tracking (Apple's definition: linking with other companies' data for ads, or sharing with data brokers)? | **No.** No ad SDKs, no IDFA/AAID, nothing sold. |
| Data encrypted in transit? | **Yes** (HTTPS everywhere). |
| Can users request deletion? | **Yes.** In-app: Profile → Edit → Delete account (30-day grace, then purge incl. PostHog person + RevenueCat customer). Without the app: <https://pawpawcare.app/privacy/#delete> (email). |
| Privacy policy URL | <https://pawpawcare.app/privacy/> |
| Account deletion URL (Play requires one reachable without the app) | <https://pawpawcare.app/privacy/#delete> |
| Is data collection required? | Account + pet records: required for the app to work. Analytics: optional (Profile → Privacy). |

## Apple — App Privacy ("nutrition label")

For every type below: **Linked to the user = Yes** (keyed by account ID; PostHog's pre-sign-in installation ID joins the account's profile at sign-in), **Used for tracking = No**.

| Apple data type | What it is in PawPawCare | Purposes to tick |
|---|---|---|
| Contact Info → Name | account name; Google/Apple sign-in name | App Functionality |
| Contact Info → Email Address | account email; support messages | App Functionality |
| User Content → Photos or Videos | pet photos, document scans | App Functionality |
| User Content → Customer Support | Help & feedback messages | App Functionality |
| User Content → Other User Content | pet records (vaccines, meds, weights, notes, documents), community posts, lost-pet reports | App Functionality |
| Identifiers → User ID | our account UUID (PostHog, Sentry, RevenueCat) | App Functionality, Analytics |
| Identifiers → Device ID | PostHog's random installation ID: lifecycle events (installed, updated, opened, backgrounded) go out under it before sign-in | Analytics |
| Purchases → Purchase History | Plus subscription status/history via RevenueCat | App Functionality |
| Usage Data → Product Interaction | PostHog feature events (opt-out available) | Analytics |
| Diagnostics → Crash Data | Sentry crash reports (account ID only, scrubbed) | App Functionality |
| Diagnostics → Performance Data | Sentry performance traces (10% sample) and Expo Observe launch metrics | App Functionality |

Device ID is the cautious reading: Apple's definition is "the device's advertising identifier, or other device-level ID". There are still no advertising identifiers, and the push token on its own wouldn't need this row; PostHog's installation ID is what puts it there.

IP addresses appear only in server logs (14 days) and rate limiting, for security; they are never used to derive location, so neither form gets a location row for them. Re-check this if anything starts geolocating requests.

Do **not** tick: Health & Fitness (pet records aren't the user's health data), Location (lost-pet reports are typed text, no GPS), Financial Info (Apple/Google take payment; we never see cards), Browsing/Search History, Contacts, Sensitive Info.

## Google Play — Data safety

**Data shared** (transferred to a third party): Google's definition excludes service providers processing on our behalf, so answer **No data shared**. All the providers in the privacy policy are processors.

**Data collected** — for each: *Collected = Yes*, *Processed ephemerally = No*, *Required or optional* as noted.

| Play category → type | Required? | Purposes |
|---|---|---|
| Personal info → Name | Required | Account management, App functionality |
| Personal info → Email address | Required | Account management, App functionality |
| Personal info → User IDs | Required | Account management, Analytics, App functionality |
| Financial info → Purchase history | Optional (only subscribers) | App functionality |
| Photos and videos → Photos | Optional | App functionality |
| Files and docs → Files and docs | Optional (vet documents) | App functionality |
| Messages → Other in-app messages | Optional (support messages, community posts/comments) | App functionality |
| Device or other IDs → Device or other IDs | Optional (Profile → Privacy toggle) | Analytics |
| App activity → App interactions | Optional (Profile → Privacy toggle) | Analytics |
| App activity → Other user-generated content | Required (pet records) | App functionality |
| App info and performance → Crash logs | Required | App functionality (diagnostics) |
| App info and performance → Diagnostics | Required | App functionality (diagnostics) |

Device or other IDs covers PostHog's random installation ID, which pre-sign-in analytics events are sent under. Google's examples for this type include a Firebase installation ID, the closest equivalent.

Security practices: **encrypted in transit = Yes**; **users can request deletion = Yes** (URL above).

## Before `SUBSCRIPTIONS_VISIBLE=all`

- [ ] Privacy policy + terms live (this PR) — the paywall links to `/terms/` and `/privacy/`.
- [ ] App Store Connect App Privacy updated with the table above (Purchases + Diagnostics are the new rows).
- [ ] Play Data safety updated (Purchase history, Crash logs, Diagnostics are new).
- [ ] App Store Connect: subscription group, products, localized subscription display names, and the App Review demo account added to `REVENUECAT_SANDBOX_USER_IDS`.
- [ ] Owner legal review of the new privacy/terms wording (not legal advice from the author of this file).
