import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The community feed, through React Query. Posting, pawing, reporting and
// commenting stay DataContext mutations that write the server's answer into
// the cache.
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
import { useFeedQuery, useFeedCount } from '../useFeed';
import i18n from '../../i18n';
import { get, post, del } from '../../services/api';

const apiPost = (id, extra = {}) => ({
  id,
  author_id: 'u2',
  author_name: 'Sam',
  content: `Post ${id}`,
  paw_count: 0,
  pawed_by_me: false,
  comment_count: 0,
  image_url: null,
  reported_by_me: false,
  created_at: '2026-10-20T10:00:00Z',
  ...extra,
});

let serverPosts;
let data;
let feed;
function Probe() {
  data = useData();
  // React Query re-renders only for the fields read during render, so read
  // them here the way the screens destructure them.
  const { data: list, isError } = useFeedQuery();
  feed = { data: list, isError };
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

const feedCalls = () => get.mock.calls.filter(([path]) => path === '/community/posts').length;
const otherDomains = (path) => {
  if (path === '/notifications') return Promise.resolve({ notifications: [], unread_count: 0 });
  return Promise.resolve([]);
};
const answer = (path) => (path === '/community/posts' ? Promise.resolve(serverPosts) : otherDomains(path));

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
const ids = () => feed.data.map((p) => p.id);

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1', locale: 'en' };
  serverPosts = [apiPost('a', { paw_count: 2, comment_count: 1 }), apiPost('b')];
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

describe('reading the feed', () => {
  it('fetches it once and maps it for the screens', async () => {
    await mount();

    expect(feedCalls()).toBe(1);
    expect(feed.data.map((p) => [p.id, p.authorName, p.paws, p.comments, p.pawedByMe])).toEqual([
      ['a', 'Sam', 2, 1, false],
      ['b', 'Sam', 0, 0, false],
    ]);
  });

  it('is not part of the full load', async () => {
    await mount(DataOnly);

    expect(get.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining(['/pets', '/reminders']));
    expect(feedCalls()).toBe(0);
  });

  it('reports a failed load as an error, not as an empty feed', async () => {
    get.mockImplementation((path) => (path === '/community/posts'
      ? Promise.reject(new Error('Network error'))
      : answer(path)));
    await mount();

    expect(feed).toEqual({ data: undefined, isError: true });
    expect(mockLogout).not.toHaveBeenCalled();
  });

  // toPost fills in a translated fallback author; it follows the app language
  // straight away, from the same cached answer.
  it('the fallback author follows a language switch without a refetch', async () => {
    serverPosts = [apiPost('a', { author_name: null })];
    await mount();
    const english = feed.data[0].authorName;
    try {
      await settle(() => i18n.changeLanguage('fr'));
      expect(feed.data[0].authorName).toBe(i18n.t('common.unknown'));
      expect(feed.data[0].authorName).not.toBe(english);
      expect(feedCalls()).toBe(1);
    } finally {
      await act(async () => { await i18n.changeLanguage('en'); });
    }
  });
});

describe('the post count for Home', () => {
  let count;
  function CountProbe() {
    data = useData();
    ({ data: count } = useFeedCount());
    return null;
  }

  it('is how many posts the feed has, from the same cached answer', async () => {
    await mount(CountProbe);
    expect(count).toBe(2);
    expect(feedCalls()).toBe(1);

    post.mockResolvedValue(apiPost('n'));
    await settle(() => data.addPost('Hello'));
    expect(count).toBe(3);
  });

  // Not 0: Home shows a neutral line rather than "say hi" to an empty feed.
  it('is unknown until the feed loads', async () => {
    get.mockImplementation((path) => (path === '/community/posts' ? new Promise(() => {}) : answer(path)));
    await mount(CountProbe);
    expect(count).toBeUndefined();
  });
});

describe('accounts', () => {
  // Pawed / reported by me are per account.
  it('never shows the previous account’s feed to the next one', async () => {
    await mount();
    get.mockImplementation((path) => (path === '/community/posts' ? new Promise(() => {}) : otherDomains(path)));
    mockUser = { id: 'u2', locale: 'en' };
    await rerender();

    expect(feed.data).toBeUndefined();
  });

  it('drops the cached feed at logout', async () => {
    await mount();
    const cached = () => client.getQueryCache().findAll({ queryKey: ['community', 'feed'] }).filter((q) => q.state.data);
    expect(cached()).toHaveLength(1);

    mockUser = null;
    await rerender();

    expect(cached()).toHaveLength(0);
  });
});

describe('writing to the feed', () => {
  it('a new post goes on top, as the server saved it', async () => {
    await mount();
    post.mockResolvedValue(apiPost('n', { author_id: 'u1', author_name: 'Me', image_url: 'https://cdn.test/p.jpg' }));

    let ok;
    await settle(async () => { ok = await data.addPost('Hello', 'https://cdn.test/p.jpg'); });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/community/posts', { content: 'Hello', image_url: 'https://cdn.test/p.jpg' });
    expect(ids()).toEqual(['n', 'a', 'b']);
    expect(feed.data[0].imageUrl).toBe('https://cdn.test/p.jpg');
    expect(feedCalls()).toBe(1);
  });

  it('a new post already listed by a re-read is not shown twice', async () => {
    await mount();
    const mine = apiPost('n', { author_id: 'u1' });
    serverPosts = [mine, ...serverPosts];
    await settle(() => client.invalidateQueries({ queryKey: ['community', 'feed', 'u1'] }));
    post.mockResolvedValue(mine);

    await settle(() => data.addPost('Hello'));

    expect(ids()).toEqual(['n', 'a', 'b']);
  });

  it('a paw shows the server’s count', async () => {
    await mount();
    post.mockResolvedValue(apiPost('b', { paw_count: 1, pawed_by_me: true }));

    let ok;
    await settle(async () => { ok = await data.togglePaw('b'); });

    expect(ok).toBe(true);
    expect(post).toHaveBeenCalledWith('/community/posts/b/paw');
    expect(feed.data[1]).toEqual(expect.objectContaining({ id: 'b', paws: 1, pawedByMe: true }));
  });

  // A focus refetch was already in flight when the paw landed: its older
  // list must not undo the change on screen. It is cancelled, then re-read —
  // so what it would have brought (someone else's new post) still arrives,
  // and the feed isn't left looking fresh without it.
  it('a fetch in flight cannot undo a paw, and what it would have brought still arrives', async () => {
    await mount();
    let answerOld;
    const old = serverPosts;
    get.mockImplementation((path) => {
      if (path !== '/community/posts') return otherDomains(path);
      if (answerOld) return Promise.resolve(serverPosts);
      return new Promise((resolve) => { answerOld = () => resolve(old); });
    });
    await settle(() => { client.invalidateQueries({ queryKey: ['community', 'feed', 'u1'] }); });
    expect(feedCalls()).toBe(2);
    const pawed = apiPost('b', { paw_count: 1, pawed_by_me: true });
    post.mockResolvedValue(pawed);
    serverPosts = [apiPost('z', { author_name: 'Kim' }), old[0], pawed];

    await settle(() => data.togglePaw('b'));
    await settle(() => answerOld());

    expect(feedCalls()).toBe(3);
    expect(ids()).toEqual(['z', 'a', 'b']);
    expect(feed.data[2]).toEqual(expect.objectContaining({ id: 'b', paws: 1, pawedByMe: true }));
  });

  // The server saved the comment: a cache that can't take the write must not
  // turn that into a failure (PostCard would restore the text, and a resend
  // would post it twice). The feed is re-read instead.
  it('a cache write that fails still reports the saved comment', async () => {
    await mount();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    client.setQueryData(['community', 'feed', 'u1'], { unexpected: 'shape' });
    post.mockResolvedValue({ id: 'c1', content: 'Nice' });

    let saved;
    await settle(async () => { saved = await data.addComment('b', 'Nice'); });

    expect(saved).toEqual({ id: 'c1', content: 'Nice' });
    expect(feedCalls()).toBe(2);
    expect(feed.data.map((p) => p.id)).toEqual(['a', 'b']);
    warn.mockRestore();
  });

  // The answer updates one post, not the rest: a feed due for a refetch must
  // stay due, or other people's new posts stay hidden for another 5 minutes.
  it('a paw keeps the feed as old as it was', async () => {
    await mount();
    const key = ['community', 'feed', 'u1'];
    const fetchedAt = client.getQueryState(key).dataUpdatedAt;
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    post.mockResolvedValue(apiPost('b', { paw_count: 1, pawed_by_me: true }));

    await settle(() => data.togglePaw('b'));

    expect(feed.data[1].paws).toBe(1);
    expect(client.getQueryState(key).dataUpdatedAt).toBe(fetchedAt);
    expect(feedCalls()).toBe(1);
  });

  it('a paw on an invalidated feed leaves it invalidated', async () => {
    await mount();
    const key = ['community', 'feed', 'u1'];
    // Marked stale without a refetch, as for a feed nobody is showing.
    await settle(() => client.invalidateQueries({ queryKey: key, refetchType: 'none' }));
    expect(client.getQueryState(key).isInvalidated).toBe(true);
    post.mockResolvedValue(apiPost('b', { paw_count: 1, pawed_by_me: true }));

    await settle(() => data.togglePaw('b'));

    expect(client.getQueryState(key).isInvalidated).toBe(true);
  });

  it('reporting collapses the post, and Undo restores it', async () => {
    await mount();
    post.mockResolvedValue(apiPost('a', { reported_by_me: true }));
    await settle(() => data.reportPost('a'));
    expect(post).toHaveBeenCalledWith('/community/posts/a/report');
    expect(feed.data[0].reportedByMe).toBe(true);

    del.mockResolvedValue(apiPost('a'));
    await settle(() => data.unreportPost('a'));
    expect(del).toHaveBeenCalledWith('/community/posts/a/report');
    expect(feed.data[0].reportedByMe).toBe(false);
  });

  it('a comment moves the post’s count, never below zero', async () => {
    await mount();
    post.mockResolvedValue({ id: 'c1', content: 'Nice' });
    let saved;
    await settle(async () => { saved = await data.addComment('b', 'Nice'); });
    expect(saved).toEqual({ id: 'c1', content: 'Nice' });
    expect(feed.data[1].comments).toBe(1);

    del.mockResolvedValue({});
    await settle(() => data.deleteComment('b', 'c1'));
    await settle(() => data.deleteComment('b', 'c0'));
    expect(feed.data[1].comments).toBe(0);
  });

  it('a failed paw resolves false and leaves the feed alone', async () => {
    await mount();
    post.mockRejectedValue(new Error('Network error'));

    let ok;
    await settle(async () => { ok = await data.togglePaw('a'); });

    expect(ok).toBe(false);
    expect(feed.data[0]).toEqual(expect.objectContaining({ paws: 2, pawedByMe: false }));
  });

  // Nothing cached to update (the feed never loaded): re-read it instead.
  it('with no feed loaded yet, a paw re-reads it', async () => {
    get.mockImplementation((path) => (path === '/community/posts'
      ? Promise.reject(new Error('Network error'))
      : answer(path)));
    await mount();
    expect(feed.data).toBeUndefined();
    get.mockImplementation(answer);
    serverPosts = [apiPost('a', { paw_count: 3, pawed_by_me: true }), apiPost('b')];
    post.mockResolvedValue(serverPosts[0]);

    await settle(() => data.togglePaw('a'));

    expect(feedCalls()).toBe(2);
    expect(feed.data[0]).toEqual(expect.objectContaining({ paws: 3, pawedByMe: true }));
  });
});
