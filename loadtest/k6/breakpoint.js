/**
 * Breakpoint test — "how many simultaneous users can it handle?"
 *
 *   k6 run loadtest/k6/breakpoint.js
 *   k6 run -e STEPS=10,25,50,100,200 -e HOLD_SECONDS=90 loadtest/k6/breakpoint.js
 *
 * Deterministic by construction:
 *
 *  - Load is a fixed STAIRCASE of arrival rates, not a smooth ramp and not
 *    "as fast as the box will go". Each step is a labelled, repeatable
 *    experiment, and every request is tagged with the step it ran in, so the
 *    summary reads "p95 was fine at 50 req/s and blew up at 100".
 *  - Open model (ramping-arrival-rate): offered load is independent of server
 *    response time. Closed-model tools quietly reduce load as the server
 *    slows, which hides the very cliff you are looking for.
 *  - No random think-time, no random data. The only variation between runs is
 *    the server and the network.
 *
 * NOTE: k6 does not seed Math.random(), so keep randomness out of the script
 * entirely (this file has none) if you want runs to be comparable.
 */
import { check } from 'k6';
import exec from 'k6/execution';
import {
  BASE_URL,
  useStrictStatuses,
  nextUser,
  readMix,
  record,
  assertPoolFor,
} from './lib.js';

// Each step's arrival rate in requests/second.
const STEPS = (__ENV.STEPS || '10,25,50,75,100,150,200').split(',').map(Number);
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 60);
const RAMP_SECONDS = 5;
const STEP_SECONDS = RAMP_SECONDS + HOLD_SECONDS;
const PEAK = Math.max(...STEPS);

// Latency budget. Breaching it for a sustained period IS the breakpoint.
const P95_BUDGET_MS = Number(__ENV.P95_BUDGET_MS || 1000);

// Relative to the directory k6 was invoked from (the repo root).
const SUMMARY_PATH = __ENV.SUMMARY_PATH || 'loadtest/summary.json';

/**
 * One threshold per step, generated from STEPS. This is the whole report: k6
 * prints a p95 and a pass/fail for every arrival rate, so the run answers
 * "fine at 50, broken at 100" instead of giving one blended average.
 * abortOnFail is false here — we want every step evaluated, and the aborting
 * is handled by the aggregate threshold below.
 */
const perStepThresholds = {};
for (const rate of STEPS) {
  perStepThresholds[`http_req_duration{step:${rate}}`] = [
    { threshold: `p(95)<${P95_BUDGET_MS}`, abortOnFail: false },
  ];
  // Declaring a threshold is what makes k6 materialise a sub-metric, and this
  // one exists purely so the summary can tell "this step ran and was fast"
  // apart from "this step never ran". Without it an aborted run reports
  // p95=0ms for every step it never reached, which reads as a pass and
  // produces a headline capacity number that is pure fiction.
  perStepThresholds[`http_reqs{step:${rate}}`] = [
    { threshold: 'count>=0', abortOnFail: false },
  ];
}

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      // Step up quickly, then hold flat. The hold is where the measurement
      // happens; the 5s ramp just avoids a thundering herd at each change.
      stages: STEPS.flatMap((rate) => [
        { target: rate, duration: `${RAMP_SECONDS}s` },
        { target: rate, duration: `${HOLD_SECONDS}s` },
      ]),
      preAllocatedVUs: Math.max(50, PEAK * 2),
      // Headroom for VUs blocked on slow responses near saturation. If k6 runs
      // out of VUs it cannot keep the arrival rate and the test stops being an
      // open model, so it warns loudly — raise this, do not ignore it.
      maxVUs: Math.max(200, PEAK * 20),
    },
  },
  thresholds: {
    ...perStepThresholds,
    // Abort once p95 has been over budget for a sustained 30s. The step the
    // run dies in is the answer; delayAbortEval stops a single slow moment at
    // a step change from ending the run early.
    'http_req_duration{expected_response:true}': [
      { threshold: `p(95)<${P95_BUDGET_MS}`, abortOnFail: true, delayAbortEval: '30s' },
    ],
    // Real server faults are never acceptable, at any rate.
    app_errors_5xx: [{ threshold: 'count<1', abortOnFail: false }],
  },
};

useStrictStatuses();

/** Which step are we in? Derived from elapsed time, so it needs no shared state. */
function currentStepRate() {
  const elapsed = exec.instance.currentTestRunDuration / 1000;
  const index = Math.min(Math.floor(elapsed / STEP_SECONDS), STEPS.length - 1);
  return STEPS[index];
}

export function setup() {
  const info = assertPoolFor(PEAK);
  const totalMin = ((STEPS.length * STEP_SECONDS) / 60).toFixed(1);

  console.log(`breakpoint: ${BASE_URL}`);
  console.log(`  steps      : ${STEPS.join(' -> ')} req/s (${HOLD_SECONDS}s hold each, ~${totalMin} min)`);
  console.log(`  user pool  : ${info.users} (sustains ~${info.sustainable} req/s before throttle:api)`);
  console.log(`  p95 budget : ${P95_BUDGET_MS}ms`);

  return info;
}

export default function () {
  const user = nextUser();
  const step = currentStepRate();

  // The step tag rides on the request, so http_req_duration can be sliced by
  // arrival rate afterwards.
  const { name, res } = readMix(user, { step: String(step) });

  check(res, { [`${name} 2xx`]: (r) => record(r) }, { step: String(step) });
}

export function handleSummary(data) {
  const m = data.metrics;
  const count = (key) => m[key]?.values?.count ?? 0;

  const throttle429 = count('guardrail_429_throttled');
  const resource508 = count('guardrail_508_resource_limit');
  const gateway = count('saturation_502_504_gateway');
  const app5xx = count('app_errors_5xx');
  const reqs = m.http_reqs?.values?.count ?? 0;
  const p95 = m.http_req_duration?.values?.['p(95)'];

  // Per-step table: the actual answer to "how many can it handle".
  const rows = [];
  let lastGoodRate = null;
  // Capacity is the highest rate before the FIRST failure. A later step that
  // happens to look fine (fewer samples, a lucky window) must not raise it.
  let broken = false;

  for (const rate of STEPS) {
    const stepReqs = m[`http_reqs{step:${rate}}`]?.values?.count ?? 0;
    const stepP95 = m[`http_req_duration{step:${rate}}`]?.values?.['p(95)'];

    // A step the run aborted before reaching is NOT a pass. k6 still reports
    // p95=0 for it, so the request count is the only honest signal.
    if (stepReqs === 0 || stepP95 === undefined) {
      rows.push(`    ${String(rate).padStart(5)} req/s |      not reached`);
      continue;
    }

    const ok = stepP95 < P95_BUDGET_MS;
    if (ok && !broken) lastGoodRate = rate;
    if (!ok) broken = true;
    rows.push(
      `    ${String(rate).padStart(5)} req/s | p95 ${String(stepP95.toFixed(0)).padStart(6)}ms  ` +
        `${ok ? 'ok' : 'OVER BUDGET'}  (${stepReqs} reqs)`
    );
  }

  const lines = [
    '',
    '══ PawPawCare capacity summary ═════════════════════════════════════',
    `  requests          : ${reqs}`,
    `  p95 (all)         : ${p95 ? p95.toFixed(0) + 'ms' : 'n/a'} (budget ${P95_BUDGET_MS}ms)`,
    '',
    '  Per arrival rate:',
    ...rows,
    '',
    lastGoodRate === null
      ? '  ⇒ Failed the budget at every step. Lower STEPS or raise P95_BUDGET_MS.'
      : `  ⇒ Highest rate within budget: ${lastGoodRate} req/s.`,
    '',
    '  Which wall did we hit?',
    `    429 rate-limited : ${throttle429}   <- your Laravel throttles, not capacity`,
    `    508 resource     : ${resource508}   <- CloudLinux entry-process cap (shared hosting)`,
    `    502/504 gateway  : ${gateway}   <- php-fpm pool exhausted (PHP_FPM_MAX_CHILDREN)`,
    `    5xx app errors   : ${app5xx}   <- genuine server faults, always a bug`,
    '',
  ];

  if (app5xx > 0) {
    lines.push('  ⚠ App 5xx present: fix these before trusting any capacity number.');
  } else if (throttle429 > reqs * 0.01) {
    lines.push('  ⚠ Mostly 429s: you measured the rate limiter. Seed a bigger user pool');
    lines.push(`    (need >= ceil(peak/2) = ${Math.ceil(PEAK / 2)} users for ${PEAK} req/s).`);
  } else if (gateway > 0) {
    lines.push('  → Saturation was the php-fpm worker pool, which is the honest');
    lines.push('    concurrency ceiling. Re-run with a higher PHP_FPM_MAX_CHILDREN to');
    lines.push('    see whether the app or the pool is the limit.');
  } else {
    lines.push('  → No saturation errors. The ceiling here is latency, not errors:');
    lines.push('    read the last step whose p95 stayed under budget.');
  }

  lines.push('════════════════════════════════════════════════════════════════════', '');

  return {
    stdout: lines.join('\n'),
    // Full metrics dump, for diffing one run against another.
    // Deliberately NOT in a subdirectory: k6 will not mkdir, it just fails the
    // whole end-of-test summary if the path does not already exist.
    [SUMMARY_PATH]: JSON.stringify(data, null, 2),
  };
}
