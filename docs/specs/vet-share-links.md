# Spec: Vet Share Links

## What it does

A read-only **web** link to a pet's medical summary that a vet (or sitter, or
emergency clinic) opens in any browser — no account, no app install. The owner
or a co-owner taps "Share with vet", picks an expiry, and hands over a link to
vaccinations, active medications, weight trend, clinics, and recent documents.

This is the medical vault's data flowing back *out*: paper record → vault →
AI-extracted structured data → a clean summary the vet can actually read.

## Trust model

Same signed-URL pattern as `documents.raw`:

- **Mint** (`POST /pets/{pet}/share-link`, JWT-guarded) does the pet access
  check (`Pet::accessibleBy` — owner + co-owner) and returns a
  `URL::temporarySignedRoute` link.
- **Page** (`GET /share/{pet}`, no JWT) is gated only by the URL signature +
  expiry. The signature is the authorization.
- Documents on the page get their own signed URLs minted against the *page's*
  expiry, so they die exactly when the share link does (not on the usual
  5-minute document clock).

Expiry choices: `1h` / `24h` (default) / `7d`.

## Revocation

Each pet has a `share_token` (guarded column, never fillable). Every link
embeds the current token in its signed query string. Revoking
(`DELETE /pets/{pet}/share-link`) rotates the token, so all outstanding links —
whose signatures are still valid — now carry a stale token and return **410
Gone**. Minting after a revoke regenerates against the new token.

**Known limitation:** a raw document URL a viewer already extracted from the
page remains valid until *its* expiry even after the share page is revoked
(it's an independent signature). The primary surface — the summary page — is
fully revocable; deep-linked document blobs expire on their own clock (≤ 7d).

## Backend

- `PetShareController` — `create` / `revoke` (JWT) + `show` (signed)
- `resources/views/share.blade.php` — the rendered page (first Blade view in
  this API-only app). Auto-escaped throughout; `X-Robots-Tag: noindex` +
  `<meta robots>` to keep medical pages out of search.
- Weight history renders as an inline SVG polyline sparkline (index-spaced —
  a glanceable trend, not a precise time-series).
- Migration: `pets.share_token` (nullable, set server-side on first mint).

## Frontend

- `createShareLink(petId, expiresIn)` / `revokeShareLinks(petId)` in DataContext
- "Share with vet" row on PetProfile → `VetShareModal`: expiry chips →
  Create & Share (hands the URL to the native OS share sheet) → link preview
  with re-share, plus a "Revoke all active links" action.
- The link is never persisted client-side — shared straight from the create
  response.

## Security

- Both mutating endpoints behind `Pet::accessibleBy` (outsiders 404)
- `share_token` guarded — a pet update can't rotate it (tested)
- No owner identity (name/email/id) on the page (tested)
- Tampered links 403 (signature), revoked links 410 (token)

## Tests

`ShareLinkTest` — 14 tests / 52 assertions: mint (owner/co-owner/outsider/bad
expiry/expiry-window mapping), render (full + empty state), no-PII, tamper +
expiry rejection, document-link lifecycle, revocation (invalidate / re-mint /
outsider / mass-assignment guard).

## Possible follow-ups

- "Download PDF" on the share page (dompdf) — doubles as an insurance-claim export
- Per-link audit (when/by-whom minted, last-opened) if links proliferate
