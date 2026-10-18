# Deploying the Laravel backend to Namecheap shared hosting (cPanel)

Production API lives at **https://api.pawpawcare.app**. The marketing site
(`pawpawcare.app`) is on Cloudflare Pages (`docs/deploy-website-cloudflare.md`);
this document covers only the backend.

## 0. Prerequisite — PHP version

cPanel → **Select PHP Version**. Laravel 13 requires **PHP ≥ 8.3**
(local/Docker run 8.4). Pick 8.4 if offered, else 8.3, and enable these
extensions in the same screen: `pdo_mysql`, `mbstring`, `zip`, `bcmath`,
`fileinfo`, `curl`, `openssl`. If the plan tops out below 8.3, this hosting
cannot run the backend — use a VPS instead.

## 1. Get the code onto the server

cPanel → **Git Version Control** → *Create*:

- Clone URL: `https://github.com/r0b0t007/pawpawcare.git`
- Repository path: `/home/<CPANEL_USER>/pawpawcare`

(Or over SSH: `ssh <CPANEL_USER>@<server> ; git clone … ~/pawpawcare`.)

Then install dependencies over SSH (Terminal is also in cPanel):

```sh
cd ~/pawpawcare/backend
composer install --no-dev --optimize-autoloader
```

## 2. Create the subdomain and point its document root

The document root MUST be `backend/public` — never the repo or backend root,
or `.env`, `storage/`, and the database credentials become downloadable.

cPanel (Jupiter theme) → **Domains** → **Create a New Domain**:

1. **Domain**: `api.pawpawcare.app`
2. **Untick** "Share document root with …" — that checkbox is the trap; leaving
   it ticked serves the main site's folder.
3. **Document Root**: `/home/<CPANEL_USER>/pawpawcare/backend/public`
   (type the path; the field usually pre-fills `api.pawpawcare.app` — replace it)
4. Submit.

On older cPanel themes the same screen is called **Subdomains**: enter
`api` as the subdomain, choose `pawpawcare.app`, and set the Document Root
field to the same `pawpawcare/backend/public` path.

To verify: cPanel → Domains list should show `api.pawpawcare.app` with the
`…/backend/public` root. Visiting the URL before DNS + SSL are done will fail;
that's expected — finish steps 3–4 first.

## 3. DNS

`pawpawcare.app`'s DNS is on Cloudflare (manage it with the `cf` CLI). The
API needs one record, **DNS-only (unproxied)**:

| Type  | Host | Value |
|-------|------|-------|
| A     | `api` | `<hosting server IP>` (cPanel right sidebar → "Shared IP Address") |

The apex and `www` belong to Cloudflare Pages (`docs/deploy-website-cloudflare.md`).
Keep `api` unproxied: the backend reads the client IP from `REMOTE_ADDR` and
trusts no proxy headers, so proxying it would put every client behind a few
Cloudflare IPs for rate limiting.

## 4. HTTPS (mandatory)

`.app` is an HSTS-preloaded TLD — browsers refuse plain HTTP. After DNS
resolves, cPanel → **SSL/TLS Status** → Run AutoSSL for `api.pawpawcare.app`.
Confirm `https://api.pawpawcare.app/health` returns `{"status":"ok"}` before
pointing any build at it.

## 5. Production .env

`cd ~/pawpawcare/backend && cp .env.example .env`, then set:

```ini
APP_ENV=production
APP_DEBUG=false            # debug pages leak secrets — never true in prod
APP_URL=https://api.pawpawcare.app   # signed share/care links derive from this
APP_KEY=                   # php artisan key:generate

DB_CONNECTION=mysql        # create DB + user in cPanel → MySQL Databases
DB_HOST=127.0.0.1
DB_DATABASE=<cpaneluser>_pawpawcare
DB_USERNAME=<cpaneluser>_paw
DB_PASSWORD=<strong password>

# JWT signing key — the variable is SECRET_KEY (config/jwt.php). It MUST
# replace the .env.example placeholder: anyone with the key can mint a login
# token for any user. Outside local/testing the API refuses to issue or accept
# any token if it's the placeholder, under 32 chars, or missing (falling back
# to APP_KEY): sign-in returns 503, /health returns 503 and the reason is in
# storage/logs/laravel.log. deploy-backend.yml also checks this before changing
# anything and aborts the deploy. Generate one with: openssl rand -base64 48
SECRET_KEY=<fresh random string, ≥ 32 chars — do NOT reuse the dev value>
ANTHROPIC_API_KEY=<key>    # AI document intake

QUEUE_CONNECTION=sync      # start simple; see cron section to move to database

# Email (password-reset and verification codes, support forwards) over SMTP
# through a cPanel mailbox (cPanel → Email Accounts). SPF (include:spf.web-hosting.com)
# and DKIM (default._domainkey) for pawpawcare.app already cover this server.
# With a `log` mailer, MAIL_HOST left at 127.0.0.1 or blank, or a placeholder
# From, the codes are silently not sent. In production that logs "Email not
# delivered: …" as an error, at most once per 10 minutes per cause, so it is a
# signal, not a count. It reaches Sentry only with LOG_STACK=single,sentry.
MAIL_MAILER=smtp
MAIL_SCHEME=smtps
MAIL_HOST=server215.web-hosting.com
MAIL_PORT=465
MAIL_USERNAME=no-reply@pawpawcare.app
MAIL_PASSWORD=<the mailbox password>
MAIL_FROM_ADDRESS=no-reply@pawpawcare.app
MAIL_FROM_NAME=PawPawCare
SUPPORT_INBOX=<your inbox>  # optional: forwards in-app "Contact us" messages
```

After `config:cache`, check the config and the SMTP login (deploy-backend.yml
runs this on every deploy), and optionally send yourself a real email:

```sh
php artisan mail:check
php artisan mail:check --send-to=you@example.com
```

Then:

```sh
php artisan key:generate
php artisan migrate --force
php artisan db:seed --class=GroupSeeder --force   # the built-in community groups: adds only the missing ones
php artisan storage:link          # serves uploaded photos while they're on the local disk (see docs/uploads-r2.md)
php artisan config:cache && php artisan route:cache
```

## 6. Cron jobs (no Supervisor on shared hosting)

cPanel → **Cron Jobs** (use the PHP binary matching step 0, e.g.
`/usr/local/bin/ea-php84` — cPanel lists it):

```
* * * * * cd ~/pawpawcare/backend && php artisan schedule:run >> /dev/null 2>&1
```

If/when `QUEUE_CONNECTION=database` is enabled, add:

```
* * * * * cd ~/pawpawcare/backend && php artisan queue:work --stop-when-empty --max-time=55 >> /dev/null 2>&1
```

## 7. Deploying updates — automated via GitHub Actions

`.github/workflows/deploy-backend.yml` deploys automatically on every push to
`main` that touches `backend/`: PHPUnit runs first, then the workflow SSHes in,
updates the checkout, installs prod dependencies, migrates, re-caches config/
routes, and verifies `https://api.pawpawcare.app/health` returns ok. Manual
runs: GitHub → Actions → "Deploy Backend" → Run workflow.

### One-time setup

1. **Enable SSH + authorize a deploy key.** On this machine:

   ```sh
   ssh-keygen -t ed25519 -f pawpaw-deploy -C "github-deploy" -N '""'
   ```

   cPanel → **SSH Access** → *Manage SSH Keys* → *Import Key* → paste the
   contents of `pawpaw-deploy.pub` → back on the key list, **Manage →
   Authorize** (an imported-but-unauthorized key is silently rejected).

2. **GitHub secrets** (repo → Settings → Secrets → Actions, or `gh secret set`):

   | Secret | Value |
   |---|---|
   | `DEPLOY_SSH_HOST` | server hostname or Shared IP (cPanel sidebar) |
   | `DEPLOY_SSH_USER` | cPanel username |
   | `DEPLOY_SSH_PORT` | `21098` (Namecheap shared SSH port — not 22) |
   | `DEPLOY_SSH_KEY`  | contents of the **private** `pawpaw-deploy` file |

3. **Optional GitHub variables** (Settings → Variables → Actions):
   `DEPLOY_PATH` if the repo isn't at `~/pawpawcare`; `PHP_BIN` if the SSH
   shell's default `php -v` is older than the domain's PHP (Namecheap CLI
   binaries live at `/opt/alt/php85/usr/bin/php` and similar — run
   `ls /opt/alt/ | grep php` over SSH to see what's installed).

4. **Test the key from this machine before trusting CI:**

   ```sh
   ssh -i pawpaw-deploy -p 21098 <CPANEL_USER>@<HOST> 'php -v && cd ~/pawpawcare && git status'
   ```

Sections 1–6 (initial clone, subdomain, .env, cron) remain a one-time manual
setup; the workflow only handles updates.

### Manual fallback

```sh
cd ~/pawpawcare && git pull
cd backend && composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache && php artisan route:cache
```

**Built-in community groups.** Neither the workflow nor this fallback seeds
them; they are added once at first setup (§5). When a group is added to
`GroupSeeder::DEFAULT_GROUPS`, run `php artisan db:seed --class=GroupSeeder --force`
after that deploy. It adds only the missing groups (by `translation_key`, which is
unique) and never changes an existing one, so ids and memberships are kept.

## 8. Client configuration that depends on this API

- `frontend/eas.json`: `preview` and `production` build profiles set
  `EXPO_PUBLIC_API_URL=https://api.pawpawcare.app`.
- GitHub Actions secret `BACKEND_URL` must equal `https://api.pawpawcare.app`
  (used by `.github/workflows/ota-update.yml` when publishing OTA bundles).
- Local development is unaffected: `frontend/.env.local` keeps pointing at the
  LAN/localhost server.
