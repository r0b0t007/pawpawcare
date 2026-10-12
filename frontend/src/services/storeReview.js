// In-app rating prompt (expo-store-review). Asked only right after a good
// moment — a completed care action, a document the AI filled in, a milestone
// — and only once the person keeps coming back:
//   • good moments on at least MIN_ACTIVE_DAYS different days (one action
//     that also earns a milestone is still one day);
//   • at most once per COOLDOWN_DAYS, and once per app session;
//   • never from a button, never mid-task: it waits until no toast is
//     showing and no sheet or dialog is open (services/uiActivity), the app
//     is in the foreground, and the person is still signed in.
// The OS has the last word (iOS shows the sheet at most 3 times a year;
// Android may show nothing), so "asked" means "handed to the OS".
//
// The native module is required defensively, like purchases.js: an OTA
// update on a build without expo-store-review just never asks.
import { AppState } from 'react-native';
import { getPref, setPref } from './prefs';
import { track } from './analytics';
import { isModalOpen, toastRemainingMs } from './uiActivity';

let StoreReview = null;
try {
  // eslint-disable-next-line global-require
  StoreReview = require('expo-store-review');
} catch (e) {
  StoreReview = null;
}

const PREF_KEY = 'storeReview'; // { activeDays, lastMomentDay, lastAskedAt }
const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_ACTIVE_DAYS = 3;
export const COOLDOWN_DAYS = 90;
// First look shortly after the moment, so a follow-up toast (a milestone the
// care action unlocked) has registered; then re-check until the screen is calm.
export const FIRST_CHECK_MS = 1500;
const SETTLE_MS = 400;
// Still busy after this long: give up and try at a later moment.
export const MAX_WAIT_MS = 30000;

let askedThisSession = false;
let pending = null;
let waitingSince = 0;

// Moments run one at a time: two at once (a care action and the milestone it
// unlocks) must neither lose a count nor both schedule an ask.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

const localDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// Pure: should a prompt be requested now, given the stored state?
export function isEligible(state, now = Date.now()) {
  if (!state || (state.activeDays || 0) < MIN_ACTIVE_DAYS) return false;
  if (state.lastAskedAt && now - state.lastAskedAt < COOLDOWN_DAYS * DAY_MS) return false;
  return true;
}

// Record a good moment and, if the person qualifies, ask for a rating once
// the screen is calm. Fire-and-forget: never throws, never blocks the caller.
export function noteGoodMoment(kind, now = Date.now()) {
  return serial(async () => {
    try {
      if (!StoreReview || __DEV__) return;
      const prev = (await getPref(PREF_KEY, null)) || {};
      const day = localDay(now);
      const state = {
        activeDays: (prev.activeDays || 0) + (prev.lastMomentDay === day ? 0 : 1),
        lastMomentDay: day,
        lastAskedAt: prev.lastAskedAt || null,
      };
      await setPref(PREF_KEY, state);

      if (askedThisSession || pending || !isEligible(state, now)) return;
      if (!(await StoreReview.isAvailableAsync())) return;

      askedThisSession = true;
      waitingSince = Date.now();
      schedule(kind, FIRST_CHECK_MS);
    } catch {
      // A rating prompt is never worth an error in the user's flow.
    }
  });
}

// Logout: an ask scheduled for the old session must not appear afterwards.
export function cancelPendingReview() {
  if (pending) clearTimeout(pending);
  pending = null;
  askedThisSession = false;
}

function schedule(kind, delay) {
  pending = setTimeout(() => {
    pending = null;
    tryAsk(kind);
  }, delay);
}

function tryAsk(kind) {
  // Backgrounded, or busy for too long: skip, and try at a later moment.
  if (AppState.currentState !== 'active' || Date.now() - waitingSince > MAX_WAIT_MS) {
    askedThisSession = false;
    return;
  }
  const toast = toastRemainingMs();
  if (toast > 0 || isModalOpen()) {
    schedule(kind, Math.max(toast + SETTLE_MS, 1000));
    return;
  }
  serial(async () => {
    try {
      // Fresh state: moments recorded while waiting must not be rolled back.
      const fresh = (await getPref(PREF_KEY, null)) || {};
      await setPref(PREF_KEY, { ...fresh, lastAskedAt: Date.now() });
      track('review_prompt_requested', { trigger: kind, active_days: fresh.activeDays || 0 });
      await StoreReview.requestReview();
    } catch {
      // ERR_STORE_REVIEW_FAILED etc. — the cooldown still applies.
    }
  });
}

export function __resetForTests() {
  cancelPendingReview();
  waitingSince = 0;
  queue = Promise.resolve();
}
