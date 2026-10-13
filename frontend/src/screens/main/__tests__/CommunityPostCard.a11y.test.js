// Post card controls are icon + count only: screen readers must get a label
// and state, not the icon glyph and a bare number (found on the e2e build).
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-gesture-handler', () => {
  const chain = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children }) => children,
  };
});
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../../context/DataContext', () => ({ useData: () => ({}) }));
jest.mock('../../../services/imagePicker', () => ({ pickAndUploadImage: jest.fn() }));
jest.mock('../../../services/api', () => ({ uploadImage: jest.fn() }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PostCard } from '../CommunityScreen';

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

const COMMENTS = [{ id: 'c1', author_id: 'u1', author_name: 'E2E', content: 'Cute!', created_at: '2026-10-13T10:05:00Z' }];

async function render(post = POST) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(
      <PostCard
        post={post}
        userId="u1"
        onPaw={jest.fn()}
        getComments={jest.fn(() => Promise.resolve(COMMENTS))}
        addComment={jest.fn()}
        deleteComment={jest.fn()}
        reportPost={jest.fn()}
        unreportPost={jest.fn()}
      />
    );
  });
  return tree;
}

const byLabel = (tree, label) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.accessibilityRole === 'button')[0];

test('paw and comment buttons say what they count and their state', async () => {
  const tree = await render();

  const paw = byLabel(tree, '1 paw');
  expect(paw.props.accessibilityState).toEqual({ selected: true });

  const comments = byLabel(tree, '3 comments');
  expect(comments.props.accessibilityState).toEqual({ expanded: false });

  await act(async () => comments.props.onPress());
  // Opening loads the real comments (1 here) and reports the expanded state.
  expect(byLabel(tree, '1 comment').props.accessibilityState).toEqual({ expanded: true });
});

test("someone else's post can be reported through a labelled button", async () => {
  const tree = await render();
  expect(byLabel(tree, "Report Sam's post")).toBeDefined();
});

test('comment controls are labelled once the comments are open', async () => {
  const tree = await render();
  await act(async () => byLabel(tree, '3 comments').props.onPress());

  expect(byLabel(tree, "Delete E2E's comment")).toBeDefined();
  expect(byLabel(tree, 'Send comment').props.accessibilityState).toEqual({ disabled: true });
});
