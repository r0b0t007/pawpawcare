# PawPawCare

A mobile app for managing pet health — vaccinations, activities, favorite foods, and a community feed. Built with React Native (Expo) and a Laravel 13 REST API backend.

---

## Project structure

```
pawpawcare/
├── frontend/               # React Native app (Expo SDK 54)
│   ├── src/
│   │   ├── config.js       # API base URL — edit this for your environment
│   │   ├── context/        # AuthContext + DataContext (state management)
│   │   ├── navigation/     # Stack + bottom tab navigators
│   │   ├── screens/        # All app screens
│   │   ├── services/       # API client with JWT auto-refresh
│   │   └── theme/          # Design tokens (colors, typography, spacing)
│   ├── App.js
│   ├── app.json            # Expo + EAS config
│   ├── eas.json            # Build profiles (dev / preview / production)
│   └── scripts/
│       └── bump-version.js # Version bump helper
├── backend/                # Laravel 13 REST API
│   ├── app/
│   │   ├── Http/
│   │   │   ├── Controllers/ # Auth / User / Pet / Community / Dashboard
│   │   │   └── Middleware/   # JwtAuth (Bearer token guard)
│   │   ├── Models/          # Eloquent models (User, Pet, Vaccination, …)
│   │   └── Services/        # JwtService (access + refresh tokens)
│   ├── routes/api.php       # All API routes (mounted at root, no /api prefix)
│   ├── database/
│   │   ├── migrations/      # Schema
│   │   └── seeders/         # Default community groups
│   ├── config/jwt.php       # Token settings
│   ├── composer.json
│   ├── Dockerfile
│   └── docker-compose.yml   # MySQL + API
├── design/                 # Original HTML mockups and design specs
└── .github/workflows/      # CI/CD pipelines
    ├── ota-update.yml      # Push to main → OTA update (no store review)
    ├── preview-build.yml   # Push to preview → APK + IPA for testers
    └── production-release.yml  # Tag v* → build + submit to stores
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| PHP | 8.2+ | [php.net](https://php.net) (or [XAMPP](https://www.apachefriends.org)) |
| Composer | 2+ | [getcomposer.org](https://getcomposer.org) |
| MySQL / MariaDB | 8+ / 10.4+ | bundled with XAMPP, or [mysql.com](https://mysql.com) |
| Expo Go | latest | App Store / Google Play |
| EAS CLI | latest | `npm install -g eas-cli` |

---

## Running locally

### 1. Backend

```bash
cd backend

# Install PHP dependencies
composer install

# Configure environment
cp .env.example .env
php artisan key:generate

# Create the database (MySQL/MariaDB). With XAMPP running:
#   mysql -u root -e "CREATE DATABASE pawpawcare CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
# Then adjust DB_* values in .env if your credentials differ.

# Run migrations + seed the default community groups
php artisan migrate --seed

# Link public storage so uploaded images (pet photos, post images) are served
php artisan storage:link

# Start the API server (bind 0.0.0.0 so devices/emulators can reach it)
php artisan serve --host=0.0.0.0 --port=8000
# → Running at http://0.0.0.0:8000
# → Health check at http://localhost:8000/health
```

#### Reminders scheduler

Vaccination & custom reminders are delivered primarily as on-device local
notifications, with a server-side push backstop. The backstop needs the Laravel
scheduler running:

```bash
# Local dev — run alongside the server:
php artisan schedule:work

# Production — add ONE cron entry:
# * * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1
```

> **Push on real devices:** remote push requires an Expo **development build**
> (`npm run build:dev`) — Expo Go (SDK 53+) doesn't support it. Local
> notifications work in Expo Go, so reminders are testable without a build.
> Run `php artisan reminders:backfill-vaccinations` once to create reminders for
> vaccinations that already existed before this feature.

> **Windows firewall:** If other devices need to reach the backend, allow port 8000 in an Admin PowerShell:
> ```powershell
> New-NetFirewallRule -DisplayName "PawPawCare Backend" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
> ```

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start Expo
npx expo start
# → Scan the QR code with Expo Go on your phone
```

### 3. Connecting a physical Android/iOS device

Android 9+ blocks plain HTTP (`http://`) in apps. You must expose the backend over **HTTPS** using a tunnel.

**Step 1 — expose the backend via HTTPS tunnel** (in a separate terminal, while backend is running):

```bash
npx localtunnel --port 8000
# → your url is: https://some-name.loca.lt
```

**Step 2 — update `frontend/src/config.js`** with the tunnel URL:

```js
export const API_URL = 'https://some-name.loca.lt';
```

**Step 3 — unblock the tunnel on your phone:** open `https://some-name.loca.lt` in your phone's browser once. If a "tunnel reminder" page appears, click **"Click to Continue"**. This whitelists your device IP for the session.

**Step 4 — reload the app** — press `r` in the Expo terminal.

> **Note:** The tunnel URL changes every time you restart `localtunnel`. Update `config.js` each session.
> `config.js` is gitignored — no risk of accidentally committing a stale URL.

#### Other environments

| Target | `API_URL` value |
|---|---|
| Android emulator | `http://10.0.2.2:8000` |
| iOS simulator | `http://localhost:8000` |
| Physical device | HTTPS tunnel (see above) |

---

## Environment variables

### Backend — `backend/.env`

| Variable | Default | Description |
|---|---|---|
| `DB_CONNECTION` | `mysql` | Database driver (`mysql`, or `sqlite` for zero-setup dev) |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | Database host & port |
| `DB_DATABASE` | `pawpawcare` | Database name |
| `DB_USERNAME` / `DB_PASSWORD` | `root` / *(empty)* | Database credentials |
| `SECRET_KEY` | `change-me-...` | JWT signing key — **must be changed in production** (≥ 32 chars, e.g. `openssl rand -base64 48`); in production the API refuses to issue or accept tokens with the placeholder |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token lifetime |
| `ALLOWED_ORIGINS` | *(wildcard)* | Comma-separated CORS origins (lock down in prod) |

To use SQLite instead of MySQL (no DB server needed), set `DB_CONNECTION=sqlite`
and run `touch database/database.sqlite` before migrating.

### Frontend — `frontend/src/config.js`

| Variable | Description |
|---|---|
| `API_URL` | Base URL of the running backend (see table above) |

---

## Running with Docker (MySQL)

```bash
cd backend
cp .env.example .env        # set a strong SECRET_KEY
php artisan key:generate    # or set APP_KEY in .env
SECRET_KEY=$(openssl rand -base64 48) docker compose up --build   # starts MySQL + API (auto-migrates + seeds)
# → API at http://localhost:8000
```

---

## API reference

A health check is available when the backend is running:

- Health: `http://localhost:8000/health` → `{"status":"ok","version":"1.0.0"}`

All responses are JSON with snake_case fields; errors return `{"detail": "..."}`.
Authentication is via `Authorization: Bearer <access_token>` (JWT), with refresh-token
rotation at `POST /auth/refresh`.

### Endpoints summary

| Method | Path | Description |
|---|---|---|
| POST | `/auth/signup` | Create account |
| POST | `/auth/login` | Log in, receive tokens |
| POST | `/auth/refresh` | Rotate access token |
| POST | `/auth/logout` | Revoke refresh token |
| GET/PATCH | `/users/me` | Get / update profile |
| GET/POST | `/pets` | List / create pets |
| GET/PATCH/DELETE | `/pets/{id}` | Get / update / delete pet |
| GET/POST | `/pets/{id}/vaccinations` | List / add vaccinations |
| PATCH | `/pets/{id}/vaccinations/{id}/complete` | Mark administered |
| GET/POST/DELETE | `/pets/{id}/activities` | Activities |
| GET/POST/DELETE | `/pets/{id}/foods` | Favorite foods |
| GET/POST | `/community/posts` | Feed |
| POST | `/community/posts/{id}/paw` | Toggle paw reaction |
| GET | `/community/groups` | List groups |
| POST | `/community/groups/{id}/join` | Join / leave group |
| GET | `/dashboard` | Aggregated home screen data |

---

## Deployment & releases

### One-time EAS setup

```bash
npm install -g eas-cli
eas login
cd frontend
eas init    # creates your EAS project — paste the project ID into app.json
```

Add these secrets to **GitHub → Settings → Secrets → Actions**:

| Secret | Where to get it |
|---|---|
| `EXPO_TOKEN` | expo.dev → Account Settings → Access Tokens |
| `GOOGLE_SERVICE_ACCOUNT` | Google Play Console → Setup → API access (base64-encoded JSON) |
| `APPLE_ID` | Your Apple ID email |
| `ASC_APP_ID` | App Store Connect → App Information → Apple ID |
| `APPLE_TEAM_ID` | developer.apple.com → Membership |
| `APPLE_APP_SPECIFIC_PASSWORD` | appleid.apple.com → App-Specific Passwords |

### Release workflow

```bash
# JS-only fix — ships instantly, no store review
git push origin main                     # triggers OTA Update workflow

# Internal QA build (APK + IPA for testers)
git push origin preview                  # triggers Preview Build workflow

# Full store release
cd frontend
npm run version:patch                    # bumps 1.0.0 → 1.0.1
git add frontend/app.json frontend/package.json
git commit -m "chore: release v1.0.1"
git tag v1.0.1 && git push && git push --tags
# → triggers Production Release: build → submit → GitHub Release
```

### Manual builds

```bash
cd frontend
npm run build:dev      # development client
npm run build:preview  # internal testing APK/IPA
npm run build:prod     # production AAB + IPA
npm run submit:prod    # submit latest build to stores
npm run update         # push OTA update manually
```
