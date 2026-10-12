// Rating prompt: who gets asked, when, and that it never breaks the caller.
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  requestReview: jest.fn(() => Promise.resolve()),
}));
jest.mock('../analytics', () => ({ track: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { track } from '../analytics';
import * as ui from '../uiActivity';
import {
  __resetForTests,
  cancelPendingReview,
  COOLDOWN_DAYS,
  FIRST_CHECK_MS,
  isEligible,
  MAX_WAIT_MS,
  noteGoodMoment,
} from '../storeReview';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 12, 12).getTime(); // local noon
const KEY = '@pawpawcare/pref:storeReview';

const stored = async () => JSON.parse(await AsyncStorage.getItem(KEY));
const seed = (state) => AsyncStorage.setItem(KEY, JSON.stringify(state));
const dayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

// Came back on two earlier days; today's first moment makes it three.
const regular = { activeDays: 2, lastMomentDay: dayOf(NOW - DAY), lastAskedAt: null };

beforeEach(async () => {
  global.__DEV__ = false;
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  __resetForTests();
  ui.__resetForTests();
  await AsyncStorage.clear();
  AppState.currentState = 'active';
});

afterEach(() => {
  jest.useRealTimers();
  global.__DEV__ = true;
});

const settle = (ms = FIRST_CHECK_MS + 10) => jest.advanceTimersByTimeAsync(ms);

describe('isEligible', () => {
  it('needs enough active days and no recent ask', () => {
    expect(isEligible(null, NOW)).toBe(false);
    expect(isEligible({ ...regular, activeDays: 3 }, NOW)).toBe(true);
    expect(isEligible({ ...regular, activeDays: 2 }, NOW)).toBe(false);
    expect(isEligible({ ...regular, activeDays: 3, lastAskedAt: NOW - (COOLDOWN_DAYS - 1) * DAY }, NOW)).toBe(false);
    expect(isEligible({ ...regular, activeDays: 3, lastAskedAt: NOW - (COOLDOWN_DAYS + 1) * DAY }, NOW)).toBe(true);
  });
});

describe('noteGoodMoment', () => {
  it('counts days, not events: a busy first day never asks', async () => {
    await noteGoodMoment('care_action', NOW);
    await noteGoodMoment('milestone', NOW + 1000);
    await noteGoodMoment('care_action', NOW + 2000);
    await settle();

    expect(await stored()).toEqual({ activeDays: 1, lastMomentDay: dayOf(NOW), lastAskedAt: null });
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it('asks a returning user once the screen is calm, and records it', async () => {
    await seed(regular);

    await noteGoodMoment('milestone', NOW);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    await settle();

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('review_prompt_requested', { trigger: 'milestone', active_days: 3 });
    expect((await stored()).lastAskedAt).toEqual(expect.any(Number));
  });

  it('asks once when two moments land together (care action + its milestone)', async () => {
    await seed(regular);

    await Promise.all([noteGoodMoment('care_action', NOW), noteGoodMoment('milestone', NOW), noteGoodMoment('milestone', NOW)]);
    await settle(10000);

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
    expect((await stored()).activeDays).toBe(3);
  });

  it('waits for a toast that appears later, and for an open sheet or dialog', async () => {
    await seed(regular);
    await noteGoodMoment('care_action', NOW);

    // The milestone the care action unlocked shows its own toast meanwhile.
    await jest.advanceTimersByTimeAsync(1000);
    ui.noteToast(2400);
    await settle(FIRST_CHECK_MS);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    // Then a sheet opens before the toast is gone.
    ui.modalOpened();
    await settle(5000);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    ui.modalClosed();
    await settle(1500);
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('gives up if the screen stays busy, and tries again at a later moment', async () => {
    await seed(regular);
    await noteGoodMoment('care_action', NOW);
    ui.modalOpened();
    await settle(MAX_WAIT_MS + 5000);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect((await stored()).lastAskedAt).toBeNull();

    ui.modalClosed();
    await noteGoodMoment('care_action', Date.now());
    await settle();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('keeps moments recorded while waiting', async () => {
    await seed({ ...regular, lastMomentDay: dayOf(NOW - DAY) });
    await noteGoodMoment('care_action', NOW);
    ui.noteToast(3000);
    // Next day's moment lands while the ask is still waiting (long session).
    await noteGoodMoment('milestone', NOW + DAY);
    await settle(5000);

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    expect((await stored()).activeDays).toBe(4);
  });

  it('asks at most once per session and then waits out the cooldown', async () => {
    await seed(regular);
    await noteGoodMoment('care_action', NOW);
    await settle();
    await noteGoodMoment('care_action', NOW + DAY);
    await settle();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);

    __resetForTests(); // a new session a month later: still in the cooldown
    await noteGoodMoment('care_action', Date.now() + 30 * DAY);
    await settle();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('never shows after logout, or while the app is in the background', async () => {
    await seed(regular);
    await noteGoodMoment('care_action', NOW);
    cancelPendingReview();
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();

    await noteGoodMoment('care_action', NOW);
    AppState.currentState = 'background';
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect((await stored()).lastAskedAt).toBeNull();
  });

  it('never asks where the store sheet is unavailable (TestFlight, web)', async () => {
    await seed(regular);
    StoreReview.isAvailableAsync.mockResolvedValueOnce(false);
    await noteGoodMoment('care_action', NOW);
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it('never counts or asks in development builds', async () => {
    global.__DEV__ = true;
    await seed(regular);
    await noteGoodMoment('care_action', NOW);
    await settle();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect((await stored()).activeDays).toBe(2);
  });

  it('never throws into the caller', async () => {
    await seed(regular);
    StoreReview.requestReview.mockRejectedValueOnce(new Error('ERR_STORE_REVIEW_FAILED'));
    await expect(noteGoodMoment('care_action', NOW)).resolves.toBeUndefined();
    await settle();

    __resetForTests();
    StoreReview.isAvailableAsync.mockRejectedValueOnce(new Error('native module missing'));
    await expect(noteGoodMoment('care_action', NOW)).resolves.toBeUndefined();
  });
});
