import http from 'k6/http';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

/**
 * The seeded user pool, written by:
 *   cd backend && php artisan loadtest:seed-users
 *
 * SharedArray keeps ONE copy in memory for all VUs. A plain `open()` would be
 * parsed and held per VU, which at a few hundred VUs turns the load generator
 * itself into the bottleneck.
 */
export const users = new SharedArray('users', () => JSON.parse(open('../users.json')));

/**
 * Not app failures, and counted apart from them so the summary can say WHICH
 * wall you hit:
 *   429 -> you out-ran a Laravel rate limiter (your own guardrail)
 *   508 -> CloudLinux entry-process limit (your host's ceiling, shared hosting)
 *   502/504 -> php-fpm pool exhausted / request queued past the timeout
 */
export const throttled = new Counter('guardrail_429_throttled');
export const resourceLimit = new Counter('guardrail_508_resource_limit');
export const gatewayErrors = new Counter('saturation_502_504_gateway');
export const appErrors = new Counter('app_errors_5xx');

/**
 * Only 2xx counts as success. By default k6 treats 3xx as expected too, which
 * would quietly fold a 429's response into the "good" latency distribution and
 * flatter the results.
 */
export function useStrictStatuses() {
  http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }));
}

/**
 * Round-robin the pool by ITERATION, not by VU.
 *
 * `throttle:api` is 120 requests/minute keyed by user id. Binding a user to a
 * VU means a slow VU under-uses its user while a fast one burns through its
 * budget. Spreading by iteration gives the flattest possible per-user rate,
 * which maximises the offered load you can reach before the limiter, rather
 * than the server, becomes what you are measuring.
 */
export function nextUser() {
  return users[exec.scenario.iterationInTest % users.length];
}

export function authHeaders(user) {
  return {
    headers: {
      Authorization: `Bearer ${user.token}`,
      Accept: 'application/json',
    },
  };
}

/** Classify a response and bump the right counter. Returns true if 2xx. */
export function record(res) {
  if (res.status >= 200 && res.status < 300) return true;

  if (res.status === 429) throttled.add(1);
  else if (res.status === 508) resourceLimit.add(1);
  else if (res.status === 502 || res.status === 504 || res.status === 0) gatewayErrors.add(1);
  else if (res.status >= 500) appErrors.add(1);

  return false;
}

/**
 * Guard rails on the pool itself, run once in setup(). A test that silently
 * runs with too few users produces a confident, wrong capacity number.
 */
export function assertPoolFor(peakRps) {
  if (users.length === 0) {
    throw new Error(
      'loadtest/users.json is empty or missing. Run:\n' +
        '  cd backend && php artisan loadtest:seed-users'
    );
  }

  // 120 req/min/user = 2 req/s/user, so N users sustain 2N req/s.
  const sustainable = users.length * 2;

  if (peakRps > sustainable) {
    throw new Error(
      `Pool too small: ${users.length} users sustain ~${sustainable} req/s ` +
        `(throttle:api is 120/min/user), but PEAK is ${peakRps} req/s.\n` +
        `Re-seed with at least ${Math.ceil(peakRps / 2)} users:\n` +
        `  cd backend && php artisan loadtest:seed-users --count=${Math.ceil(peakRps / 2)}`
    );
  }

  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`${BASE_URL}/health returned ${health.status}; is the stack up?`);
  }

  return { users: users.length, sustainable, peakRps };
}

/**
 * The read mix a real session makes. Weighted toward /dashboard because it is
 * the heaviest endpoint: DashboardController fetches EVERY non-completed
 * vaccination for every accessible pet with no limit and filters them in PHP,
 * so its cost grows with account history.
 */
export function readMix(user, extraTags = {}) {
  const headers = authHeaders(user).headers;
  const i = exec.scenario.iterationInTest % 10;

  const [name, path] =
    i < 5 ? ['dashboard', '/dashboard']
    : i < 7 ? ['pets', '/pets']
    : i < 9 ? ['reminders', '/reminders']
    : ['me', '/users/me'];

  // Tags go on the REQUEST, not the check: that is what lets k6 slice
  // http_req_duration by step and endpoint afterwards.
  const res = http.get(`${BASE_URL}${path}`, {
    headers,
    tags: { endpoint: name, ...extraTags },
  });

  return { name, res };
}
