// Community post card: what screen readers get (asserted on the native host
// views, not the component's own props), and the comment/paw edge cases.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import PostCard from '../PostCard';

const POST = {
  id: 'p1',
  authorId: 'u2',
  authorName: 'Sam',
  createdAt: '2026-10-13T10:00:00Z',
  content: 'Rex at the beach',
  paws: 1,
  pawedByMe: true,
  comments: 3,
};
const comment = (id, name, content) => ({
  id, author_id: 'u1', author_name: name, content, created_at: '2026-10-13T10:05:00Z',
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

let tree;
let props;
async function render(overrides = {}, post = POST) {
  props = {
    userId: 'u1',
    onPaw: jest.fn(() => Promise.resolve(true)),
    getComments: jest.fn(() => Promise.resolve([comment('c1', 'E2E', 'Cute!')])),
    addComment: jest.fn(),
    deleteComment: jest.fn(),
    reportPost: jest.fn(),
    unreportPost: jest.fn(),
    ...overrides,
  };
  await act(async () => {
    tree = TestRenderer.create(<PostCard post={post} {...props} />);
  });
}
afterEach(() => act(() => tree?.unmount()));

// What a screen reader reads: the host View a Pressable renders.
const host = (label) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label)[0];
const press = async (label) => {
  let n = host(label);
  while (n && !n.props.onPress) n = n.parent;
  // Fire and don't wait: a press may start a request the test holds open.
  await act(async () => { n.props.onPress(); });
};
const texts = () => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));

test('paw and comment buttons say what they count and their state', async () => {
  await render();

  expect(host('1 paw').props).toMatchObject({ accessibilityRole: 'button', accessibilityState: expect.objectContaining({ selected: true }) });
  expect(host('3 comments').props.accessibilityState).toMatchObject({ expanded: false });

  await press('3 comments');
  // Opening loads the real comments (1 here) and reports the expanded state.
  expect(host('1 comment').props.accessibilityState).toMatchObject({ expanded: true });
  expect(host("Report Sam's post").props.accessibilityRole).toBe('button');
  expect(host("Delete E2E's comment").props.accessibilityRole).toBe('button');
  expect(host('Send comment').props.accessibilityState).toMatchObject({ disabled: true });
});

test("a deleted author's comment still gets a readable delete label", async () => {
  await render({ getComments: jest.fn(() => Promise.resolve([comment('c1', '', 'Old note')])) });
  await press('3 comments');

  expect(host('Delete this comment')).toBeDefined();
  expect(host("Delete 's comment")).toBeUndefined();
});

// Reporting flips reportedByMe on a mounted card; an early return above a
// hook used to crash this render ("Rendered fewer hooks than expected").
test('reporting a post collapses the card without crashing, with a labelled Undo', async () => {
  await render();
  await act(async () => tree.update(<PostCard post={{ ...POST, reportedByMe: true }} {...props} />));

  expect(texts().join(' ')).toContain('Post hidden');
  expect(host('Undo report').props.accessibilityRole).toBe('button');
  await press('Undo report');
  expect(props.unreportPost).toHaveBeenCalledWith('p1');
});

test('a failed comment load says so instead of showing an empty thread', async () => {
  await render({ getComments: jest.fn(() => Promise.resolve(null)) });
  await press('3 comments');

  expect(host('3 comments')).toBeDefined(); // the post's real count is kept
  expect(texts()).toContain("Couldn't load comments. Tap to retry.");
  expect(texts().join(' ')).not.toContain('No comments yet');
});

test('a reload that started before a new comment cannot erase it', async () => {
  const slow = deferred();
  const getComments = jest.fn()
    .mockResolvedValueOnce([comment('c1', 'E2E', 'Cute!')])
    .mockReturnValueOnce(slow.promise);
  await render({ getComments, addComment: jest.fn(() => Promise.resolve(comment('c9', 'E2E', 'New one'))) });

  await press('3 comments'); // open: loads c1
  await press('1 comment'); // close
  await press('1 comment'); // reopen: slow reload in flight

  const input = tree.root.findAll((n) => n.props.accessibilityLabel === 'Add a comment' && n.props.onChangeText)[0];
  await act(async () => input.props.onChangeText('New one'));
  await press('Send comment');
  expect(texts()).toContain('New one');

  await act(async () => slow.resolve([comment('c1', 'E2E', 'Cute!')])); // stale list lands
  expect(texts()).toContain('New one');
  expect(host('2 comments')).toBeDefined();
});

test('a double tap on paw sends one toggle, not paw-then-unpaw', async () => {
  const pending = deferred();
  await render({ onPaw: jest.fn(() => pending.promise) });

  await press('1 paw');
  await press('1 paw');
  expect(props.onPaw).toHaveBeenCalledTimes(1);

  await act(async () => pending.resolve(true));
  await press('1 paw');
  expect(props.onPaw).toHaveBeenCalledTimes(2);
});
