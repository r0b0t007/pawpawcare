# PawPawCare

Pet health management app: **`frontend/`** is an Expo SDK 54 React Native app (React Navigation — not expo-router; StyleSheet + design tokens in `frontend/src/theme/index.js` — not NativeWind; custom fetch client `frontend/src/services/api.js` with JWT auto-refresh; global store `frontend/src/context/DataContext.js`). **`backend/`** is a Laravel 13 REST API (JWT HS256 with refresh rotation, snake_case JSON, routes at root — no `/api` prefix).

## Commands

- Frontend: `cd frontend && npm test` (Jest), `npm start` (Expo dev server), `npm run build:dev|build:preview|build:prod` (EAS), `npm run update` (EAS Update), `npx expo-doctor`.
- Backend: `cd backend && composer dev` (serve + queue + logs), `php artisan test` (PHPUnit), Pint auto-formats PHP edits via hook.
- Versioning: `cd frontend && npm run version:patch|minor|major` (syncs app.json).

## CI/CD

**GitHub Actions in `.github/workflows/` is the canonical CI/CD — do not create `.eas/workflows/`.** `ci.yml` (tests), `ota-update.yml` (EAS Update on main), `preview-build.yml` (preview branch), `production-release.yml` (version tags). When editing the EAS steps in these workflows, consult the `expo:expo-cicd-workflows` skill for EAS CLI semantics only — output stays in GitHub Actions.

## Expo skill routing

Invoke the matching skill BEFORE doing the work:

| When the task involves… | Use |
|---|---|
| Upgrading Expo SDK / dependency conflicts / expo-doctor failures | `expo:upgrading-expo` |
| Adding any third-party library or service integration | `expo:expo-examples` + the Expo MCP `add_library` tool |
| Any network request, API call, caching, offline, React Query work | `expo:native-data-fetching` |
| Building/refactoring screens, navigation, animations, styling | `expo:building-native-ui` (+ `impeccable` for polish) |
| Native-feeling controls (sheets, menus, pickers, settings forms) | `expo:expo-ui` |
| EAS builds, store submission, versioning, eas.json, TestFlight/Play | `expo:expo-deployment` + Expo MCP `build_*` tools |
| Dev builds / Expo Go limitations | `expo:expo-dev-client` |
| OTA update health, rollout monitoring, embedded-vs-OTA split | `expo:eas-update-insights` |
| Running/testing on iOS (Windows dev machine — no local iOS simulator) | `expo:eas-simulator` |
| App performance, launch time, TTI, per-route metrics | `expo:expo-observe` — **requires SDK 55+ (per-route metrics SDK 56+ and React Navigation v7); blocked until the SDK upgrade** |
| Expo docs lookup (don't guess API details from memory) | Expo MCP `learn` / `read_documentation` tools |

**Not applicable to this repo** (don't reach for them): `add-app-clip`, `expo-brownfield`, `use-dom`, `web-to-native`, `expo-api-routes` (no expo-router), `expo-module`, `expo-tailwind-setup` (StyleSheet + theme tokens is the chosen styling system).

## Backend changes

After editing any backend controller, model, route, or migration, run the `security-reviewer` agent (IDOR, mass assignment, upload leaks, JWT bugs) — especially for pets, documents, vault, uploads, family sharing, or auth.

## TODO

- `frontend/eas.json` iOS submit credentials (`appleId`, `ascAppId`, `appleTeamId`) are placeholders — owner must fill them before the first `eas submit` to TestFlight.
- `expo-observe` metrics: blocked on upgrading to Expo SDK 55+ (56+ and React Navigation v7 for per-route metrics). Use `expo:upgrading-expo` when tackling the upgrade, then `expo:expo-observe`.
