# Spec: Caretaker Mode

## What it does

A time-boxed **sitter handoff** for a pet. The owner writes care notes (feeding,
instructions, emergency contact) and generates a read-only link they text to
whoever's looking after the pet. The sitter opens it in any browser — no
account, no app — and sees everything they need: care notes, the active
medication schedule, and who to call in an emergency. The link expires on its
own and can be revoked.

Turns the "leaving town, texting the sitter a novel" problem into a structured,
always-current page.

## Trust model

Same signed-URL pattern as the vet share page, with an **independent
`care_token`** so caretaker and vet links revoke separately:
- **Profile + link mint** (JWT-guarded) do the `Pet::accessibleBy` check
  (owner + co-owner).
- **Caretaker page** (`GET /care/{pet}`, no JWT) is gated by signature + expiry
  + a matching `care_token`. Rotating the token (revoke) → existing links 410.

Read-only by design (the pitch's "no edit/delete rights") — the sitter can't
change records. Sitter-side dose logging is a deliberate v1.5 follow-up.

Expiries are day/week-scale (1d / 3d / 7d default / 14d) since sitting runs
longer than a vet visit.

## Backend

- `care_profiles` table (1:1 pet): `feeding`, `instructions`, `emergency_name`,
  `emergency_phone`. `pet_id` fillable but only ever set server-side.
- `pets.care_token` (guarded, never fillable).
- `CareController`:
  - `GET /pets/{pet}/care` / `PUT /pets/{pet}/care` — profile read/upsert
    (owner + co-owner), `updateOrCreate` by pet so it's idempotent.
  - `POST /pets/{pet}/care-link` / `DELETE …/care-link` — mint / revoke.
  - `GET /care/{pet}` (signed) — render `care.blade.php`.
- The page shows: pet header, feeding, instructions, **active** meds + dose
  times, emergency contact + linked clinics. `X-Robots-Tag: noindex`; Blade
  auto-escaped; no owner identity (name/email/id) exposed.

## Frontend

- DataContext: `getCareProfile`, `saveCareProfile` (PUT), `createCareLink`,
  `revokeCareLinks`; added a `put` wrapper to the api service.
- PetProfile: a **Caretaker mode** row → `CaretakerModal` — edit notes
  (feeding / instructions / emergency name+phone), **Save notes**, or
  **Create & Share** (saves first, mints, hands the URL to the native share
  sheet) with expiry chips, link preview + re-share, and revoke-all.
- `care_link_created` analytics event (expiry only).

## Security

- Both mutating surfaces behind `Pet::accessibleBy` (outsiders 404).
- `care_token` guarded — a pet update can't rotate it (tested).
- Profile `pet_id` only set from the verified route; PUT validates a 4-field
  allowlist.
- No owner identity on the page (tested). Tampered → 403, revoked → 410.
- Care and vet links revoke **independently** (tested).

## Tests

`CareTest` — 12 tests / 47 assertions: profile CRUD (owner/co-owner/outsider,
idempotency), link mint (owner/outsider/bad-expiry/window), page render
(notes + active-only meds + emergency, no-PII), tamper/expiry/revoke,
independent revocation, mass-assignment guard. Full backend 146/146; frontend
Jest 24 + bundle green.

## Possible follow-ups

- **Sitter-side dose logging** — let the caretaker check off a med as given
  from the page (a tightly-scoped signed write). The differentiator beyond
  read-only.
- Feeding/walk checklist the sitter ticks through the day.
