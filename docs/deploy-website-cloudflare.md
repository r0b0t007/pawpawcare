# Deploying the marketing site to Cloudflare Pages

Migration off Netlify for `website/`. This document is the manual runbook —
everything here needs your own Cloudflare/Resend accounts and cannot be
scripted by an agent.

## ⚠️ Do not merge `migrate/cloudflare-pages` into `main` yet

`main` still auto-deploys to **Netlify** (git-connected, see
`docs/deploy-marketing-website.md` in memory / commit history). This branch
changes both waitlist forms to POST to `/api/waitlist`, a route that only
exists as a **Cloudflare Pages Function** — Netlify has no handler for it and
would 404 every signup. Merge only after Cloudflare Pages is live and
receiving real traffic (Step 6+), or add the route back to Netlify first if
you want a slower rollout.

## What's already built (this branch)

- `website/functions/api/waitlist.js` — Pages Function that replaces Netlify Forms.
  Validates the honeypot + email server-side, then emails a notification via
  [Resend](https://resend.com) and redirects to `/thanks.html` (same UX as
  before, no JS required). Tested locally with `wrangler pages dev` against
  all four paths (happy path, honeypot, invalid email, missing config) —
  confirmed the honeypot short-circuits, invalid emails bounce back to
  `/#waitlist`, and a bad API key logs Resend's real `401 validation_error`
  response while still redirecting the visitor to `/thanks.html`.
- `wrangler.toml` — points Wrangler at `website/` as the Pages output dir.
- `website/index.html` — both waitlist forms now `action="/api/waitlist"`
  (previously `data-netlify="true"` + `netlify-honeypot`).
- `website/_headers` (unchanged) — Cloudflare Pages reads this file in the
  same format Netlify does, confirmed via `wrangler pages dev` ("Parsed 6
  valid header rules").
- `.github/workflows/deploy-website-cloudflare.yml` — mirrors the existing
  `deploy-backend.yml`/`indexnow.yml` pattern: deploys on push to `main`
  touching `website/**`. **Disabled until you add the two repo secrets in
  step 5** (it will fail loudly otherwise, which is fine — nothing merges to
  `main` until then anyway).

**Gotcha found while testing against the real Cloudflare account (not just
`wrangler pages dev`):** `wrangler pages deploy <dir>` does **not** bundle
`<dir>/functions/` itself — it only routes to a Function if a pre-built
`_worker.js` already sits in `<dir>`. Deploying without building first
silently "succeeds" and serves the Function's own path as a plain 200
static-asset response instead of running it (confirmed: `GET /api/waitlist`
returned `200` instead of the Function's `302`). The fix is to always run
`wrangler pages functions build` immediately before `wrangler pages deploy`
— both the manual command below and the CI workflow do this. Also:
`website/functions/` must live **inside** the deployed directory (not at the
repo root) — the repo-root convention only applies to Cloudflare's own
git-integrated dashboard builds and to `wrangler pages dev`'s
`pages_build_output_dir` resolution, not to direct CLI deploys.

## Manual steps (in order)

### 1. Authenticate Wrangler

```
wrangler login
```

Opens a browser OAuth consent screen — only you can approve it.

### 2. Create the Pages project

```
wrangler pages project create pawpawcare-website --production-branch=main
```

### 3. Get a Resend API key

[resend.com/api-keys](https://resend.com/api-keys) → create a key scoped to
"Sending access". The backend already references `RESEND_API_KEY` in
`backend/config/services.php` (Laravel's mail transport) — check whether a
Resend account/domain already exists for this project before creating a new
one, and reuse it if so.

### 4. Verify a sending domain in Resend

Resend requires a verified domain to send from (no anonymous/sandbox
sending — see [resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction)).
Add `pawpawcare.app` (or a subdomain like `mail.pawpawcare.app`) in the
Resend dashboard and add the TXT/CNAME records it gives you at your DNS
provider (Namecheap, per `docs/deploy-backend.md`). This is additive — it
does not touch or remove any existing DNS record.

### 5. Set the three config values

Repo secrets (for the GitHub Action) and Pages secrets (for the live
Function) are separate — you need both:

```
# GitHub Actions (used by .github/workflows/deploy-website-cloudflare.yml)
gh secret set CLOUDFLARE_API_TOKEN      # from dash.cloudflare.com/profile/api-tokens, "Edit Cloudflare Workers" template
gh secret set CLOUDFLARE_ACCOUNT_ID     # from the Cloudflare dashboard sidebar

# Cloudflare Pages Function secrets (used by website/functions/api/waitlist.js)
wrangler pages secret put RESEND_API_KEY   --project-name=pawpawcare-website
wrangler pages secret put WAITLIST_FROM    --project-name=pawpawcare-website   # e.g. "PawPawCare <waitlist@pawpawcare.app>"
wrangler pages secret put WAITLIST_TO      --project-name=pawpawcare-website   # inbox that receives each signup
```

### 6. First deploy (manual, to test before wiring CI)

Build the Function bundle, then deploy — **both commands, every time** (see
the gotcha above):

```
wrangler pages functions build website/functions --outdir website/_worker.js --output-routes-path website/_routes.json --compatibility-date=2026-08-30
wrangler pages deploy website --project-name=pawpawcare-website --branch=main
```

This prints a `*.pages.dev` preview URL. Test the waitlist form there end to
end before touching DNS — this repo's own test run confirmed all four paths
(valid email, honeypot, invalid email, missing secrets) behave correctly
against the live Cloudflare project, not just `wrangler pages dev`.

### 7. Add the custom domain

In the Cloudflare dashboard → Pages → `pawpawcare-website` → Custom domains
→ add `pawpawcare.app` and `www.pawpawcare.app`. Cloudflare will show either
a CNAME record to add (if the zone stays with your current DNS host) or ask
you to move the zone's nameservers to Cloudflare (if you want full Cloudflare
DNS). **Either path changes production DNS for the whole domain — confirm
this won't disrupt `api.pawpawcare.app` (backend, on Namecheap/cPanel per
`docs/deploy-backend.md`) or any existing email records before proceeding.**

### 8. Cut over

Once `pawpawcare.app` resolves to Cloudflare Pages and you've verified the
site + waitlist form live at the real domain, merge `migrate/cloudflare-pages`
into `main`. From then on, `deploy-website-cloudflare.yml` keeps it in sync
automatically.

### 9. Decommission Netlify (optional, your call)

Netlify site `pawpawcare-app` (siteId `c57e434e-0991-4a8b-9e80-044af3fe5565`)
can stay connected as a fallback for a while, or be unlinked from the repo
once you're confident in the Cloudflare deploy. No urgency either way since
DNS determines which one visitors actually reach.

## Known limitation

The waitlist Function sends two Resend emails per signup — a notification
to `WAITLIST_TO` and the branded welcome email to the visitor
(`website/functions/_lib/welcome-email.js`, From = `WAITLIST_FROM`, replies
and removal requests to `hello@pawpawcare.app`, logo served from
`website/email/` with CORP detached in `_headers`). If Resend has an outage,
the visitor still sees "you're on the list" but neither email is sent (logged as an error in `wrangler pages deployment tail`
instead). This mirrors the original Netlify Forms failure mode. If durable
storage matters more than simplicity, a follow-up could write to a Cloudflare
KV namespace or D1 table before calling Resend.
