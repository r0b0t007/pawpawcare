/**
 * Smoke test — run this before every breakpoint run.
 *
 * A low, constant rate for a short time. It proves the stack is up, the seeded
 * tokens are valid, and the read mix returns 2xx. Ten minutes into a breakpoint
 * run is an expensive time to discover every request was a 401.
 *
 *   k6 run loadtest/k6/smoke.js
 */
import { check, sleep } from 'k6';
import { BASE_URL, useStrictStatuses, nextUser, readMix, record, assertPoolFor } from './lib.js';

const RATE = Number(__ENV.RATE || 5);

export const options = {
  scenarios: {
    smoke: {
      // Constant ARRIVAL rate (open model): iterations start on a clock, not
      // when the previous one finishes, so the offered load does not sag when
      // the server slows down.
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: __ENV.DURATION || '30s',
      preAllocatedVUs: Math.max(10, RATE * 2),
      maxVUs: Math.max(20, RATE * 10),
    },
  },
  thresholds: {
    // Nothing should fail at a rate this low. If it does, the setup is wrong.
    checks: ['rate>0.99'],
    'http_req_duration{expected_response:true}': ['p(95)<1000'],
  },
};

useStrictStatuses();

export function setup() {
  const info = assertPoolFor(RATE);
  console.log(`smoke: ${RATE} req/s against ${BASE_URL} with ${info.users} users`);
  return info;
}

export default function () {
  const user = nextUser();
  const { name, res } = readMix(user);

  check(res, {
    [`${name} is 2xx`]: (r) => record(r),
  });

  sleep(0.1);
}
