# Deploying the Laravel backend to Namecheap shared hosting (cPanel)

Production API lives at **https://api.pawpawcare.app**. The marketing site
stays on Netlify (`pawpawcare.app`); this document covers only the backend.

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

Where the domain's DNS is managed (Namecheap → Domain List → **Advanced DNS**
if using Namecheap BasicDNS):

| Type  | Host | Value |
|-------|------|-------|
| A     | `api` | `<hosting server IP>` (cPanel right sidebar → "Shared IP Address") |
| A     | `@`   | `75.2.60.5` (Netlify — marketing site) |
| CNAME | `www` | `pawpawcare-app.netlify.app` |

If instead the domain's nameservers point at the hosting package, cPanel
creates the `api` record automatically when the subdomain is created — but
then the apex/`www` records for Netlify must be added in cPanel → Zone Editor.

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

JWT_SECRET=<fresh long random string — do NOT reuse the dev value>
ANTHROPIC_API_KEY=<key>    # AI document intake

QUEUE_CONNECTION=sync      # start simple; see cron section to move to database
```

Then:

```sh
php artisan key:generate
php artisan migrate --force
php artisan storage:link          # serves uploaded pet photos/documents
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

## 7. Deploying updates

```sh
cd ~/pawpawcare && git pull
cd backend && composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan config:cache && php artisan route:cache
```

(cPanel Git Version Control → "Pull or Deploy" does the git part with a click.)

## 8. Client configuration that depends on this API

- `frontend/eas.json`: `preview` and `production` build profiles set
  `EXPO_PUBLIC_API_URL=https://api.pawpawcare.app`.
- GitHub Actions secret `BACKEND_URL` must equal `https://api.pawpawcare.app`
  (used by `.github/workflows/ota-update.yml` when publishing OTA bundles).
- Local development is unaffected: `frontend/.env.local` keeps pointing at the
  LAN/localhost server.
