jest.mock('../../config', () => ({ resolveAsset: (p) => `https://cdn.test/${p}` }));
jest.mock('../../theme', () => ({ photos: { communityPals: 'pals.jpg' } }));

import i18n from '../../i18n';
import { breedLabel, breedValue, emptyPhotoFor, isMyReport, petById, petMeta, petPhoto } from '../pets';

describe('emptyPhotoFor', () => {
  test('cats get the cat photo the screen passes in', () => {
    expect(emptyPhotoFor({ type: 'cat' }, 'kitten.jpg')).toBe('kitten.jpg');
  });

  test('dogs, other species and a missing pet get the cat-and-dog pair', () => {
    expect(emptyPhotoFor({ type: 'dog' }, 'kitten.jpg')).toBe('pals.jpg');
    expect(emptyPhotoFor({ type: 'rabbit' }, 'kitten.jpg')).toBe('pals.jpg');
    expect(emptyPhotoFor(undefined, 'kitten.jpg')).toBe('pals.jpg');
  });
});

// CHW-277: a report on a shared pet is the co-owner's too, whoever filed it.
describe('isMyReport', () => {
  it('follows the server: a co-owner\'s report on my pet is mine', () => {
    expect(isMyReport({ reportedBy: 'u2', isMine: true }, 'u1')).toBe(true);
  });

  it('follows the server: someone else\'s report on a pet I left is not', () => {
    expect(isMyReport({ reportedBy: 'u2', isMine: false }, 'u1')).toBe(false);
  });

  it('falls back to who filed it when the server does not say', () => {
    expect(isMyReport({ reportedBy: 'u1' }, 'u1')).toBe(true);
    expect(isMyReport({ reportedBy: 'u2' }, 'u1')).toBe(false);
  });
});

test('petById matches ids across number/string', () => {
  expect(petById([{ id: 7, name: 'Rex' }], '7')?.name).toBe('Rex');
  expect(petById([{ id: 7 }], null)).toBeUndefined();
});

test('petPhoto only resolves a real upload', () => {
  expect(petPhoto({ avatarUrl: 'uploads/a.jpg' })).toBe('https://cdn.test/uploads/a.jpg');
  expect(petPhoto({})).toBeUndefined();
});

// CHW-191 review: the pet-card meta line is app text (species, age suffix,
// suggested breeds) and follows the app language; typed breeds never change.
describe('petMeta / breedLabel / breedValue', () => {
  const inLanguage = (lng) => i18n.changeLanguage(lng);
  afterEach(() => inLanguage('en'));

  test('English output is unchanged', async () => {
    await inLanguage('en');
    expect(petMeta({ type: 'dog', age: 4 })).toBe('Dog · 4 y');
    expect(petMeta({ type: 'cat', age: 1 })).toBe('Cat · 1 y');
    expect(petMeta({ type: 'dog', breed: 'Golden Retriever', age: 4 })).toBe('Golden Retriever · 4 y');
    expect(petMeta({ type: 'ferret' })).toBe('Ferret');
    expect(petMeta({})).toBe('');
  });

  test('French: species, age and suggested breeds translated; typed breeds as-is', async () => {
    await inLanguage('fr');
    expect(petMeta({ type: 'dog', age: 4 })).toBe('Chien · 4 ans');
    expect(petMeta({ type: 'cat', age: 1 })).toBe('Chat · 1 an');
    expect(petMeta({ type: 'dog', breed: 'Mixed', age: 2 })).toBe('Croisé · 2 ans');
    expect(petMeta({ type: 'dog', breed: 'Berger des Shetland' })).toBe('Berger des Shetland');
    expect(petMeta({ type: 'ferret' })).toBe('Ferret');
  });

  test('Spanish: species, age and suggested breeds translated', async () => {
    await inLanguage('es');
    expect(petMeta({ type: 'dog', age: 4 })).toBe('Perro · 4 años');
    expect(petMeta({ type: 'cat', age: 1 })).toBe('Gato · 1 año');
    expect(petMeta({ type: 'bird', breed: 'Budgie' })).toBe(i18n.t('addPet.breeds.budgie'));
  });

  test('breedValue stores a suggestion in English whatever the language it was shown in', async () => {
    await inLanguage('fr');
    expect(breedLabel('Mixed')).toBe('Croisé');
    expect(breedValue('Croisé')).toBe('Mixed');
    expect(breedValue('  croisé ')).toBe('Mixed');
    expect(breedValue('Mixed')).toBe('Mixed');
    expect(breedValue('Berger des Shetland ')).toBe('Berger des Shetland');
    expect(breedValue('')).toBe('');
    expect(breedLabel(null)).toBe('');
    expect(breedLabel('Berger des Shetland')).toBe('Berger des Shetland');
  });
});
