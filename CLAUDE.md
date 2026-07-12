# PawPawCare

Pet health management app: **`frontend/`** is an Expo SDK 57 React Native app (React Navigation — not expo-router; StyleSheet + design tokens in `frontend/src/theme/index.js` — not NativeWind; custom fetch client `frontend/src/services/api.js` with JWT auto-refresh; global store `frontend/src/context/DataContext.js`). UI follows the "Direction 1g" redesign (Claude Design project "PawPawCare app review"): use only the `ui`/`type`/`radii`/`PET_COLOR_PAIRS` theme exports and the shared kit in `frontend/src/components/` (Card, ListRow, StatusRing, StatusPill, Chip, SegmentedControl, Button, Sheet, ConfirmDialog, Toast/showToast, UpNextCard) — one `#8a5300` accent, 1px borders instead of shadows, status rendered exactly once, deletes only behind ConfirmDialog. **`backend/`** is a Laravel 13 REST API (JWT HS256 with refresh rotation, snake_case JSON, routes at root — no `/api` prefix).

## Commands

- Frontend: `cd frontend && npm test` (Jest), `npm start` (Expo dev server), `npm run build:dev|build:preview|build:prod` (EAS), `npm run update` (EAS Update), `npx expo-doctor`.
- Backend: `cd backend && composer dev` (serve + queue + logs), `php artisan test` (PHPUnit), Pint auto-formats PHP edits via hook.
- Versioning: `cd frontend && npm run version:patch|minor|major` (syncs app.json).

## Environments

- Production API: **https://api.pawpawcare.app** (Laravel on Namecheap cPanel — see `docs/deploy-backend.md`). Marketing site: **https://pawpawcare.app** (Netlify, deployed from `website/`). Store/preview builds get the API URL from `eas.json` env; local dev uses `frontend/.env.local`.

## CI/CD

**GitHub Actions in `.github/workflows/` is the canonical CI/CD — do not create `.eas/workflows/`.** `ci.yml` (tests), `ota-update.yml` (EAS Update on main), `preview-build.yml` (preview branch), `production-release.yml` (version tags), `deploy-backend.yml` (SSH deploy of `backend/` to the cPanel host on merge to main — see `docs/deploy-backend.md` §7). When editing the EAS steps in these workflows, consult the `expo:expo-cicd-workflows` skill for EAS CLI semantics only — output stays in GitHub Actions.

## Expo skill routing

Invoke the matching skill BEFORE doing the work:

| When the task involves… | Use |
|---|---|
| Upgrading Expo SDK / dependency conflicts / expo-doctor failures | `expo:upgrading-expo` |
| Adding any third-party library or service integration | `expo:expo-examples` + the Expo MCP `add_library` tool |
| Any network request, API call, caching, offline, React Query work | `expo:native-data-fetching` |
| Building/refactoring screens, navigation, animations, styling | `expo:building-native-ui` (+ `impeccable` for polish) |
| Native-feeling controls (sheets, menus, pickers, settings forms) | `expo:expo-ui` (in use: `@expo/ui/community/datetime-picker` replaced `@react-native-community/datetimepicker` on all four picker screens) |
| EAS builds, store submission, versioning, eas.json, TestFlight/Play | `expo:expo-deployment` + Expo MCP `build_*` tools |
| Dev builds / Expo Go limitations | `expo:expo-dev-client` |
| OTA update health, rollout monitoring, embedded-vs-OTA split | `expo:eas-update-insights` |
| Running/testing on iOS (Windows dev machine — no local iOS simulator) | `expo:eas-simulator` |
| App performance, launch time, TTI, per-route metrics | `expo:expo-observe` (wired: `ObserveRoot`/`ObserveNavigationContainer` in App.js, `markInteractive` on entry screens; query with `eas observe:*`) |
| Expo docs lookup (don't guess API details from memory) | Expo MCP `learn` / `read_documentation` tools |

**Not applicable to this repo** (don't reach for them): `add-app-clip`, `expo-brownfield`, `use-dom`, `web-to-native`, `expo-api-routes` (no expo-router), `expo-module`, `expo-tailwind-setup` (StyleSheet + theme tokens is the chosen styling system).

## React Query migration (in progress)

Data fetching is migrating from `DataContext` to `@tanstack/react-query`, one domain per PR. Pattern (pilot: pets / `PetsListScreen`):

1. Query keys live in `frontend/src/hooks/queryKeys.js`; domain hooks in `frontend/src/hooks/` (see `usePets.js`) reuse the `services/api.js` client and the mappers exported from `DataContext.js`.
2. **Reads** migrate to `useQuery`; **writes stay in `DataContext`** until every reader of that domain has migrated — DataContext mutations invalidate the matching query key to keep both stores in sync.
3. Screens refetch on focus via `useRefetchOnFocus` to pick up edits from unmigrated screens.
4. Consult `expo:native-data-fetching` before extending. Remaining domains: dashboard, reminders, notifications, community, lost pets, invites, medical vault.

## Backend changes

After editing any backend controller, model, route, or migration, run the `security-reviewer` agent (IDOR, mass assignment, upload leaks, JWT bugs) — especially for pets, documents, vault, uploads, family sharing, or auth.

## TODO

- `frontend/eas.json` iOS submit credentials (`appleId`, `ascAppId`, `appleTeamId`) are placeholders — owner must fill them before the first `eas submit` to TestFlight.
