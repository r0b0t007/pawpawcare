// In-app rating prompt (expo-store-review). Asked only right after a good
// moment — a completed care action, a document the AI filled in, a milestone
// — and only once the person has been using the app for a while:
//   • at least MIN_MOMENTS good moments, the first one MIN_DAYS ago or more;
//   • at most once per COOLDOWN_DAYS, and once per app session;
//   • never from a button, never mid-task: it waits until the celebration
//     toast is gone and the app is still in the foreground.
// The OS has the last word (iOS shows the sheet at most 3 times a year;
// Android may show nothing), so "asked" means "handed to the OS".
//
// The native module is required defensively, like purchases.js: an OTA
// update on a build without expo-store-review just never asks.
import { AppState } from 'react-native';
import { getPref, setPref } from './prefs';
import { track } from './analytics';

let StoreReview = null;
try {
  // eslint-disable-next-line global-require
  StoreReview = require('expo-store-review');
} catch (e) {
  StoreReview = null;
}

const PREF_KEY = 'storeReview'; // { firstMomentAt, moments, lastAskedAt }
const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_MOMENTS = 3;
export const MIN_DAYS = 3;
export const COOLDOWN_DAYS = 90;
// The celebration toast shows for 2.2s; ask after it, not on top of it.
export const ASK_DELAY_MS = 2600;

let askedThisSession = false;
let pending = null;

// Pure: should a prompt be requested now, given the stored state?
export function isEligible(state, now = Date.now()) {
  if (!state || state.moments < MIN_MOMENTS) return false;
  if (!state.firstMomentAt || now - state.firstMomentAt < MIN_DAYS * DAY_MS) return false;
  if (state.lastAskedAt && now - state.lastAskedAt < COOLDOWN_DAYS * DAY_MS) return false;
  return true;
}

// Record a good moment and, if the person qualifies, ask for a rating a few
// seconds later. Fire-and-forget: never throws, never blocks the caller.
export async function noteGoodMoment(kind, now = Date.now()) {
  try {
    if (!StoreReview || __DEV__) return;
    const prev = await getPref(PREF_KEY, null);
    const state = {
      firstMomentAt: prev?.firstMomentAt || now,
      moments: (prev?.moments || 0) + 1,
      lastAskedAt: prev?.lastAskedAt || null,
    };
    await setPref(PREF_KEY, state);

    if (askedThisSession || pending || !isEligible(state, now)) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;

    askedThisSession = true;
    pending = setTimeout(() => {
      pending = null;
      ask(kind, state);
    }, ASK_DELAY_MS);
  } catch {
    // A rating prompt is never worth an error in the user's flow.
  }
}

async function ask(kind, state) {
  try {
    // Backgrounded meanwhile (they switched apps): skip, try a later moment.
    if (AppState.currentState !== 'active') {
      askedThisSession = false;
      return;
    }
    await setPref(PREF_KEY, { ...state, lastAskedAt: Date.now() });
    track('review_prompt_requested', { trigger: kind, moments: state.moments });
    await StoreReview.requestReview();
  } catch {
    // ERR_STORE_REVIEW_FAILED etc. — the cooldown still applies.
  }
}

export function __resetForTests() {
  askedThisSession = false;
  if (pending) clearTimeout(pending);
  pending = null;
}
