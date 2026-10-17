// Help guides (CHW-175): each guide renders all of its sections in order,
// its action opens the screen it's about, and every key it reads exists.
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import GuideScreen from '../GuideScreen';
import Button from '../../../components/Button';
import { GUIDES } from '../guides';
import en from '../../../i18n/en.json';

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

async function render(id) {
  let tree;
  await act(async () => {
    tree = TestRenderer.create(<GuideScreen navigation={navigation} route={{ params: { id } }} />);
  });
  return tree;
}

const texts = (tree) => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
const button = (tree, label) => tree.root.findAll((n) => n.type === Button && n.props.label === label)[0];

beforeEach(() => jest.clearAllMocks());

// A missing key would render as its dotted path, silently.
test('every guide key exists in en.json', () => {
  const get = (path) => path.split('.').reduce((o, k) => o?.[k], en);
  const missing = GUIDES.flatMap((g) => [
    `support.guide.${g.id}`,
    `guides.${g.id}.intro`,
    `guides.${g.id}.cta`,
    ...g.sections.flatMap((s) => [
      `guides.${g.id}.${s.id}.title`,
      `guides.${g.id}.${s.id}.body`,
      ...Array.from({ length: s.steps ?? 0 }, (_, i) => `guides.${g.id}.${s.id}.step${i + 1}`),
    ]),
  ]).filter((key) => typeof get(key) !== 'string');

  expect(missing).toEqual([]);
});

test('a guide shows its title, intro, then each section with its steps in order', async () => {
  const all = texts(await render('gettingStarted'));
  const at = (s) => all.indexOf(s);

  expect(all).toContain('Getting started');
  expect(at(en.guides.gettingStarted.intro)).toBeGreaterThan(at('Getting started'));
  expect(at('Add your pet')).toBeGreaterThan(at(en.guides.gettingStarted.intro));
  expect(at(en.guides.gettingStarted.addPet.step1)).toBeGreaterThan(at('Add your pet'));
  expect(at(en.guides.gettingStarted.addPet.step3)).toBeGreaterThan(at(en.guides.gettingStarted.addPet.step2));
  expect(at('Let AI read a vet document')).toBeGreaterThan(at(en.guides.gettingStarted.addPet.step3));
  expect(all).toEqual(expect.arrayContaining(['1', '2', '3']));
});

test('the guide title and each section title are announced as headers', async () => {
  const tree = await render('sharing');
  const headers = tree.root.findAll((n) => n.type === Text && n.props.accessibilityRole === 'header')
    .map((n) => [].concat(n.props.children).join(''));

  expect(headers).toEqual([
    'Sharing with family & your vet',
    ...GUIDES.find((g) => g.id === 'sharing').sections.map((s) => en.guides.sharing[s.id].title),
  ]);
});

test.each([
  // On top of PetsList, never alone in a tab that was never visited.
  ['gettingStarted', 'Add a pet', ['Pets', { screen: 'AddPet', initial: false }]],
  // In the Profile stack, so Back returns to the guide.
  ['reminders', 'Open reminders', ['Reminders']],
  ['sharing', 'Open pet sharing & invites', ['Invites']],
])('the %s guide opens the screen it is about', async (id, label, target) => {
  const tree = await render(id);

  await act(async () => button(tree, label).props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith(...target);
});

test('"Message us" returns to the help form by name, wherever the guide was opened from', async () => {
  const tree = await render('reminders');

  await act(async () => button(tree, 'Still need help? Message us').props.onPress());
  expect(navigation.navigate).toHaveBeenCalledWith('Support');
  expect(navigation.goBack).not.toHaveBeenCalled();
});

test('step numbers are hidden from screen readers (the list order already numbers them)', async () => {
  const tree = await render('gettingStarted');
  // Host nodes only: each <View> also appears as its composite wrapper.
  const badges = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityElementsHidden
    && n.props.importantForAccessibility === 'no-hide-descendants'
    && n.findAllByType(Text).length === 1);

  expect(badges.map((b) => [].concat(b.findByType(Text).props.children).join(''))).toEqual(['1', '2', '3']);
});

test('an unknown guide id warns in development and falls back to the first guide', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  expect(texts(await render('nope'))).toContain('Getting started');
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'));
  warn.mockRestore();
});
