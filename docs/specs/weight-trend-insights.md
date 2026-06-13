# Spec: Weight Trend Insights

## What it does

Turns a pet's raw weight logs into a plain-language trend — **direction,
magnitude, and span** over the full history — instead of the previous
last-vs-previous delta. A non-diagnostic "notable change" flag nudges the owner
to raise large swings with a vet. The same insight appears on the vet share
page, so the vet sees the trajectory at a glance.

Examples:
- "Up 0.8 kg (20%) over the last 3 months" + notable flag
- "Down 0.3 kg (6%) over the last 5 weeks"
- "Stable over the last 2 months"

## Algorithm (one tested source of truth)

`App\Support\WeightInsight::for($logs, $unit)`:
- Converts every log to the pet's current display unit (logs can predate a unit
  change), sorts chronologically, compares earliest → latest.
- `direction`: **stable** if |change| < 3%, else up/down.
- `notable`: |change| ≥ 10% — a safe, non-diagnostic "worth a vet check" flag.
- Returns `current, unit, direction, change_abs, change_pct, period_days,
  points, notable, summary`. Null under two logs.

The thresholds (3% / 10%) and the span humanizer (days → weeks → months) are
mirrored in the frontend's `weightInsight()` for an instant client render; the
PHP copy is the tested authority and powers the share page.

## Where it shows

- **PetProfile** weight section: a summary line under the current weight, plus
  an amber "Notable change" chip when flagged. The existing bar chart stays.
  Computed client-side from already-loaded `pet.weights` — no round-trip,
  OTA-friendly.
- **Vet share page** (`share.blade.php`): a trend line above the weight
  sparkline, with the notable note rendered for the vet.

## Design choices

- **No backend round-trip for the app.** The weights are already in global
  state, so the app mirrors the algorithm client-side for an instant render.
  The backend computation exists to (a) be unit-tested and (b) enrich the web
  share page. The two implementations share identical thresholds; drift risk is
  low and the PHP tests validate the shared algorithm.
- **No breed-ideal bands.** Sourcing reliable per-breed ideal-weight ranges is
  unreliable and risks implying medical claims. The insight stays factual
  (direction/magnitude/span) plus a gentle, non-diagnostic flag.

## Tests

`WeightInsightTest` (unit, 7 cases): null under two logs, up/down/stable
detection, notable threshold, unit conversion (kg logs → lb display), input
ordering independence, day/week/month span humanizing. Plus a `ShareLinkTest`
assertion that the share page renders the trend. Full backend suite 131/131.

Frontend has no JS test runner; the mirrored `weightInsight()` is validated
indirectly by the PHP tests of the identical algorithm and by the bundle
compile.

## Possible follow-ups

- Windowed trends ("last 30 / 90 days") if histories grow long
- Feed the insight into AI symptom triage as context
