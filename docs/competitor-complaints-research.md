# Competitor negative-review research (July 2026)

Negative (1–3★) review analysis of competing pet health apps, gathered from Google Play, Apple App Store review pages and aggregators (JustUseApp, APKPure), Capterra, Software Advice, and Trustpilot. Purpose: identify the recurring failure modes so PawPawCare can deliberately do better on each.

**Method & confidence.** Two multi-agent research passes (pass 1: 11pets, PetDesk, VitusVet, Airvet, Dogo, Fuzzy; pass 2: Pawprint/Great Pet Care, MyPet Reminders, Buddy, Pet First Aid, Puppr) searched 10 angles, fetched ~30 sources, and extracted ~85 claims. Claims marked ✅ survived 3-vote adversarial verification (one via an independent scrape of 2,250 Google Play reviews); refuted claims are excluded. Everything else is a direct extraction from the fetched review pages with a representative quote — real quotes, but not independently re-verified (verification was cut short by usage limits in both passes).

---

## Per-app complaint themes

### 11pets: Pet Care — *the data-hostage cautionary tale*

The 2025 "new version" update is a case study in destroying user trust:

1. **Retroactive paywall on users' own data** — previously free records locked behind a subscription. *"They just launched an update to force you have a subscription, and blocked me from accessing the data I have been putting in… I call that stealing."*
2. **Migration data loss/corruption** — *"Most of the data was not migrated. And what's worse, the data that was migrated was scrambled!"* The developer's export workaround produced an empty file.
3. **Per-pet pricing; free tier = one pet at a time** — multi-pet owners must pay or delete pets one-by-one to export.
4. **Account lockouts with broken password reset** — *"I can't even pay them to get my precious data back."* Plus an unskippable subscription-banner bug.
5. **Unreachable support during the crisis** — emails unanswered; the in-app contact form's send button was hidden behind the iPhone keyboard with no way to scroll to it.

### PetDesk — *reminders and records you can't trust*

Consumer side (App Store / Google Play via JustUseApp):

1. **Reminder failures, many flavors** — creating any medication/vaccine reminder failed with *"Request failed: bad request (400)"* even after reinstall; stale reminders for completed items can't be deleted by owner **or** vet practice; vaccinations keep flagging overdue because the app doesn't sync after office visits; intervals limited to 6/12 months. ✅ **Confirmed (3-0):** timezone bug delivered reminders in CST instead of EST, and PetDesk's official fix was "tell every client to reinstall the app."
2. **Update removed historical medical data** — prior lab work, x-rays, older appointments/meds vanished from view. *"Please please turn PetDesk back to the former version."* Bloodwork viewable only on the phone screen ("held hostage").
3. **Password paste disabled** — password-manager users literally cannot log in; a second reviewer hit a crash when switching to a password manager during signup. Developer never replied.
4. **Appointment booking glitches** — wrong appointment type booked → clinic refused the visit after a 50+ mile drive ("NOT the first time"); cancelling a wrong-location duplicate also wiped the correct appointment (multi-location practices mishandled).
5. **Incomplete records by design** — can't add OTC medicines; only one character-capped note per pet; note-typing box obscures the text; support took ~6 weeks to respond.
6. **Poor multi-person household support** — system only recognizes a primary phone number.

Clinic side (Capterra / Software Advice — B2B, but the same product): unresponsive support ("lost all communication with our rep"), broken onboarding promises, "SO EXPENSIVE," and PIMS sync failures (texts don't sync into the PIMS; incompatible with EzyVet booking).

### VitusVet — *years-long broken basics and silent data purges*

1. ✅ **Confirmed (3-0): broken photo/document upload, unfixed 2021→2025** — the single largest negative theme; an independent scrape of 2,250 Google Play reviews found photo/upload complaints in 36 of 159 negative text reviews (vs crashes 20, reminders 12, login 11). *"It's ridiculous that it hasn't been fixed… They don't care."*
2. ✅ **Confirmed (3-0): data loss / silent record purging** — histories older than ~3–5 years deleted (*"I had histories for 6 cats going back to 2013"*); some users open the app to find all pet info gone and must re-enter it.
3. **Broken support channel** — "Contact VitusVet" on Android errors with *"no app found to send email"*; emails unanswered for a year+.
4. **Reminders that never fire** — *"I spent loads of time inputting info and the reminders don't work… which was the whole reason I installed it"*; duplicate/incorrect appointment notifications.
5. Clinic side: unreliable PIMS integrations (EzyVet inconsistent, AVImark incomplete, ImproMed slow); appointment requests never line up with real slots; limited messaging customization.

*(A claim that the app is useless without a participating vet was **refuted** on verification — owners can add records themselves; excluded.)*

### Airvet — *billing surprises and a 24/7 promise that isn't*

1. **Unauthorized/unexpected charges** — $40 charged for *declining* video calls; charged without ever receiving a call; stored credit card cannot be removed from the app.
2. **24/7 availability fails** — 20 minutes stuck on the connecting screen at night, then "no vets available"; no queue-position or wait-time visibility.
3. **Reliability bugs intersecting with billing** — call hung on "Connecting," a pending $30 charge appeared, and the in-app Contact Support feature was itself broken.
4. **Paying $30 to be told "see a vet in person"** — telehealth vets can't prescribe; users feel charged full price for no outcome.
5. **Vet-clinic integration confusion** — the "free follow-up with your own vet" routed to a random out-of-state vet; clinic staff couldn't explain the app.

### Dogo — *paywall aggression and broken sharing behind a 4.8★ facade*

1. **Hidden dissatisfaction** — JustUseApp NLP over 16,667 reviews: 31.1% negative vs 19.0% positive experiences despite the 4.8/5 store rating.
2. **Aggressive paywall** — ~5 free trainings then premium required; multi-dog households must pay to add a second dog.
3. **Family sharing broken** — could not add family members as "pet parents" via email *or* iMessage invites; unrecoverable account errors.
4. **Trial billing deception** — advertised 7-day free trial billed after 3 days.
5. **Basic UX/QA bugs while paid** — close buttons that don't close, no back navigation, failed video submissions, at $7.99/month.

### Great Pet Care (formerly Pawprint) — *a rebrand that paywalled the core feature*

✅ **Confirmed:** Pawprint no longer exists as a standalone brand — it was absorbed into **Great Pet Care** (Covetrus North America; the Android package is still `com.pawprint.mobile`). The rebrand is a disaster on Android: **2.37/5 on Google Play (330 ratings, ~72% of them 1–3★: 170 one-star vs 72 five-star)**.

1. **Core feature moved behind a paywall after the rebrand** — vet record requests, previously affordable, now cost $4.99/month or $49.99/year. *"Now, this app won't let you request records, and I've moved back to storing documents in a paper folder."*
2. **Support obstruction around record requests** — customer service repeatedly cancelled a user's free medical-record request during a trial, then the app blocked the promised replacement request.
3. **Unreliable vet-integration sync (Jan 2026)** — pets confirmed present in the vet's system didn't flow into the app; medical history missing. The June 2026 changelog itself admits cancelled appointments still showing, appointment times in the wrong timezone, and a booking crash.
4. ✅ **Reminder reliability (iOS)** — *"Reminders haven't worked for months"*; no mark-as-done; notifications that don't navigate to the reminder.
5. ✅ **Onboarding/login failure (iOS)** — app hung on a post-login splash screen right after account creation; photo upload failures; duplicate pet profiles.
6. ✅ **Subscription state didn't sync across devices** — paid annual subscriber shown as "Free" plan after switching phones; weight tracker feature disappeared after a redesign.
7. ✅ **Feature-bloat instability** — *"Ever since you started adding all of this newer stuff, this app has become buggy."*

### Puppr — *paywall deception and unmoderated community* (extra app, pass 2)

1. **Misleading free-tier presentation** — advertised "free live chats" are actually paid; the lesson list implies all packs are included when only basics + one trick per pack is free. *"Total scam."*
2. **Progress tracking behind payment** — you must pay just to track which tricks are mastered/in progress.
3. **Community moderation failures** — off-topic photos and cheaters posting internet photos that win weekly contests, with **no visible reporting mechanism**. Directly relevant to PawPawCare's community feature.
4. Caveat: overall sentiment is positive (4.8/5); negative volume is low.

### Fuzzy — *how monetization anger kills a brand* (Trustpilot 2.6/5, 341 reviews)

1. **Charged after cancellation** — six cancellation emails ignored, payment taken anyway; users resorted to bank chargebacks.
2. **Paid subscription, zero service** — *"I paid for a monthly subscription and all I get is silence."*
3. **Support unresponsive on every channel** (chat, email, phone).
4. Caveat: the original Fuzzy telehealth app shut down ~mid-2023 and the domain appears repurposed; treat post-2023 reviews cautiously.

### Apps checked and ruled out (pass 2)

- **MyPet Reminders** — ✅ **dead.** Delisted from the Apple App Store (listing 404s; iTunes Lookup returns zero results in US/CZ/NL/GB storefronts), Google Play listing 404s, last Android build was v0.9.5 in **August 2017**, and the Merck/Intervet reminder-service URL now 301-redirects to a generic pet-owners page. No review data exists to analyze; its abandonment is itself a signal — it was a pharma side project, not a product.
- **Pet First Aid by American Red Cross** — ✅ alive and maintained, but only **72 App Store ratings** (4.2/5) with no visible negative reviews, and it's a first-aid *reference* app: its only overlap with PawPawCare is a lightweight pet profile. Not a meaningful complaint source. One feature worth noting: its **animal hospital locator** is a discovery feature PawPawCare lacks.
- **"Buddy: Pet Care & Dog Walking"** — could not be conclusively located; the two "Buddy"-named apps found are different products: *Buddies – Pet Care & Rewards* (Blue Buffalo's loyalty app: chronic "Can't Connect" errors, unexplained "not eligible" signup rejections, dogs-and-cats-only inclusivity complaints, ad-vehicle criticism) and *Dog Monitor Buddy & Pet cam* (pet camera; connectivity failures away from home Wi-Fi, re-charging users who already paid, undisclosed billing period on the paywall). Their complaints are included in the aggregate as general cautionary patterns only.

---

## Aggregated themes, ranked by severity × frequency

| # | Theme | Seen in | What users actually say |
|---|-------|---------|------------------------|
| 1 | **Data loss & "data hostage"** | 11pets, VitusVet ✅, PetDesk, Great Pet Care | Migrations that scramble/lose records; silent purging of history; updates hiding old labs/x-rays; retroactive paywalls on already-entered data (11pets) or on the core record-request feature after a rebrand (Great Pet Care, now 2.37★ on Android). The #1 trust destroyer — these users churn permanently and warn others. |
| 2 | **Reminder unreliability** | PetDesk ✅, VitusVet, Great Pet Care ✅ | Reminders that never fire (or "haven't worked for months"), fire in the wrong timezone, can't be created (400 errors), can't be deleted or marked done, or stay "overdue" forever because visits don't sync. For a reminders app this is the core promise broken. |
| 3 | **Billing/subscription abuse** | 11pets, Airvet, Dogo, Fuzzy, Puppr, Great Pet Care | Charges after cancellation, charges for declined calls, un-removable stored cards, trials that bill early, retroactive paywalls, per-pet fees, "free" features that turn out paid, paid subscription state lost when switching phones ✅. |
| 4 | **Support black holes** | Nearly all | Unanswered emails for a year; broken in-app contact forms (send button behind keyboard; "no app found to send email"); 6-week response times; support cancelling free record requests. Amplifies every other complaint. |
| 5 | **Broken media/document upload** | VitusVet ✅, Great Pet Care | Core photo/record upload broken for 4+ years (VitusVet's top negative theme); photo upload failures during onboarding. |
| 6 | **Login/account failures** | PetDesk, 11pets, Dogo, Great Pet Care ✅, Buddies | Paste blocked in password fields (kills password managers), broken password reset = permanent lockout from data, signup crashes, post-login hangs, unexplained "not eligible" signup rejections. |
| 7 | **Multi-pet & family sharing** | Dogo, 11pets, PetDesk | Second pet behind paywall; family invites that fail on both email and iMessage; households limited to one phone number. |
| 8 | **Vet/appointment integration failures** | PetDesk, VitusVet, Airvet, Great Pet Care | Wrong appointment types/locations booked, slots that don't match reality, visits that don't sync back, pets in the vet's system that never appear in the app, routing to random vets. |
| 9 | **Clunky UX / QA basics** | Dogo, PetDesk, Great Pet Care ✅ | Non-functional back/close buttons, text boxes hiding input, click-heavy slow screens, feature-bloat updates that break navigation — especially resented by paying users. |
| 10 | **Community moderation gaps** | Puppr | Off-topic content and cheaters winning community contests with stolen photos, and no way to report them. The only community-feature complaint data found — a differentiation opening for PawPawCare's community tab. |

---

## What this means for PawPawCare

1. **Treat user data as sacred.** Free, one-tap full export (PDF/CSV) at any time; never delete or hide history; never move already-entered data behind a paywall; test migrations against real datasets before any schema change. (Counters theme 1 — the biggest churn driver in this market.)
2. **Make reminders verifiably reliable.** Store times timezone-aware end-to-end; surface delivery state ("scheduled for…"); let users *and* linked family delete/complete any reminder; sync completion state so nothing stays "overdue" forever; alert on backend 4xx/5xx from reminder creation (Sentry is already wired).
3. **Be scrupulously clean on billing.** Cancellation must work in-app instantly with email confirmation; no charges without explicit action; card removal must be possible. Any grandfathering on future pricing changes.
4. **Make support reachable and test the contact form on-device.** The competitor pattern of a *broken contact form* (keyboard covering the send button) turning angry users into 1★ reviewers is cheap to avoid.
5. **Guard the upload path with tests + monitoring.** Vault/document upload is PawPawCare's equivalent of VitusVet's 4-year-broken photo feature — an E2E upload test per release and Sentry alerts on upload failures would have saved VitusVet hundreds of 1★ reviews.
6. **Never block password paste; make reset bulletproof.** Autofill/password-manager compatibility on both platforms.
7. **Lean into multi-pet + family sharing as differentiators.** Unlimited pets on a reasonable tier; family invites that demonstrably work over multiple channels — competitors fail at exactly this.
8. **Show system status honestly** (queue positions, sync state, last-updated timestamps) — silent failure is what turns a bug into a 1★ review.
9. **If pricing ever changes, grandfather existing functionality.** Great Pet Care's rebrand-plus-paywall took the app from a loved product to 2.37★; 11pets did the same. This is the most repeatable self-inflicted wound in the category.
10. **Give the community feature a report/flag mechanism and active moderation from day one** — Puppr shows what happens without one.
11. **Make subscription entitlements server-side and device-independent** — a paying user must never see "Free plan" after switching phones.

## Sources

- https://play.google.com/store/apps/details?id=com.vitusvet.android (primary; independently re-scraped 2,250 reviews during verification)
- https://play.google.com/store/apps/details?id=com.locai.petpartner (PetDesk, Google Play)
- https://justuseapp.com/en/app/1232470530/11pets-pet-care/reviews
- https://justuseapp.com/en/app/631377773/petdesk/reviews
- https://justuseapp.com/en/app/1153294767/dog-training-clicker-by-dogo/reviews
- https://justuseapp.com/en/app/1448478595/airvet-vet-on-demand/reviews
- https://www.capterra.com/p/166086/PetDesk/reviews/
- https://www.capterra.com/p/143459/VitusVet/reviews/
- https://www.softwareadvice.com/veterinary/petdesk-profile/reviews/
- https://www.trustpilot.com/review/yourfuzzy.com

Pass 2 (July 2026):

- https://apps.apple.com/us/app/greatpetcare/id934948619 (Great Pet Care, App Store)
- https://justuseapp.com Great Pet Care Google Play aggregation (2.37/5, 330 ratings; package `com.pawprint.mobile`)
- https://account.greatpetcare.com/app ("Pawprint is now Great Pet Care!")
- https://apps.apple.com/us/app/pet-first-aid/id780415389 (Red Cross Pet First Aid)
- https://apps.apple.com/us/app/mypet-reminders/id985654859 (404 — delisted) + iTunes Lookup API (0 results US/CZ/NL/GB) + APKPure version history (last update Aug 2017)
- JustUseApp pages for Puppr, Buddies – Pet Care & Rewards (Blue Buffalo), Dog Monitor Buddy & Pet cam

Kimola/AppGrooves aggregator pages and a PetNoter marketing "roundup" were fetched but judged unreliable/self-promotional and excluded.
