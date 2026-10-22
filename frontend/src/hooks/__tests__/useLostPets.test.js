import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The lost-pet board and my own reports, through React Query. Reporting and
// resolving stay DataContext mutations that re-read both lists.
jest.mock('../../services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  put: jest.fn(),
  del: jest.fn(),
  uploadDocument: jest.fn(),
}));
jest.mock('../../services/notifications', () => ({
  scheduleLocalReminders: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../services/prefs', () => ({
  getPref: jest.fn(() => Promise.resolve({})),
  setPref: jest.fn(() => Promise.resolve()),
}));
let mockUser = { id: 'u1', locale: 'en' };
const mockLogout = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));

import { DataProvider, useData } from '../../context/DataContext';
import { useLostPetsBoardQuery, useMyLostReportsQuery } from '../useLostPets';
import { useFeedQuery } from '../useFeed';
import i18n from '../../i18n';
import { get, post, patch } from '../../services/api';

const apiReport = (id, petName = 'Bella', extra = {}) => ({
  id,
  pet_id: `p-${id}`,
  pet_name: petName,
  pet_type: 'dog',
  status: 'active',
  reported_by: 'u2',
  reporter_name: 'Sam',
  last_seen_location: 'Riverside park',
  created_at: '2026-10-20T10:00:00Z',
  ...extra,
});

let serverBoard;
let serverMine;
let data;
let board;
let mine;
function Probe() {
  data = useData();
  // React Query re-renders only for the fields read during render, so read
  // them here the way the screens destructure them.
  const { data: boardList, isError: boardFailed } = useLostPetsBoardQuery();
  const { data: mineList, isError: mineFailed } = useMyLostReportsQuery();
  useFeedQuery();
  board = { data: boardList, isError: boardFailed };
  mine = { data: mineList, isError: mineFailed };
  return null;
}
function DataOnly() {
  data = useData();
  return null;
}

let tree;
let client;
const element = (Child = Probe) => (
  <QueryClientProvider client={client}>
    <DataProvider>
      <Child />
    </DataProvider>
  </QueryClientProvider>
);

const calls = (path) => get.mock.calls.filter(([p]) => p === path).length;
const otherDomains = (path) => {
  if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
  return Promise.resolve([]);
};
const answer = (path) => {
  if (path === '/lost-pets') return Promise.resolve(serverBoard);
  if (path === '/lost-pets/mine') return Promise.resolve(serverMine);
  return otherDomains(path);
};

// React Query hands results to components on a setTimeout(0) tick, which an
// async act() alone doesn't wait for: run the step, then let a few ticks pass.
async function settle(step) {
  await act(async () => { await step?.(); });
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}
const mount = (Child) => settle(() => { tree = TestRenderer.create(element(Child)); });
const rerender = () => settle(() => { tree.update(element()); });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', locale: 'en' };
  serverBoard = [apiReport('r1'), apiReport('r2', 'Milo')];
  serverMine = [];
  get.mockImplementation(answer);
  // gcTime: Infinity schedules no garbage-collection timers, which would keep
  // Jest from exiting; clear() drops the cache between tests.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  client.clear();
});

describe('reading lost-pet reports', () => {
  it('fetches the board and my reports once each, mapped for the screens', async () => {
    serverMine = [apiReport('r3', 'Luna', { reported_by: 'u1', status: 'resolved' })];
    await mount();

    expect(calls('/lost-pets')).toBe(1);
    expect(calls('/lost-pets/mine')).toBe(1);
    expect(board.data.map((r) => [r.id, r.petName, r.lastSeenLocation])).toEqual([
      ['r1', 'Bella', 'Riverside park'],
      ['r2', 'Milo', 'Riverside park'],
    ]);
    expect(mine.data.map((r) => [r.id, r.reportedBy, r.status])).toEqual([['r3', 'u1', 'resolved']]);
  });

  // My reports used to ride along with /pets in the sign-in load, so a failed
  // /lost-pets/mine discarded every pet with it.
  it('is not part of the full load', async () => {
    await mount(DataOnly);

    expect(calls('/pets')).toBe(1);
    expect(calls('/lost-pets')).toBe(0);
    expect(calls('/lost-pets/mine')).toBe(0);
  });

  it('a failed load of my reports leaves the pets loaded', async () => {
    get.mockImplementation((path) => {
      if (path === '/lost-pets/mine') return Promise.reject(new Error('Network error'));
      if (path === '/pets') return Promise.resolve([{ id: 'p1', name: 'Luna', type: 'cat' }]);
      return answer(path);
    });
    await mount();

    expect(data.pets.map((p) => p.name)).toEqual(['Luna']);
    expect(mine.isError).toBe(true);
  });

  // PetProfile reads undefined as "not known yet" and offers neither action.
  it('reports a failed load as unknown, not as no reports', async () => {
    get.mockImplementation((path) => (path === '/lost-pets/mine' || path === '/lost-pets'
      ? Promise.reject(new Error('Network error'))
      : answer(path)));
    await mount();

    expect(mine).toEqual({ data: undefined, isError: true });
    expect(board).toEqual({ data: undefined, isError: true });
    expect(mockLogout).not.toHaveBeenCalled();
  });

  // toLostPet fills in a translated fallback name; it follows the app
  // language straight away, from the same cached answer.
  it('the fallback name follows a language switch without a refetch', async () => {
    serverBoard = [apiReport('r1', null)];
    await mount();
    const english = board.data[0].petName;
    try {
      await settle(() => i18n.changeLanguage('fr'));
      expect(board.data[0].petName).toBe(i18n.t('common.aPet'));
      expect(board.data[0].petName).not.toBe(english);
      expect(calls('/lost-pets')).toBe(1);
    } finally {
      await act(async () => { await i18n.changeLanguage('en'); });
    }
  });
});

describe('accounts', () => {
  it('never shows the previous account’s reports to the next one', async () => {
    serverMine = [apiReport('r3', 'Luna', { reported_by: 'u1' })];
    await mount();
    get.mockImplementation((path) => (path.startsWith('/lost-pets') ? new Promise(() => {}) : otherDomains(path)));
    mockUser = { id: 'u2', locale: 'en' };
    await rerender();

    expect(mine.data).toBeUndefined();
    expect(board.data).toBeUndefined();
  });

  it('drops the cached reports at logout', async () => {
    await mount();
    const cached = () => client.getQueryCache().findAll({ queryKey: ['lostPets'] }).filter((q) => q.state.data);
    expect(cached()).toHaveLength(2);

    mockUser = null;
    await rerender();

    expect(cached()).toHaveLength(0);
  });
});

describe('reporting and resolving', () => {
  const details = { lastSeenLocation: 'Main St', description: '', contactPhone: '' };

  // The screens confirm (toast, banner) as soon as this resolves, so both
  // lists must already show the new report by then.
  it('reporting resolves once the board and my reports show it', async () => {
    await mount();
    const report = apiReport('r9', 'Luna', { pet_id: 'p1', reported_by: 'u1' });
    const before = serverBoard;
    serverMine = [report];
    post.mockResolvedValue(report);
    // Hold the board's re-read: the report must not resolve before it lands.
    let answerBoard;
    get.mockImplementation((path) => (path === '/lost-pets'
      ? new Promise((resolve) => { answerBoard = () => resolve([report, ...before]); })
      : answer(path)));

    let ok;
    await settle(() => { data.reportPetLost('p1', details).then((v) => { ok = v; }); });
    expect(ok).toBeUndefined();
    await settle(() => answerBoard());

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/pets/p1/lost-report', {
      last_seen_location: 'Main St', description: null, contact_phone: null,
    });
    expect(client.getQueryData(['lostPets', 'mine', 'u1']).map((r) => r.id)).toEqual(['r9']);
    expect(client.getQueryData(['lostPets', 'board', 'u1']).map((r) => r.id)).toEqual(['r9', 'r1', 'r2']);
    expect(calls('/community/posts')).toBe(2); // the broadcast post, too
  });

  it('resolving takes the report off the board', async () => {
    serverMine = [apiReport('r1', 'Bella', { reported_by: 'u1' })];
    await mount();
    patch.mockImplementation(() => {
      serverBoard = serverBoard.filter((r) => r.id !== 'r1');
      serverMine = [{ ...serverMine[0], status: 'resolved' }];
      return Promise.resolve({});
    });

    let ok;
    await act(async () => { ok = await data.resolveLostPet('r1'); });

    expect(ok).toBe(true);
    expect(patch).toHaveBeenCalledWith('/lost-pets/r1/resolve', { resolution_note: null });
    await settle();
    expect(board.data.map((r) => r.id)).toEqual(['r2']);
    expect(mine.data.map((r) => r.status)).toEqual(['resolved']);
  });

  // A board fetch was already in flight when the report landed: its older
  // list must not hide the new report.
  it('a fetch in flight cannot hide a new report', async () => {
    await mount();
    const old = serverBoard;
    let answerOld;
    get.mockImplementation((path) => {
      if (path === '/lost-pets' && !answerOld) {
        return new Promise((resolve) => { answerOld = () => resolve(old); });
      }
      return answer(path);
    });
    await settle(() => { client.invalidateQueries({ queryKey: ['lostPets', 'board', 'u1'] }); });
    expect(calls('/lost-pets')).toBe(2);

    const report = apiReport('r9', 'Luna', { reported_by: 'u1' });
    serverBoard = [report, ...old];
    serverMine = [report];
    post.mockResolvedValue(report);
    await settle(() => data.reportPetLost('p1', details));
    await settle(() => answerOld());

    expect(board.data.map((r) => r.id)).toEqual(['r9', 'r1', 'r2']);
  });

  // The feed re-read (the broadcast post) starts, but the confirmation
  // doesn't wait for it.
  it('reporting doesn’t wait for the feed', async () => {
    await mount();
    const report = apiReport('r9', 'Luna', { reported_by: 'u1' });
    serverMine = [report];
    post.mockResolvedValue(report);
    get.mockImplementation((path) => (path === '/community/posts' ? new Promise(() => {}) : answer(path)));

    let ok;
    await settle(async () => { ok = await data.reportPetLost('p1', details); });

    expect(ok).toBe(true);
    expect(calls('/community/posts')).toBe(2);
  });

  it('a failed report resolves false and re-reads nothing', async () => {
    await mount();
    post.mockRejectedValue(new Error('Network error'));

    let ok;
    await settle(async () => { ok = await data.reportPetLost('p1', details); });

    expect(ok).toBe(false);
    expect(calls('/lost-pets')).toBe(1);
    expect(calls('/lost-pets/mine')).toBe(1);
  });
});
