import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Seeded group names are translated by the server in the account's saved
// language, so a language switch (Profile PATCHes users.locale, AuthContext
// stores the returned user) must refetch them.
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
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));

import { DataProvider, useData } from '../DataContext';
import { get } from '../../services/api';

const group = (name) => [{ id: 'g1', name, description: 'd', location: 'Global', icon: 'dog', member_count: 0, is_member: false }];

let groupsName = 'Dog Lovers';
let data;
function Probe() {
  data = useData();
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

describe('DataContext groups follow the saved language', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'u1', locale: 'en' };
    groupsName = 'Dog Lovers';
    get.mockImplementation((path) => {
      if (path === '/community/groups') return Promise.resolve(group(groupsName));
      if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
      return Promise.resolve([]);
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => tree?.unmount());
    tree = undefined;
  });

  it('refetches the groups once the saved locale changes', async () => {
    await act(async () => {
      tree = TestRenderer.create(element());
    });
    expect(groupCalls()).toBe(1);
    expect(data.groups[0].name).toBe('Dog Lovers');

    // Profile's PATCH /users/me landed: AuthContext now holds the new locale.
    groupsName = 'Amoureux des chiens';
    mockUser = { ...mockUser, locale: 'fr' };
    await act(async () => {
      tree.update(element());
    });

    expect(groupCalls()).toBe(2);
    expect(data.groups[0].name).toBe('Amoureux des chiens');
  });

  // The full load's GET went out before the sign-in sync saved the new
  // locale, and answers after the refetch that sync triggered.
  it('keeps the refetched groups when the earlier fetch answers last', async () => {
    let answerFirst;
    get.mockImplementation((path) => {
      if (path === '/community/groups') {
        if (!answerFirst) return new Promise((resolve) => { answerFirst = resolve; });
        return Promise.resolve(group('Amoureux des chiens'));
      }
      if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
      return Promise.resolve([]);
    });
    await act(async () => {
      tree = TestRenderer.create(element());
    });
    mockUser = { ...mockUser, locale: 'fr' };
    await act(async () => {
      tree.update(element());
    });
    expect(data.groups[0].name).toBe('Amoureux des chiens');

    await act(async () => {
      answerFirst(group('Dog Lovers'));
    });

    expect(groupCalls()).toBe(2);
    expect(data.groups[0].name).toBe('Amoureux des chiens');
  });

  it('does not refetch on a re-render with the same locale', async () => {
    await act(async () => {
      tree = TestRenderer.create(element());
    });
    mockUser = { ...mockUser, name: 'Renamed' };
    await act(async () => {
      tree.update(element());
    });

    expect(groupCalls()).toBe(1);
  });

  it('keeps the groups shown when the refetch fails', async () => {
    await act(async () => {
      tree = TestRenderer.create(element());
    });
    get.mockImplementation((path) =>
      path === '/community/groups' ? Promise.reject(new Error('Network error')) : Promise.resolve([])
    );
    mockUser = { ...mockUser, locale: 'es' };
    await act(async () => {
      tree.update(element());
    });

    expect(data.groups[0].name).toBe('Dog Lovers');
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
