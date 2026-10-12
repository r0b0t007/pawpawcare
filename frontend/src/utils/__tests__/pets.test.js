jest.mock('../../config', () => ({ resolveAsset: (p) => `https://cdn.test/${p}` }));
jest.mock('../../theme', () => ({ photos: { communityPals: 'pals.jpg' } }));

import { emptyPhotoFor, petById, petPhoto } from '../pets';

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

test('petById matches ids across number/string', () => {
  expect(petById([{ id: 7, name: 'Rex' }], '7')?.name).toBe('Rex');
  expect(petById([{ id: 7 }], null)).toBeUndefined();
});

test('petPhoto only resolves a real upload', () => {
  expect(petPhoto({ avatarUrl: 'uploads/a.jpg' })).toBe('https://cdn.test/uploads/a.jpg');
  expect(petPhoto({})).toBeUndefined();
});
