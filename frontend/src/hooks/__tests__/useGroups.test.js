import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Community groups through React Query. Seeded group names are translated by
// the server in the account's saved language, so a language switch (Profile
// PATCHes users.locale, AuthContext stores the returned user) must fetch them
// again; joining stays a DataContext mutation that writes into the cache.
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
import { useGroupsQuery } from '../useGroups';
import { get, post } from '../../services/api';

const apiGroup = (name, extra = {}) => ({
  id: 'g1', name, description: 'd', location: 'Global', icon: 'dog', member_count: 0, is_member: false, ...extra,
});
const group = (name) => [apiGroup(name)];

let groupsName = 'Dog Lovers';
let data;
let groups;
function Probe() {
  data = useData();
  groups = useGroupsQuery();
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

const groupCalls = () => get.mock.calls.filter(([path]) => path === '/community/groups').length;
const otherDomains = (path) => {
  if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
  return Promise.resolve([]);
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
const mount = () => settle(() => { tree = TestRenderer.create(element()); });
const rerender = () => settle(() => { tree.update(element()); });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', locale: 'en' };
  groupsName = 'Dog Lovers';
  get.mockImplementation((path) =>
    path === '/community/groups' ? Promise.resolve(group(groupsName)) : otherDomains(path));
  // gcTime: Infinity schedules no garbage-collection timers, which would keep
  // Jest from exiting; clear() drops the cache between tests.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  client.clear();
});

describe('groups follow the saved language', () => {
  it('fetches them once, and again once the saved locale changes', async () => {
    await mount();
    expect(groupCalls()).toBe(1);
    expect(groups.data[0].name).toBe('Dog Lovers');

    // Profile's PATCH /users/me landed: AuthContext now holds the new locale.
    groupsName = 'Amoureux des chiens';
    mockUser = { ...mockUser, locale: 'fr' };
    await rerender();

    expect(groupCalls()).toBe(2);
    expect(groups.data[0].name).toBe('Amoureux des chiens');
  });

  // The first fetch went out before the sign-in sync saved the new locale,
  // and answers after the fetch that the new locale started.
  it('keeps the new language when the earlier fetch answers last', async () => {
    let answerFirst;
    get.mockImplementation((path) => {
      if (path !== '/community/groups') return otherDomains(path);
      if (!answerFirst) return new Promise((resolve) => { answerFirst = resolve; });
      return Promise.resolve(group('Amoureux des chiens'));
    });
    await mount();
    mockUser = { ...mockUser, locale: 'fr' };
    await rerender();
    expect(groups.data[0].name).toBe('Amoureux des chiens');

    await settle(() => answerFirst(group('Dog Lovers')));

    expect(groupCalls()).toBe(2);
    expect(groups.data[0].name).toBe('Amoureux des chiens');
  });

  // Same race, other order: the earlier fetch answers first and the new
  // language's fetch then fails. The old-language groups stay rather than none.
  it('keeps the earlier groups when they answer first and the new fetch fails', async () => {
    let answerFirst;
    let failRefetch;
    get.mockImplementation((path) => {
      if (path !== '/community/groups') return otherDomains(path);
      if (!answerFirst) return new Promise((resolve) => { answerFirst = resolve; });
      return new Promise((_, reject) => { failRefetch = reject; });
    });
    await mount();
    mockUser = { ...mockUser, locale: 'fr' };
    await rerender();

    await settle(() => answerFirst(group('Dog Lovers')));
    await settle(() => failRefetch(new Error('Network error')));

    expect(groupCalls()).toBe(2);
    expect(groups.data[0].name).toBe('Dog Lovers');
  });

  it('does not refetch on a re-render with the same locale', async () => {
    await mount();
    mockUser = { ...mockUser, name: 'Renamed' };
    await rerender();

    expect(groupCalls()).toBe(1);
  });

  it('keeps the groups shown when the new language fails to load', async () => {
    await mount();
    get.mockImplementation((path) =>
      path === '/community/groups' ? Promise.reject(new Error('Network error')) : otherDomains(path));
    mockUser = { ...mockUser, locale: 'es' };
    await rerender();

    expect(groups.isError).toBe(true);
    expect(groups.data[0].name).toBe('Dog Lovers');
    expect(mockLogout).not.toHaveBeenCalled();
  });
});

describe('accounts', () => {
  it('never shows the previous account’s groups to the next one', async () => {
    await mount();
    expect(groups.data[0].name).toBe('Dog Lovers');

    get.mockImplementation((path) =>
      path === '/community/groups' ? new Promise(() => {}) : otherDomains(path));
    mockUser = { id: 'u2', locale: 'en' };
    await rerender();

    expect(groups.data).toBeUndefined();
  });

  it('drops the cached groups at logout', async () => {
    await mount();
    const cachedFor = (userId) =>
      client.getQueryCache().findAll({ queryKey: ['community', 'groups', userId] }).filter((q) => q.state.data);
    expect(cachedFor('u1')).toHaveLength(1);

    mockUser = null;
    await rerender();

    expect(cachedFor('u1')).toHaveLength(0);
    expect(groups.data).toBeUndefined();
  });
});

describe('joining a group', () => {
  it('shows the server’s answer at once, without refetching the list', async () => {
    await mount();
    post.mockResolvedValue(apiGroup('Dog Lovers', { member_count: 1, is_member: true }));

    let ok;
    await settle(async () => { ok = await data.toggleGroupMembership('g1'); });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/community/groups/g1/join');
    expect(groups.data[0]).toEqual(expect.objectContaining({ isJoined: true, members: 1 }));
    expect(groupCalls()).toBe(1);
  });

  it('resolves false and leaves the list alone when the join fails', async () => {
    await mount();
    post.mockRejectedValue(new Error('Network error'));

    let ok;
    await settle(async () => { ok = await data.toggleGroupMembership('g1'); });

    expect(ok).toBe(false);
    expect(groups.data[0].isJoined).toBe(false);
  });

  // The other language's list was cached before the switch; its membership is
  // now out of date, so it must refetch when shown again, not reuse the cache.
  it('marks other languages’ lists stale, so switching back refetches', async () => {
    await mount();
    groupsName = 'Amoureux des chiens';
    mockUser = { ...mockUser, locale: 'fr' };
    await rerender();
    post.mockResolvedValue(apiGroup('Amoureux des chiens', { member_count: 1, is_member: true }));
    await settle(() => data.toggleGroupMembership('g1'));
    expect(groupCalls()).toBe(2);

    groupsName = 'Dog Lovers';
    mockUser = { ...mockUser, locale: 'en' };
    await rerender();

    expect(groupCalls()).toBe(3);
  });
});
