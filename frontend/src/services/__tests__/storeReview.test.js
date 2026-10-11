// Rating prompt: who gets asked, when, and that it never breaks the caller.
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  hasAction: jest.fn(() => Promise.resolve(true)),
  requestReview: jest.fn(() => Promise.resolve()),
}));
jest.mock('../analytics', () => ({ track: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { track } from '../analytics';
import {
  __resetForTests,
  ASK_DELAY_MS,
  COOLDOWN_DAYS,
  isEligible,
  MIN_DAYS,
  noteGoodMoment,
} from '../storeReview';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12);
const KEY = '@pawpawcare/pref:storeReview';

const stored = async () => JSON.parse(await AsyncStorage.getItem(KEY));
const seed = (state) => AsyncStorage.setItem(KEY, JSON.stringify(state));

// A long-time user one moment short of the threshold.
const regular = { firstMomentAt: NOW - 10 * DAY, moments: 2, lastAskedAt: null };

beforeEach(async () => {
  global.__DEV__ = false;
  jest.useFakeTimers();
  jest.clearAllMocks();
  __resetForTests();
  await AsyncStorage.clear();
  AppState.currentState = 'active';
});

afterEach(() => {
  jest.useRealTimers();
  global.__DEV__ = true;
});

async function momentThenWait(kind = 'care_action', now = NOW) {
  await noteGoodMoment(kind, now);
  await jest.advanceTimersByTimeAsync(ASK_DELAY_MS + 10);
}

describe('isEligible', () => {
  it('needs enough moments, enough days, and no recent ask', () => {
    expect(isEligible(null, NOW)).toBe(false);
    expect(isEligible({ ...regular, moments: 3 }, NOW)).toBe(true);
    expect(isEligible({ ...regular, moments: 2 }, NOW)).toBe(false);
    expect(isEligible({ ...regular, moments: 3, firstMomentAt: NOW - (MIN_DAYS - 1) * DAY }, NOW)).toBe(false);
    expect(isEligible({ ...regular, moments: 3, lastAskedAt: NOW - (COOLDOWN_DAYS - 1) * DAY }, NOW)).toBe(false);
    expect(isEligible({ ...regular, moments: 3, lastAskedAt: NOW - (COOLDOWN_DAYS + 1) * DAY }, NOW)).toBe(true);
  });
});

describe('noteGoodMoment', () => {
  it('counts moments without asking a new user', async () => {
    await momentThenWait('care_action', NOW);
    await momentThenWait('care_action', NOW + 1000);
    await momentThenWait('milestone', NOW + 2000);

    expect(await stored()).toEqual({ firstMomentAt: NOW, moments: 3, lastAskedAt: null });
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it('asks a regular user after the celebration toast, and records it', async () => {
    await seed(regular);

    await noteGoodMoment('milestone', NOW);
    expect(StoreReview.requestReview).not.toHaveBeenCalled(); // not on top of the toast
    await jest.advanceTimersByTimeAsync(ASK_DELAY_MS + 10);

    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('review_prompt_requested', { trigger: 'milestone', moments: 3 });
    expect((await stored()).lastAskedAt).toEqual(expect.any(Number));
  });

  it('asks at most once per session and then waits out the cooldown', async () => {
    await seed(regular);
    await momentThenWait();
    await momentThenWait();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);

    // A new session soon after: still inside the 90-day cooldown.
    __resetForTests();
    await momentThenWait('care_action', Date.now() + 30 * DAY);
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('skips while the app is in the background and tries again at a later moment', async () => {
    await seed(regular);
    await noteGoodMoment('care_action', NOW);
    AppState.currentState = 'background';
    await jest.advanceTimersByTimeAsync(ASK_DELAY_MS + 10);
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect((await stored()).lastAskedAt).toBeNull();

    AppState.currentState = 'active';
    await momentThenWait();
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('never asks where the store sheet is unavailable (TestFlight, web)', async () => {
    await seed(regular);
    StoreReview.isAvailableAsync.mockResolvedValueOnce(false);
    await momentThenWait();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
  });

  it('never counts or asks in development builds', async () => {
    global.__DEV__ = true;
    await seed(regular);
    await momentThenWait();
    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect((await stored()).moments).toBe(2);
  });

  it('never throws into the caller', async () => {
    await seed(regular);
    StoreReview.requestReview.mockRejectedValueOnce(new Error('ERR_STORE_REVIEW_FAILED'));
    StoreReview.hasAction.mockResolvedValueOnce(true);
    await expect(momentThenWait()).resolves.toBeUndefined();

    __resetForTests();
    StoreReview.isAvailableAsync.mockRejectedValueOnce(new Error('native module missing'));
    await expect(noteGoodMoment('care_action', NOW)).resolves.toBeUndefined();
  });
});
