# Load testing the API with k6

Answers "how many simultaneous users can the API handle?" with a repeatable
number instead of a guess. Complements `php artisan test` (correctness) and
ARTEMIS (exploratory device E2E); it is **never a CI gate**.

Same split as ARTEMIS, inverted: ARTEMIS is LLM-driven and deliberately
non-deterministic, this is deterministic by construction.

## Read this first: do not point it at production

`api.pawpawcare.app` is **Namecheap shared hosting**. Two reasons not to:

1. **It is against the AUP.** Namecheap's Acceptable Use Policy prohibits
   "overloading any part of the Services" and sustained resource spikes.
   Load testing it risks account suspension.
2. **The numbers would be meaningless anyway.** Shared hosting runs
   [CloudLinux](https://docs.cloudlinux.com/cloudlinuxos/limits/), which caps
   each cPanel account with an **entry-process (EP) limit** — the number of
   simultaneous dynamic requests. Exceed it and Apache returns **HTTP 508**,
   not a slow response. CloudLinux's default EP is **20**; hosts commonly set
   20–60 and Namecheap does not publish theirs.

**You can read your real production ceiling in 30 seconds, with no load test
at all:** cPanel → **Resource Usage**. It shows your EP / NPROC / CPU / PMEM
limits and your historical faults. That EP number *is* your simultaneous-user
ceiling on this host, and no amount of application optimisation moves it.

Use this runbook to answer the *other* question: what the application itself
can do, and which of your own bottlenecks to fix before paying for a bigger
box.

## Where things live

| Path | What |
|---|---|
| `loadtest/docker-compose.yml` | The target: nginx + php-fpm + mysql |
| `loadtest/Dockerfile` | php-fpm build of `backend/`, with production-shaped opcache |
| `loadtest/entrypoint.sh` | Writes the fpm pool config, migrates, caches config |
| `loadtest/nginx.conf` | Routes everything to Laravel's front controller |
| `loadtest/k6/lib.js` | User pool, auth headers, read mix, error classification |
| `loadtest/k6/smoke.js` | 30s sanity check. Run before every breakpoint run |
| `loadtest/k6/breakpoint.js` | The staircase test that finds the ceiling |
| `loadtest/users.json` | Generated, gitignored. Seeded users + access tokens |
| `backend/app/Console/Commands/SeedLoadTestUsers.php` | `php artisan loadtest:seed-users` |

## Why not `php artisan serve`

Because it would make the whole exercise meaningless. PHP's built-in server is
**single-threaded**. `PHP_CLI_SERVER_WORKERS` can fork more workers, but it
relies on `fork()` and is [**not supported on
Windows**](https://www.php.net/manual/en/features.commandline.webserver.php),
which is the dev machine here. Load testing it measures a queue of one.

`backend/docker-compose.yml` serves with `artisan serve` too, so it is the
dev/e2e target, not a load-test target. cPanel serves through PHP-FPM, so
`loadtest/` does too.

## One-time setup

Install k6 (single Go binary, no runtime):

```powershell
winget install --id GrafanaLabs.k6 --source winget
# or: choco install k6
k6 version   # verified against k6 v2.2.0
```

Docker Desktop is required for the target stack (verified with Docker 29.8.0 /
Compose v5.5.1). It needs WSL2 and an **Administrator** shell:

```powershell
wsl --install                      # enables the WSL feature; reboot after this
# ...reboot...
winget install --id Docker.DockerDesktop --source winget
# then launch Docker Desktop once and accept the licence
```

If a non-elevated install was attempted first, it leaves
`C:\ProgramData\DockerDesktop` owned by the user account and every later attempt
fails with *"For security reasons C:\ProgramData\DockerDesktop must be owned by
an elevated account"*. Delete that directory (elevated) before retrying.

## Running a test

All commands from the **repo root**.

### 1. Start the target

```bash
docker compose -f loadtest/docker-compose.yml up --build -d
curl http://localhost:8080/health   # {"status":"ok","version":"1.0.0"}
```

### 2. Seed the user pool

Run it **inside the api container**, not on the host:

```bash
docker compose -f loadtest/docker-compose.yml exec -T api \
  php artisan loadtest:seed-users --count=500 --out=/loadtest/users.json --force
```

`loadtest/` is bind-mounted to `/loadtest`, so `users.json` lands on the host
where k6 reads it. Seeding from the host instead would use `backend/.env`, sign
tokens with a **different `SECRET_KEY`** than the container verifies with, and
every request would 401.

This creates throwaway accounts (`loadtest+N@pawpawcare.test`, all sharing one
published password), gives each 2 pets with 8 open vaccinations, and writes
`loadtest/users.json` with a **pre-minted access token** per user.

It refuses to run when `APP_ENV=production` and otherwise prints the target
database and asks for confirmation. `--fresh` removes previous load-test users
(cascade-deleting their pets); `--force` skips the prompt.

> **Pool sizing:** N users sustain 2N req/s before `throttle:api` (120/min/user)
> becomes the thing you are measuring. 500 users covers 1000 req/s. The script
> refuses to start if the pool is too small for the configured peak.

### 3. Smoke test

```bash
k6 run loadtest/k6/smoke.js
```

30 seconds at 5 req/s. If this is not all green, stop and fix it. Ten minutes
into a breakpoint run is an expensive place to discover every request was a 401.

### 4. Breakpoint test

```bash
k6 run loadtest/k6/breakpoint.js
```

Defaults to a staircase of **10 → 25 → 50 → 75 → 100 → 150 → 200 req/s**,
holding each step 60s (~7.5 min total). Output ends with:

```
══ PawPawCare capacity summary ═════════════════════════════════════
  Per arrival rate:
       10 req/s | p95     41ms  ok
       25 req/s | p95     58ms  ok
       50 req/s | p95    122ms  ok
       75 req/s | p95    890ms  ok
      100 req/s | p95   4200ms  OVER BUDGET

  ⇒ Highest rate within budget: 75 req/s.

  Which wall did we hit?
    429 rate-limited : 0     <- your Laravel throttles, not capacity
    508 resource     : 0     <- CloudLinux entry-process cap (shared hosting)
    502/504 gateway  : 118   <- php-fpm pool exhausted (PHP_FPM_MAX_CHILDREN)
    5xx app errors   : 0     <- genuine server faults, always a bug
```

Knobs:

```bash
k6 run -e STEPS=50,100,200,400 -e HOLD_SECONDS=90 -e P95_BUDGET_MS=500 \
       -e BASE_URL=http://localhost:8080 loadtest/k6/breakpoint.js
```

## What makes this deterministic

No load test is bit-for-bit reproducible — the network and the server are not.
What *is* pinned down:

- **A staircase of fixed arrival rates**, not a smooth ramp and not "as fast as
  the box will go". Each step is a labelled, repeatable experiment.
- **Open model.** `ramping-arrival-rate` starts iterations on a clock, so
  offered load is independent of response time. Closed-model tools (JMeter
  thread groups, default Locust) quietly *reduce* load as the server slows,
  hiding the very cliff you are hunting.
- **A static php-fpm pool.** `pm = static`, so run 2 does not start with
  workers that run 1 had to spawn.
- **`opcache.validate_timestamps=0`** so you are not benchmarking the PHP
  compiler.
- **MySQL on tmpfs**, keeping disk I/O out of the measurement.
- **No random think-time and no random data.** k6 does not seed
  `Math.random()`, so the scripts contain no randomness at all. Users are
  round-robined by iteration index.
- **Thresholds are the exit code.** A breach fails the run; the aggregate
  threshold aborts it once p95 has been over budget for 30s.

## Interpreting the four walls

The summary separates them because only one is your application.

**429 — you out-ran your own rate limiter.** Not capacity. Two limits bite:

- `routes/api.php:51` — every `/auth/*` route is `throttle:20,1`, and for
  unauthenticated requests Laravel keys it by **IP**. A load generator is one
  IP, so a test that logs in per-VU dies after 20 logins/minute. This is why
  tokens are minted out of band and the test never calls `/auth/*`.
- `AppServiceProvider:38` — `throttle:api` is `Limit::perMinute(120)` keyed by
  **user id**. One user sustains 2 req/s, full stop.

  **Pool sizing: N users sustain 2N req/s.** For 200 req/s you need ≥100 users.
  `assertPoolFor()` refuses to start if the pool is too small for the peak, and
  tells you what to re-seed with.

**508 — CloudLinux entry-process limit.** Your shared host's ceiling. You will
only see this against production (which you should not be testing). Locally,
model it with `PHP_FPM_MAX_CHILDREN=20`.

**502/504 — the php-fpm pool is exhausted.** This is the honest concurrency
ceiling. Requests beyond `pm.max_children` queue in nginx and eventually time
out. Raise `PHP_FPM_MAX_CHILDREN` to find out whether the pool or the app is
the limit.

**5xx — real faults.** Always a bug. Fix before trusting any capacity number.

## The three things worth A/B-ing

Each is one env var. **Always `down -v` between configs** — run-to-run variance
otherwise swamps the difference you are trying to measure.

```bash
docker compose -f loadtest/docker-compose.yml down -v
PHP_FPM_MAX_CHILDREN=64 CACHE_STORE=database \
  docker compose -f loadtest/docker-compose.yml up -d
```

1. **`PHP_FPM_MAX_CHILDREN`** (default 20 = CloudLinux's default EP) — models
   the shared-hosting concurrency cap. *Measured: raising it to 64 did not help.*
2. **`CACHE_STORE`** (default `file`, as production) — backs the rate limiter,
   so it is touched twice per authenticated request. *Measured: `database` is
   2.5x worse. Keep `file`.*
3. **`QUEUE_CONNECTION`** (default `sync`, as production) — queued work runs
   **inline**, holding a worker for its full duration. Invite emails wait on
   SMTP, `/records/export` renders a PDF, `/documents/{id}/extract` calls an AI
   model. *Not yet measured: the current read mix queues no jobs, so isolating
   this needs a write-path scenario.*

See Results below for the numbers.

## Known sharp edges

- **The load generator competes with the target.** Both run on this machine, so
  near saturation you are partly measuring your own laptop. Treat absolute
  numbers as a lower bound; trust *relative* comparisons between runs.
- **`maxVUs` exhaustion.** If k6 warns it cannot reach the target rate, it has
  run out of VUs and is no longer an open model. Raise `maxVUs`; do not ignore
  it, because the run silently stops measuring what it claims to.
- **Token expiry.** Tokens live `ACCESS_TOKEN_EXPIRE_MINUTES` (240 in the
  compose file, 60 by default elsewhere). A run longer than that produces 401s
  that look like failures. Re-seed.
- **Refresh rotation is deliberately untested here.** Refresh tokens are
  single-use, so concurrent refreshes from a shared account fail by design.
  Test `/auth/refresh` separately, single-VU.
- **The dashboard's cost scales with seeded history.** `DashboardController`
  fetches **every** non-completed vaccination for every accessible pet with no
  limit and filters in PHP. Change `--vaccinations` and the endpoint's cost
  changes, so keep it fixed when comparing runs.
- **Git Bash rewrites container paths.** Run from Git Bash, `--out=/loadtest/users.json`
  becomes `/app/C:/Program Files/Git/loadtest/users.json` inside the container,
  so no pool reaches the host and k6 fails with "cannot find users.json". Prefix
  the `docker compose exec` with `MSYS_NO_PATHCONV=1`, or run it from PowerShell.
- **`loadtest:seed-users` refuses to run outside the stack.** It ships with the
  app, so it is on the production server too, and its accounts share a
  published password. It needs `APP_ENV` local or testing in **both** the runtime
  (`--env`) and the configured `.env`/cached config, plus `LOADTEST_SEEDING=1`
  in the process environment, which only `docker-compose.yml` sets. So
  `--env=local` on production does not get past it. Running it on the host
  outside Docker needs `LOADTEST_SEEDING=1` set on purpose.
- **The stack listens on loopback only** (`127.0.0.1:8080`). Its `APP_KEY` and
  `SECRET_KEY` are published, so binding it to the LAN would let anyone there
  forge tokens for it.
- **The image copies `backend/` from the host.** `loadtest/Dockerfile.dockerignore`
  keeps the host's `backend/vendor` (a dev install) and `backend/.env` (real
  secrets) out of the image. Keep it next to the Dockerfile if you move either.

## Results (2026-09-20, first full run)

Hardware: Docker Desktop on Windows 11, 8 CPUs / 7.6 GB, **k6 running on the same
machine as the target**. Treat absolute numbers as a lower bound and trust the
*relative* comparison between configs. 500 seeded users, staircase
100/150/200/250/300 req/s, 30s hold, p95 budget 1000ms, fresh stack per config.

| Config | fpm workers | cache | Highest rate within budget |
|---|---|---|---|
| **A — production-like** | 20 | `file` | **250 req/s** (p95 215ms; 300 broke at 1775ms) |
| B | 20 | `database` | 100 req/s (150 broke at 1466ms) |
| C | 64 | `file` | 200 req/s (250 broke at 1395ms) |

Zero 429s, zero 502/504s, zero 5xx in all three. The ceiling is **latency, not
errors**: the box runs out of CPU before the worker pool runs out of slots.

Two results contradicted the predictions this document originally made:

- **`CACHE_STORE=database` is 2.5x WORSE than `file`, not better.** The rate
  limiter does a read and a write on every authenticated request. On `file`
  that is a local filesystem operation; on `database` it is extra MySQL
  round-trips, and MySQL is already the bottleneck. **Keep `file` on shared
  hosting.** Redis would beat both, but cPanel rarely offers it.
- **Raising `pm.max_children` from 20 to 64 did not help; it slightly hurt.**
  With 8 CPUs, 64 PHP workers just add context-switching. Concurrency slots
  were never the constraint, so a bigger *worker pool* is not the upgrade to
  buy — more CPU is.

`QUEUE_CONNECTION=sync` was not isolated, because the read mix
(`/dashboard`, `/pets`, `/reminders`, `/users/me`) queues no jobs. Measuring it
needs a write-path scenario (invite email, records export, document extract).

Run-to-run variance is significant on this setup (200 req/s measured anywhere
from 90ms to 607ms p95 across runs). Only compare runs made from a **fresh
stack** (`down -v` then `up`), which is how the table above was produced.

## Results (2026-10-15, after #130, with production's real limits)

**Production's CloudLinux limits** (read over SSH with `uapi ResourceUsage get_usages`):
CPU **200%** (2 cores), entry processes **20**, physical memory 1 GB, IOPS 1024,
I/O 50 MB/s, processes 200. The host is a 40-thread Xeon E5-2650 v3 @ 2.3 GHz
(2014, slower per core than the dev laptop), shared, load average ~11.

Local, same hardware and method as above (500 users, 45s holds, p95 budget
1000ms, fresh stack per run, `file` cache):

| Run | API CPUs | fpm workers | Highest rate within budget |
|---|---|---|---|
| A2 / A3 | all 8 | 20 | **250 / 200 req/s** (matches 2026-09-20; no regression from #130) |
| D | all 8 | 64 | 250 req/s (p95 210ms, did not break) |
| **B, production-shaped** | **2** | **20** | **75 req/s** (100 broke at 1322ms) |
| C | 1 | 20 | 25 req/s (50 broke at 1476ms) |

Zero 429s, 502/504s and 5xx in every run. One more run (A, 100 req/s) was an
outlier: it was the first build of the session, and two repeats on fresh stacks
landed at 200 to 250. B and C are single runs; treat them as ±25%.

**Production calibration probe** (owner-approved, not a load test): one
throwaway account with the same 2-pet / 16-vaccination shape, the same read mix,
1.5 req/s for 2 minutes, then deleted. 181/181 checks passed with no 429s.
Median latency is 206 to 218ms, but the TCP connect alone is about 200ms
(Morocco to Phoenix), so **server time is about 8ms (`/users/me`) to 20ms
(`/dashboard`)**, in line with the local stack.

**Estimate for production:** about **50 to 75 req/s** sustained. That is run B,
discounted for the older CPU and for MySQL sharing the host. As users:

- Opening the app costs about **2 + 6 x pets + ~10** requests (DataContext loads
  six sub-resources per pet), so about 25 for a 2-pet user, then about 1
  request every 10s while navigating. A 3-minute session is roughly 40 to 45
  requests, about **0.25 req/s per active user**.
- So **about 200 to 300 people actively using the app at the same moment**.
  With short sessions (a few minutes a day) and a 3x peak hour, that is very
  roughly **15,000 to 25,000 daily active users** before p95 passes 1s. That
  is an order-of-magnitude guide, not a promise.
- **The real risk is bursts, not the average.** Each app open fires about 25
  requests at once and production allows 20 entry processes. A push that
  reaches every user at the same minute (for example a 9:00 reminder fan-out)
  makes everyone open the app together, and the excess gets 508s. Stagger
  pushes before the user count makes that matter; it is cheaper than a bigger
  plan.

## Fixed: `throttle:api` was bucketing by IP, not by user

**This is a production bug, not a test artifact.** `AppServiceProvider` intends
a per-user limit:

```php
RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)
    ->by('api|'.($request->user()?->id ?? $request->ip())));
```

but `$request->user()` is **null** when it runs, so every request falls back to
the IP branch. Evidence, in order of how it was found:

1. Six requests as six *different* users returned `X-RateLimit-Remaining`
   82, 81, 80, 79, 78, 77 — one shared bucket.
2. `RateLimiter::attempts()` showed **0** under the user-id key and **3** under
   the IP key after exactly 3 requests.
3. Instrumenting both the middleware and the limiter showed the real execution
   order: `LIMITER user=NULL ip=172.18.0.1` printed **before** `JWTAUTH ran`.

Laravel sorts each route's pipeline by the middleware priority list.
`ThrottleRequests` is on that list; `auth.jwt` is a custom alias and is not, so
throttle is hoisted ahead of authentication. (`gatherRouteMiddleware()` reports
`auth.jwt -> throttle:api`, which is misleading — only instrumentation shows the
truth.)

**Impact:** every user behind one public IP shares a single 120 req/min budget.
Mobile carriers use CGNAT heavily, so thousands of app users can share one
egress IP and 429 each other. Households and offices hit it too.

**Fixed** in PR #130 (CHW-179), reviewed by the `security-reviewer` agent and
guarded by `tests/Feature/RateLimitScopeTest.php`. `JwtAuth` implements
Laravel's `AuthenticatesRequests` marker interface, which the framework's
default priority list already sorts ahead of `ThrottleRequests`:

```php
class JwtAuth implements AuthenticatesRequests
```

(The first version used `$middleware->prependToPriorityList(ThrottleRequests::class,
JwtAuth::class)` in `bootstrap/app.php`; review replaced it with the interface.
Without it, 3 of the 5 ordering tests fail.)

That alone broke 66 tests with `BadMethodCallException: Call to undefined method
App\Models\User::getAuthIdentifier()`. `User` extended plain `Eloquent\Model`, so
once authentication ran first, `ThrottleRequests::resolveRequestSignature()`
called a method that did not exist — **the IP-keying bug had been masking a
second latent bug** that would have 500'd every numeric-throttled route. `User`
now implements `Illuminate\Contracts\Auth\Authenticatable` by hand (the trait
assumes `password` and `remember_token` columns this schema does not have).

### The follow-up it exposed: numeric throttles shared one budget per user

`resolveRequestSignature()` has **no route component** — it returns
`sha1($user->getAuthIdentifier())` — and `handle()` builds the key as
`$prefix . signature` with `$prefix` defaulting to `''`. So every
`throttle:N,M` on an authenticated route incremented the *same* counter.

Worse, `RateLimiter::increment()` sets the TTL via `cache->add()`, which only
writes when the key is absent. Whichever route created the key also fixed the
window for all of them, so one photo upload (1 min) turned account deletion's
"5 per 60 minutes" into **5 per minute**.

Every numeric throttle now carries a distinct prefix (the 5th middleware
argument), e.g. `throttle:5,60,acct-delete:` and `throttle:20,1,share-link:`.
The public routes needed it too: `/auth/*` (20/min) shared a key with the three
signed pages (60/min), so opening a vet share link 20 times would have 429'd
everyone's logins.

Named limiters (`api`, `support`, `records-export`, `post-report`) were never
affected — they are namespaced as `md5($limiterName.$limit->key)`.

### The trade-off it opened (accepted, no backstop)

Authentication now runs before throttling, so **requests rejected with 401 no
longer consume throttle budget**. This is accepted on purpose:

- A forged token costs one HMAC check and no database work.
- A genuinely signed but revoked or deactivated token (up to 60 minutes until it
  expires) costs one primary-key lookup, the same first step as any
  authenticated request.

A per-IP cap on 401s (`AuthFailureBackstop`) was built and measured here (first
429 at request 121 with the cap at 120), then **dropped in security review**
before it shipped. It checked the counter before every request, so anyone could
send 120 junk tokens a minute from a carrier-NAT IP and lock out every user
behind it, valid sessions included, which is the very bug this section fixes.
Real clients also 401 legitimately, roughly once an hour each, because the app
refreshes its token reactively. The rationale lives in the `JwtAuth` docblock.

Still open, tracked in Linear:

- **CHW-184:** `/auth/refresh` is still keyed by IP (`throttle:20,1,auth:`), so
  heavy refresh traffic behind one carrier IP can 429. A 429 does not log anyone
  out.
- **CHW-185:** per-user limits alone let one person with many accounts multiply
  the budget on costly routes (AI extract, invites, post-report). The plan is a
  generous per-IP outer limit.
- **Edge protection:** absorbing a real flood needs an edge, and **Namecheap
  shared hosting cannot do it**. It ships `mod_security2` and no `mod_evasive` /
  `mod_qos` / `mod_ratelimit`, restricts customers to `.htaccess`, and LiteSpeed
  silently ignores per-directory `SecRule` blocks. The realistic option is
  Cloudflare proxying (the free plan includes one IP-keyed rate-limiting rule).
  **Configure trusted proxies first**, or `$request->ip()` becomes the edge IP
  and collapses the `/auth/*` and password-reset per-IP limits into one global
  bucket, where 20 requests a minute would lock out every user.

All load-test numbers above were measured **with the ordering fix applied**,
because without it the IP bucket caps the whole test at 120 req/min (2 req/s)
and you measure the bug instead of the app.

## Verified working

Confirmed 2026-09-20 end to end against **k6 v2.2.0** and the real Docker stack
(Docker 29.8.0, Compose v5.5.1):

- Stack builds and boots: nginx → php-fpm (`pm=static`) → MySQL 8.4, migrations
  run, `/health` 200 through nginx on :8080.
- `loadtest:seed-users` inside the container seeded 500 users / 1000 pets /
  8000 vaccinations and wrote `users.json` to the host via the bind mount.
- `smoke.js`: **150/150 checks passed**, both thresholds green.
- `breakpoint.js`: produced a clean monotonic curve (67 → 104 → 235 → 215 →
  1775ms) and correctly identified the knee.
- `--purge` is idempotent and cascades cleanly.

Bugs found by actually running it, all fixed:

**In the stack**

1. `php:8.3-fpm` could not `composer install`: `composer.json` says `php ^8.3`
   but `composer.lock` pins Symfony 8.1, which needs `>=8.4.1`. Now `php:8.4-fpm`.
2. The MySQL healthcheck used `mysqladmin ping -h localhost`, which goes over
   the **unix socket**. With the datadir on tmpfs MySQL re-initialises every
   boot and answers on the socket while still not listening on TCP, so the
   check went green and the API immediately died with `Connection refused`.
   Now forces `--protocol=TCP`, plus a PDO wait loop in the entrypoint.
3. `COPY` lands the app as `root:root` 755 but php-fpm workers run as
   `www-data`, so with `CACHE_STORE=file` the rate limiter could not write its
   counters and **every** throttled route returned 500 — silently, because
   `storage/logs` was unwritable too. Fixed with a `chown` in the Dockerfile.

**In the summary logic**

4. k6 materialises a sub-metric for every declared threshold, so steps the run
   **aborted before reaching** reported `p95 = 0ms` and counted as passes —
   producing a confident, fictional headline capacity. `http_req_duration`
   sub-metrics carry no `count`, so the fix declares a parallel
   `http_reqs{step:N}` threshold purely to get a request count; steps with 0
   requests now print `not reached`.
5. The headline took the *last* passing step rather than the last one before
   the first failure.
6. `handleSummary` wrote to `loadtest/results/summary.json`, but k6 does not
   create directories and fails the whole summary if the path is missing. Now
   `loadtest/summary.json` (override with `SUMMARY_PATH`).

## Teardown

```bash
docker compose -f loadtest/docker-compose.yml down -v
```

`down -v` drops the tmpfs database, so the seeded accounts go with it. If you
ever seed against a persistent database instead:

```bash
docker compose -f loadtest/docker-compose.yml exec -T api \
  php artisan loadtest:seed-users --purge
```

`--purge` deletes every `loadtest+*@pawpawcare.test` account (cascading to
their pets and vaccinations) and seeds nothing.

`users.json` and `summary.json` are gitignored. The pool file holds live access
tokens for the throwaway accounts, so do not commit or share it.
