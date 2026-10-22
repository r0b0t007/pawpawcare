import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Invitations addressed to me, through React Query. Accepting and declining
// stay DataContext mutations that drop the resolved invite from the cache.
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
import { useInvitesQuery } from '../useInvites';
import { useGroupsQuery } from '../useGroups';
import i18n from '../../i18n';
import { get, post } from '../../services/api';

const apiInvite = (id, petName = 'Bella') => ({
  id, pet_id: `p-${id}`, email: 'me@example.test', created_at: '2026-10-01T10:00:00Z',
  pet: { name: petName, type: 'dog', color: null }, inviter: { name: 'Sam', email: 'sam@example.test' },
});

let serverInvites;
let data;
let invites;
function Probe() {
  data = useData();
  // React Query re-renders only for the fields read during render, so read
  // them here the way the screens destructure them.
  const { data: list, isError } = useInvitesQuery();
  invites = { data: list, isError };
  return null;
}

let tree;
let client;
const element = () => (
  <QueryClientProvider client={client}>
    <DataProvider>
      <Probe />
    </DataProvider>
  </QueryClientProvider>
);

const inviteCalls = () => get.mock.calls.filter(([path]) => path === '/invites').length;
const otherDomains = (path) => {
  if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
  return Promise.resolve([]);
};
const serve = () => get.mockImplementation((path) =>
  path === '/invites' ? Promise.resolve(serverInvites) : otherDomains(path));

// React Query hands results to components on a setTimeout(0) tick, which an
// async act() alone doesn't wait for: run the step, then let a few ticks pass.
async function settle(step) {
  await act(async () => { await step?.(); });
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}
const mount = () => settle(() => { tree = TestRenderer.create(element()); });
const rerender = () => settle(() => { tree.update(element()); });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', locale: 'en' };
  serverInvites = [apiInvite('i1'), apiInvite('i2', 'Milo')];
  serve();
  // gcTime: Infinity schedules no garbage-collection timers, which would keep
  // Jest from exiting; clear() drops the cache between tests.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  client.clear();
});

describe('reading invitations', () => {
  it('fetches them once and maps them for the screens', async () => {
    await mount();

    expect(inviteCalls()).toBe(1);
    expect(invites.data.map((i) => [i.id, i.petName, i.inviterName])).toEqual([
      ['i1', 'Bella', 'Sam'],
      ['i2', 'Milo', 'Sam'],
    ]);
  });

  // Mounting runs DataContext's sign-in fan-out too; it no longer includes
  // invitations, so the query's GET is the only one.
  it('is not part of the full load', async () => {
    await mount();

    expect(get.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining(['/pets', '/reminders']));
    expect(inviteCalls()).toBe(1);
  });

  it('reports a failed load as an error, not as no invitations', async () => {
    get.mockImplementation((path) =>
      path === '/invites' ? Promise.reject(new Error('Network error')) : otherDomains(path));
    await mount();

    expect(invites.isError).toBe(true);
    expect(invites.data).toBeUndefined();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('logs out when the fetch finds the session expired', async () => {
    get.mockImplementation((path) =>
      path === '/invites' ? Promise.reject(new Error('SESSION_EXPIRED')) : otherDomains(path));
    await mount();

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // A refused refresh token fails every active query at once.
  it('an expired session logs out once, however many queries hit it', async () => {
    function GroupsProbe() {
      useGroupsQuery();
      return null;
    }
    get.mockImplementation((path) => (path === '/invites' || path === '/community/groups'
      ? Promise.reject(new Error('SESSION_EXPIRED'))
      : otherDomains(path)));
    await settle(() => {
      tree = TestRenderer.create(
        <QueryClientProvider client={client}>
          <DataProvider>
            <Probe />
            <GroupsProbe />
          </DataProvider>
        </QueryClientProvider>,
      );
    });

    expect(get.mock.calls.filter(([path]) => path === '/community/groups')).toHaveLength(1);
    expect(inviteCalls()).toBe(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // toInvite fills in translated fallbacks; they follow the app language
  // straight away, from the same cached answer.
  it('fallback names follow a language switch without a refetch', async () => {
    serverInvites = [{ ...apiInvite('i1'), pet: null, inviter: null }];
    await mount();
    const english = [invites.data[0].petName, invites.data[0].inviterName];
    try {
      await settle(() => i18n.changeLanguage('fr'));
      expect([invites.data[0].petName, invites.data[0].inviterName])
        .toEqual([i18n.t('common.aPetLower'), i18n.t('common.someone')]);
      expect(invites.data[0].petName).not.toBe(english[0]);
      expect(inviteCalls()).toBe(1);
    } finally {
      await act(async () => { await i18n.changeLanguage('en'); });
    }
  });
});

describe('accounts', () => {
  it('never shows the previous account’s invitations to the next one', async () => {
    await mount();
    get.mockImplementation((path) => (path === '/invites' ? new Promise(() => {}) : otherDomains(path)));
    mockUser = { id: 'u2', locale: 'en' };
    await rerender();

    expect(invites.data).toBeUndefined();
  });

  it('drops the cached invitations at logout', async () => {
    await mount();
    const cachedFor = (userId) =>
      client.getQueryCache().findAll({ queryKey: ['invites', userId] }).filter((q) => q.state.data);
    expect(cachedFor('u1')).toHaveLength(1);

    mockUser = null;
    await rerender();

    expect(cachedFor('u1')).toHaveLength(0);
    expect(invites.data).toBeUndefined();
  });
});

describe('answering an invitation', () => {
  // The drop itself is shared with declining (tested below); accepting also
  // re-reads the list once the shared pet has loaded.
  it('accepting removes it and re-reads the list', async () => {
    await mount();
    let answerAccept;
    post.mockImplementation(() => new Promise((resolve) => { answerAccept = resolve; }));
    let accepted;
    await settle(() => { accepted = data.acceptInvite('i1'); });
    expect(post).toHaveBeenCalledWith('/invites/i1/accept');

    serverInvites = [apiInvite('i2', 'Milo')];
    let ok;
    await settle(async () => {
      answerAccept({});
      ok = await accepted;
    });

    expect(ok).toBe(true);
    expect(invites.data.map((i) => i.id)).toEqual(['i2']);
    expect(inviteCalls()).toBe(2);
  });

  it('declining drops it without refetching', async () => {
    await mount();
    post.mockResolvedValue({});

    let ok;
    await settle(async () => { ok = await data.declineInvite('i2'); });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/invites/i2/decline');
    expect(invites.data.map((i) => i.id)).toEqual(['i1']);
    expect(inviteCalls()).toBe(1);
  });

  // A refresh was already in flight when the answer landed: its older list
  // must not put the declined invite back.
  it('a refresh in flight cannot bring a declined invite back', async () => {
    await mount();
    let answerRefresh;
    get.mockImplementation((path) => (path === '/invites'
      ? new Promise((resolve) => { answerRefresh = resolve; })
      : otherDomains(path)));
    // Start the refresh without waiting for it: its answer is held back.
    await settle(() => { client.invalidateQueries({ queryKey: ['invites', 'u1'] }); });
    expect(inviteCalls()).toBe(2);
    post.mockResolvedValue({});

    await settle(() => data.declineInvite('i1'));
    await settle(() => answerRefresh([apiInvite('i1'), apiInvite('i2', 'Milo')]));

    expect(invites.data.map((i) => i.id)).toEqual(['i2']);
  });

  it('keeps the invitation when the answer fails', async () => {
    await mount();
    post.mockRejectedValue(new Error('Network error'));

    let ok;
    await settle(async () => { ok = await data.declineInvite('i1'); });

    expect(ok).toBe(false);
    expect(invites.data.map((i) => i.id)).toEqual(['i1', 'i2']);
  });
});
