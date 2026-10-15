# Android E2E testing with ARTEMIS

LLM-driven end-to-end testing of the Android app on a local emulator, using
[google/artemis](https://github.com/google/artemis) — Google's Pixel-Test-Engineering
framework that turns natural-language instructions ("log in, add a pet, set a
vaccine reminder") into real device actions over ADB.

**This complements `npm test`, it does not replace it.** Jest covers units;
ARTEMIS drives the built APK as a black box. It is nondeterministic and costs
Gemini tokens per step, so it is a pre-release smoke/exploratory tool — **do not
wire it into `ci.yml` as a gate.**

**Android only.** ARTEMIS has no iOS support (roadmap item only). iOS testing
stays on `expo:eas-simulator` / TestFlight.

## Where things live

ARTEMIS is **not** part of this repo. It is cloned as a sibling:

```
Code Projects/
├── pawpawcare/   ← this repo
└── artemis/      ← the framework + its .env, traces/ and pawpaw-emulator.ps1
```

Nothing in `artemis/` is tracked here. Its `.env` holds the Gemini key and is
covered by that repo's own `.gitignore`.

| Piece | Location |
|---|---|
| Android SDK (cmdline-tools only, no Android Studio) | `%LOCALAPPDATA%\Android\Sdk` |
| AVD | `pawpaw_test` — API 36, google_apis, x86_64, 3 GB RAM, 6 GB data |
| adb / scrcpy / JDK 17 | installed via `winget`, on the user PATH |
| Traces (steps, screenshots, SQLite) | `artemis/traces/` |

Disk cost is roughly 8 GB (SDK 5.6 GB + AVD 4.7 GB, and the AVD grows with use).

## One-time setup

Already done on the current dev machine; repeat only on a fresh box.

```powershell
winget install Google.PlatformTools Genymobile.scrcpy Microsoft.OpenJDK.17 Gyan.FFmpeg
git clone https://github.com/google/artemis.git   # as a sibling of pawpawcare/
cd artemis && uv sync
uv run artemis mcp --install claude               # registers the MCP server
uv run artemis doctor                             # should be all-green
```

Then put a **Gemini** key in `artemis/.env` as `GEMINI_API_KEY`
(https://aistudio.google.com/apikey). It must be Gemini specifically:
`config/artemis.jsonc` pins the `object_detector` node to
`gemini-robotics-er-2-preview`, and only Gemini ER models do sub-pixel
coordinate grounding. OpenAI/Anthropic keys will load but element targeting
degrades badly.

> **Do not paste the key into a Claude Code `!` command** — anything typed at
> that prompt lands in the session transcript. Edit the file directly.

`artemis mcp --install claude` writes to `~/.claude.json`, `~/.claude/rules/artemis.md`
**and** Claude Desktop's config. That rules file is global — it loads in every
project, not just this one. Delete it if that is unwanted; the MCP server still works.

## The emulator

```powershell
cd ../artemis
.\pawpaw-emulator.ps1          # start (no-op if already running)
.\pawpaw-emulator.ps1 -Stop
.\pawpaw-emulator.ps1 -Wipe    # factory reset; reinstall the APK afterwards
```

**Gotcha: the AVD must be launched with `-gpu swiftshader_indirect`.** The
default `-gpu auto` hangs before `sys.boot_completed` on this machine — the log
shows `Critical: Failed to load opengl32sw` followed by a software-OpenGL
fallback that never recovers, and `adb shell` hangs forever while `adb devices`
still cheerfully reports `device`. With swiftshader it cold-boots in ~2.5 min
and warm-boots in ~1 min. The helper script pins the flag and launches detached
so the emulator outlives the shell that started it.

## The `e2e` build profile

`preview` points at **production** (`https://api.pawpawcare.app`). An LLM
clicking around freely against that creates real pets, reminders and vault
entries. The `e2e` profile exists so test data stays on your laptop:

```bash
cd backend && php artisan serve --port=8080 --no-reload                    # terminal 1 (NOT 8000)
cd frontend && npx eas build --profile e2e --platform android # one build credit
adb install -r -g <downloaded.apk>
```

> **Android only:** build with `--platform android`, never `all`. An iOS build
> can't reach `10.0.2.2`, which is an Android-emulator alias, and ATS would
> block the plain HTTP anyway. The profile `extends` preview (internal APK,
> Google client IDs, `SENTRY_ALLOW_FAILURE`) and overrides only the channel,
> `ENVIRONMENT` and `EXPO_PUBLIC_API_URL`. It was committed in the 2026-10-15
> native build round (#134). Until then it lived only in local `eas.json`,
> because the runtime fingerprint hashes the whole of `eas.json`: any edit
> there moves the production and preview runtimes.

`EXPO_PUBLIC_API_URL` is **`http://10.0.2.2:8080`** — note the port. `10.0.2.2` is
the emulator's alias for the **host's loopback**, so `php artisan serve` bound to
`127.0.0.1` is reachable as-is; no `--host=0.0.0.0` needed.

> **⚠️ Laravel must NOT use its default port 8000 for e2e runs — ARTEMIS owns it.**
>
> ARTEMIS's admin console binds 8000 and auto-starts behind `artemis run` and
> `artemis doctor`, and `artemis/config/runtime.py` **hardcodes**
> `http://127.0.0.1:8000/api/status` for IPC discovery — there is no env override
> (`ARTEMIS_EDGE_PORT` does not move it, and `artemis ui --port` only moves the UI).
>
> When the two collide, ARTEMIS wins and **kills the Laravel process**, then
> answers the app's API calls itself. The symptom is baffling: the login screen
> shows **"Method Not Allowed"** (ARTEMIS returning 405 to `POST /auth/login`),
> `curl localhost:8000` returns a page so the API looks "up", and the Laravel
> process is silently gone. Keep Laravel on **8080** and this never happens.

### Database for e2e runs

`backend/.env` uses `DB_CONNECTION=mysql`, so MySQL must be running — but
pointing e2e at your dev MySQL means the LLM writes junk pets and reminders into
your real dev data. Prefer a throwaway SQLite file, overridden per-process so
nothing persistent changes (`*.sqlite*` is already gitignored):

```bash
cd backend
touch database/e2e.sqlite
DB_CONNECTION=sqlite DB_DATABASE="$(pwd)/database/e2e.sqlite" php artisan migrate --force
DB_CONNECTION=sqlite DB_DATABASE="$(pwd)/database/e2e.sqlite" php artisan serve --port=8080 --no-reload
```

Laravel's Dotenv loader is immutable, so real process env vars win over `.env`
without editing it. **Keep `--no-reload`:** without it, `artisan serve`
starts the real server as a child process and hands it only a short passthrough
list of `$_ENV` keys, so on a PHP install whose `variables_order` includes `E`
the `DB_*` overrides are dropped and the child reloads `.env`, writing the LLM's
junk into your dev MySQL after all. Delete `database/e2e.sqlite` to reset all test data.

Verify the emulator can actually reach it before spending LLM tokens — note that
the emulator image has no `curl` or `wget`, so use `toybox nc`:

```bash
adb shell "echo -e 'GET /health HTTP/1.0\r\nHost: 10.0.2.2\r\n\r' | toybox nc 10.0.2.2 8080"
# expect: HTTP/1.0 200 OK ... {"status":"ok","version":"1.0.0"}
```

### Why `app.config.js` exists

Android blocks cleartext HTTP in non-debug builds, so the e2e APK needs
`android:usesCleartextTraffic="true"` — which `expo-build-properties` sets on
the **whole `<application>` element**. Putting it in `app.json` would permit
cleartext in production too.

So `app.json` stays the static source of truth and `frontend/app.config.js`
spreads it through unchanged, adding the plugin *only* when `ENVIRONMENT=e2e`
(set per-profile in `eas.json`, and available when EAS evaluates the app config
both locally and on the builder). Neither `expo-build-properties` nor
`app.config.js` changes the production runtime: measured on 2026-10-15, the
Android fingerprint stays `e24a4c29` with both in place, and an
`ENVIRONMENT=e2e` build gets its own runtime. Verify after touching either file:

```bash
cd frontend
npx expo config --json | grep -c build-properties                 # 0
ENVIRONMENT=e2e npx expo config --json | grep -c build-properties # 1
npx expo-updates fingerprint:generate --platform android          # hash must not move
```

The e2e build is named **"PawPawCare (E2E)"** in the launcher, but the package
id is unchanged (`com.pawpawcare.app`) — so it *replaces* a preview build on the
device rather than installing alongside it. Reinstall the preview APK to go back
to production. It also has its own `e2e` EAS Update channel, so no
preview/production OTA can land mid-test.

## Verified working

A full autonomous login was confirmed on 2026-09-13: ARTEMIS tapped
*I already have an account*, typed the credentials, submitted, and landed on the
home screen ("Good afternoon, E2E") in 7 steps / 228 s. The Laravel log showed the
authenticated follow-up calls (`/users/me`, `/reminders`, `/notifications`,
`/community/groups`, `/invites`) — i.e. the whole chain, emulator → cleartext
HTTP → local Laravel → SQLite, works end to end.

### First issue it caught

The first write-path run (adding a pet) surfaced a real one. On a **cold launch**
the dashboard renders with an empty "Your pets" row and stays that way for a long
time, while `PetsListScreen` shows the pet almost immediately.

Measured on the emulator against local Laravel, one pet:

| Moment | Elapsed |
|---|---|
| Dashboard rendered ("Your pets" heading visible) | 13.3 s |
| Pet actually appears in the row | 29.9 s |
| **Empty-looking window** | **16.6 s** |

It is **not** a failed fetch — logcat shows every request returning 200 and no
`[data] … failed to load` warning. The cause is in `DataContext.loadData()`
(`frontend/src/context/DataContext.js:313-328`): the pets loader awaits
`GET /pets` **and then six sub-resource requests per pet**
(`vaccinations`, `activities`, `foods`, `medications`, `weights`, `expenses`)
before it dispatches `SET_PETS` **once**. So the dashboard's pets row is gated on
`1 + 6N` requests, even though it only renders a name, an avatar and a status
ring.

`PetsListScreen` is on React Query (`usePets.js`) and needs only `GET /pets`,
which is why the migrated screen wins — a good argument for finishing the
dashboard migration.

Two caveats on the numbers: `php artisan serve` is single-threaded, so the six
"parallel" requests were observed resolving ~0.5 s apart in series, which
inflates the gap locally; and `uiautomator dump` polling adds its own latency.
A concurrent production server will be faster — but the cost still scales at
`6N` requests, so it grows with the number of pets rather than going away.

**Fixed.** `loadData` now dispatches `SET_PETS` once `/pets`, `/lost-pets/mine`
and the per-pet **vaccinations** have landed — vaccinations being the minimum the
status ring needs, and the same minimum `usePets.js` fetches for its list cards —
then enriches with the remaining five sub-resources in the background. The gate
drops from `1 + 6N` requests to `1 + N`; total request count is unchanged.

Covered by `src/context/__tests__/dataLoad.test.js`, which holds the five heavy
endpoints unresolved and asserts the store still exposes the pet. On device the
empty window went 16.6 s → 9.4 s, and the logcat timeline shows `SET_PETS`
firing 4.1 s earlier (at the vaccinations response rather than the last
sub-resource). The remainder is the single-threaded dev server: the vaccinations
request sat queued 4.8 s behind the other five domains. A concurrent server
returns it right after `/pets`.

## Running a test

```bash
cd ../artemis
uv run artemis run "Open PawPawCare and add a dog named Rex" --profile flash
uv run artemis run "<task>" --profile pro    # verifies before each action; for longer flows
uv run artemis ui                            # web console at localhost:8000 (ARTEMIS's port — leave it to ARTEMIS)
uv run artemis trace list
uv run artemis trace view <session>_PASS_<timestamp>
```

`flash` is a reactive observe-and-act loop at ~3–5 s/step; `pro` checks targets
before acting and is better for long exploratory runs at ~15–40 s/step. A
6-step flash run costs roughly 11 LLM calls / 78k prompt tokens.

## Known rough edges

- **`trace view` needs the full folder name** (`<uuid>_PASS_<timestamp>`), not
  the bare session UUID — the UUID alone returns "not found".
- **Trace export can come up empty.** If `scrcpy` is not on ARTEMIS's PATH the
  compiler logs "0 steps, 0 images" and `trace view` renders a blank table, even
  though the run succeeded. The data is still in `traces/data_engine.db`
  (`sessions`, `steps`, `images` tables). On Windows, a shell started before
  scrcpy was installed will not have it on PATH — restart the shell.
- **Transient `503 UNAVAILABLE` from Gemini** mid-stream is normal; ARTEMIS
  discards the partial output and retries on its own.
- **Every run fails at ~184s with 0 steps → it is a model quota (429), not the app.**
  ARTEMIS's upstream default `gemini-3.8-flash` hit the free-tier limit on this
  key, and rather than falling back it hung until the 180s hard timeout
  (`TimeoutError: LLM call timed out after 180 seconds`). `config/artemis.jsonc`
  is therefore pinned locally to `gemini-3.7-flash` (fallback `gemini-3.6-flash`).
  Diagnose by calling the API directly — a fast 404/429 tells you far more than
  ARTEMIS's hang:

  ```bash
  KEY=$(grep -E '^GEMINI_API_KEY=' ../artemis/.env | cut -d= -f2-)
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent" \
    -H "x-goog-api-key: $KEY" -H "Content-Type: application/json" \
    -d '{"contents":[{"parts":[{"text":"ping"}]}]}'
  ```

  List what the key can actually reach with
  `GET https://generativelanguage.googleapis.com/v1beta/models`. Note some older
  ids (e.g. `gemini-2.5-flash`) now 404 as "no longer available to new users".
- **ANR dialogs.** The first run hit an Android "PawPawCare isn't responding"
  dialog on launch and tapped *Wait* to continue. On the software-rendered
  emulator that is most likely renderer slowness rather than an app defect — but
  an ANR on first launch would be a real bug, so re-check on a physical device
  before dismissing it.

## Security note

Backend changes still go through the `security-reviewer` agent — ARTEMIS
exercises the UI, it does not audit authorization. An E2E pass proving "the
happy path works" says nothing about IDOR.
