// Private feedback / support form: category chips, what's sent, and failures.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.4.0', nativeBuildVersion: '37' }));
jest.mock('../../../services/api', () => ({ post: jest.fn() }));
jest.mock('../../../services/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../components/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));

import React from 'react';
import { Platform, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import SupportScreen from '../SupportScreen';
import { post } from '../../../services/api';
import { track } from '../../../services/analytics';
import { showToast } from '../../../components/Toast';

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

async function render(params) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<SupportScreen navigation={navigation} route={{ params }} />);
  });
  return tree;
}

const chip = (tree, label) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.accessibilityState)[0];
const selected = (tree, label) => chip(tree, label).props.accessibilityState.selected;
const input = (tree) => tree.root.findAllByType(TextInput)[0];
const sendButton = (tree) => tree.root.findAll((n) => n.props.label === 'Send message' || n.props.label === 'Sending…')[0];

async function type(tree, text) {
  await act(async () => input(tree).props.onChangeText(text));
}

async function send(tree) {
  await act(async () => sendButton(tree).props.onPress());
}

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
});

test('opened from "Send feedback", the Feedback chip is preselected', async () => {
  const tree = await render({ category: 'feedback' });

  expect(selected(tree, 'Feedback')).toBe(true);
  expect(selected(tree, 'Problem')).toBe(false);
  expect(input(tree).props.placeholder).toMatch(/what's working/i);
});

test('the category is optional: tapping the active chip clears it', async () => {
  const tree = await render({ category: 'feedback' });

  await act(async () => chip(tree, 'Feedback').props.onPress());
  expect(selected(tree, 'Feedback')).toBe(false);

  await act(async () => chip(tree, 'Idea').props.onPress());
  expect(selected(tree, 'Idea')).toBe(true);
});

test('an unknown category param is ignored', async () => {
  const tree = await render({ category: 'rant' });
  expect(['Feedback', 'Problem', 'Idea', 'Question'].some((l) => selected(tree, l))).toBe(false);
});

test('sends the message with its category and app context, then thanks and closes', async () => {
  post.mockResolvedValue({ id: 'm1' });
  const tree = await render({ category: 'feedback' });

  await type(tree, '  Love the reminders.  ');
  await send(tree);

  expect(post).toHaveBeenCalledWith('/support/messages', {
    message: 'Love the reminders.',
    category: 'feedback',
    app_version: '1.4.0 (37)',
    platform: 'android',
  });
  expect(track).toHaveBeenCalledWith('support_message_sent', { category: 'feedback' });
  expect(showToast).toHaveBeenCalledWith('Thanks — we read every note');
  expect(navigation.goBack).toHaveBeenCalled();
});

test('without a category it still sends, as a plain support message', async () => {
  post.mockResolvedValue({ id: 'm2' });
  const tree = await render();

  await type(tree, 'Reminders stopped');
  await send(tree);

  expect(post).toHaveBeenCalledWith('/support/messages', expect.objectContaining({ category: null }));
  expect(track).toHaveBeenCalledWith('support_message_sent', { category: 'none' });
});

test('an empty message cannot be sent', async () => {
  const tree = await render({ category: 'feedback' });

  await type(tree, '   ');
  expect(sendButton(tree).props.disabled).toBe(true);
  await send(tree);
  expect(post).not.toHaveBeenCalled();
});

test('a failure keeps the message and shows why', async () => {
  post.mockRejectedValue(new Error('Too many requests'));
  const tree = await render({ category: 'problem' });

  await type(tree, 'It crashed');
  await send(tree);

  expect(showToast).toHaveBeenCalledWith('Too many requests');
  expect(input(tree).props.value).toBe('It crashed');
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(track).not.toHaveBeenCalled();
});
