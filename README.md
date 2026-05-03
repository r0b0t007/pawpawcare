# PawPawCare

A mobile app for managing pet health — vaccinations, activities, favorite foods, and a community feed. Built with React Native (Expo) and a Python FastAPI backend.

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
├── backend/                # Python FastAPI REST API
│   ├── app/
│   │   ├── main.py         # App entry point, CORS, routers
│   │   ├── models.py       # SQLAlchemy models
│   │   ├── schemas.py      # Pydantic request/response schemas
│   │   ├── security.py     # JWT + bcrypt
│   │   ├── seed.py         # Default community groups
│   │   └── routers/        # auth / users / pets / community / dashboard
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── run_dev.py          # Local dev runner (SQLite, no Docker needed)
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
| Python | 3.12+ | [python.org](https://python.org) |
| Expo Go | latest | App Store / Google Play |
| EAS CLI | latest | `npm install -g eas-cli` |

---

## Running locally

### 1. Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment (SQLite by default — no database install needed)
cp .env.example .env

# Start the API server
python run_dev.py
# → Running at http://0.0.0.0:8000
# → Docs at  http://localhost:8000/docs
```

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
| `DATABASE_URL` | `sqlite+aiosqlite:///./pawpawcare.db` | SQLite (dev) or PostgreSQL (prod) |
| `SECRET_KEY` | `local-dev-secret-key-...` | JWT signing key — **change in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token lifetime |

To use PostgreSQL instead of SQLite, set:
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/pawpawcare
```

### Frontend — `frontend/src/config.js`

| Variable | Description |
|---|---|
| `API_URL` | Base URL of the running backend (see table above) |

---

## Running with Docker (PostgreSQL)

```bash
cd backend
cp .env.example .env        # set a strong SECRET_KEY
docker compose up --build   # starts PostgreSQL + API
# → API at http://localhost:8000
```

---

## API reference

Interactive docs are available when the backend is running:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

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
