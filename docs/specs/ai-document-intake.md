# Spec: AI Document Intake ("Scan a vet record")

## What it does

A user uploads a vaccination card, prescription, lab result, or invoice to the vault — exactly
as today. The app then offers **"Extract info from this document"**: one Claude API call reads
the PDF/photo and returns structured data (vaccinations, medications, weight, appointment
details, costs). The user reviews the suggestions, unchecks anything wrong, and taps **Apply**
— the records appear in the trackers they already use. Nothing is ever saved without review.

## User flow

```
MedicalRecordsScreen → document row → "✨ Extract info"
   → POST /pets/{pet}/documents/{doc}/extract     (5–15s, spinner: "Reading document…")
   → Review sheet: grouped suggestions with checkboxes
        💉 Vaccinations   [✓] Rabies — administered 2026-05-12, next due 2027-05-12
        💊 Medications    [✓] Simparica 40mg — monthly
        ⚖️ Weight         [✓] 18.4 kg on 2026-05-12
        💰 Expense        [ ] $145.00 — Yorkville Animal Clinic
   → user edits/unchecks → "Apply N items"
   → POST /pets/{pet}/documents/{doc}/apply  { vaccinations: [...], ... }
   → rows created via the existing models; document auto-categorized
```

Review principles: **everything is opt-out-able per item**, and **fields are editable inline**.

## Data model

Three columns on `documents` (no new table — an extraction is 1:1 with a document):

- `extraction_status` string default `none` — `none|pending|done|failed`
- `extraction` json nullable — raw structured payload (review sheet re-opens without re-paying)
- `extracted_at` timestamp nullable

Not `$fillable` — set server-side only. `toApi()` exposes `extraction_status` + `extraction`.

## Backend

- **SDK**: `composer require anthropic-ai/sdk`; key in `config/services.php` →
  `services.anthropic.key` / `.model` from `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`
  (default `claude-opus-4-8`).
- **Routes** (both behind the standard `petOr404` + `where('pet_id')` scoping):
  - `POST /pets/{pet}/documents/{document}/extract` — `throttle:10,1`
  - `POST /pets/{pet}/documents/{document}/apply`
- **`App\Services\DocumentExtractor`**: loads bytes from the private disk, base64-encodes,
  builds a `document` (PDF) or `image` content block, calls `messages->create` with a
  **structured-output JSON schema** (guaranteed-valid JSON, no parse retries), then runs a
  server-side sanitation pass (clamp strings, validate dates, drop incomplete entries) —
  model output is structurally guaranteed but semantically untrusted.
- **System prompt** injects pet context (name/age/breed/species) and mandates: extract only
  what is explicitly present, `null` over guessing, dates `YYYY-MM-DD`, and a `matches_pet`
  flag set false when the document names a different animal (catches uploads to the wrong
  pet profile in co-owner households).
- **Schema** mirrors model `$fillable` fields: `document_type` (== document category enum),
  `matches_pet`, `document_date`, `clinic {name, phone, address}`, `vaccinations[]`,
  `medications[]`, `weight {value, unit, date}`, `total_cost`, `suggested_title`,
  `notes_for_owner`.
- **Apply endpoint** receives the user's edited/approved subset, validates with per-field
  allowlists, creates rows via existing models (`pet_id` from the verified route param,
  never the payload), in a transaction, with idempotent dedup:

  | Group | Dedup rule |
  |---|---|
  | Vaccination | skip if same name + administered_date exists |
  | Medication | skip if active medication with same name exists |
  | WeightLog | skip if entry within ±1 day exists |
  | Expense | skip if same amount + date exists |
  | Clinic | firstOrCreate by name; link clinic_id on the document |

- **Sync, not queued** (deliberate): `QUEUE_CONNECTION=sync`; the call takes 5–15s, inline
  with a 60s client timeout. The service is isolated, so moving to a real queue later only
  touches the controller.

## Frontend

- `api.js`: `extractDocument(petId, docId)`, `applyExtraction(petId, docId, payload)`
- MedicalRecordsScreen: "Extract info" action per document row; "✨ Reviewed" badge when done
- New `ExtractionReviewSheet` modal: grouped checklist, inline-editable fields,
  `matches_pet === false` warning banner, Apply button with count, empty-state for
  documents with no medical data
- DataContext: merge records returned by Apply (no refetch)

## Cost & model

Per document ≈ 2–4K input tokens + 500–800 output:

| Model | $/MTok in/out | ≈ per document |
|---|---|---|
| Claude Opus 4.8 (default) | $5 / $25 | ~$0.03–0.05 |
| Claude Sonnet 4.6 | $3 / $15 | ~$0.02–0.03 |
| Claude Haiku 4.5 | $1 / $5 | ~$0.005–0.01 |

Default Opus 4.8 (handwritten notes, dense invoices, skewed photos; wrong-dose extraction is
a high-cost error). `ANTHROPIC_MODEL` knob allows A/B against Sonnet/Haiku on real documents
later. `thinking: adaptive` on. Spend bounded by throttle + one-extraction-per-document cache.

## Security & privacy

- Both endpoints use the standard pet-access chain; extraction columns not fillable.
- API key server-side only; the mobile app never talks to Anthropic directly.
- Document bytes go to the Claude API — disclose in privacy policy. Send only the file +
  pet first name/species/breed; no owner account data. Anthropic API does not train on
  customer content by default.
- Model output treated as untrusted input: sanitation pass + Apply validation mandatory.

## Failure modes

| Failure | Handling |
|---|---|
| API timeout / 529 | SDK auto-retries; then `extraction_status=failed`, UI "Try again" |
| Non-medical document | Valid JSON, empty arrays → "no data found", status `done` |
| Wrong pet's document | `matches_pet=false` → warning banner, user decides |
| Illegible fields | `null` over guessing → manual fill before Apply |
| Double-tap extract | `done` → return stored payload (idempotent + free) |
| Apply twice | Dedup rules make it idempotent |

## Testing

`ExtractionTest.php` with the Anthropic call mocked (no live API in CI): owner/co-owner can
extract, outsider 404s, Apply creates correctly-scoped rows, Apply idempotent, payload
smuggling (`pet_id`/`id`) rejected, failed call → `failed` status with no partial rows.
Manual QA on real documents (vaccination card photo, multi-page invoice PDF, handwritten note).

## Build order

| Phase | Scope | Size |
|---|---|---|
| 1 | Migration + SDK + DocumentExtractor + extract endpoint + tests | ~1 day |
| 2 | Apply endpoint with dedup + tests | ~0.5 day |
| 3 | Review sheet UI + DataContext wiring | ~1–1.5 days |
| 4 | Real-document QA + prompt tuning | ~0.5 day |

Open decisions: auto-fill `suggested_title`/category by default (leaning yes, with
user-untickable flags); extraction on-demand per document for v1 (not auto-on-upload) to
keep cost user-initiated.
