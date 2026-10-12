import { resolveAsset } from '../config';
import { photos } from '../theme';

// The user's own photo for a pet, resolved to a full URL — undefined when
// there is none (callers fall back to the identity tint, never stock).
export const petPhoto = (pet) => (pet?.avatarUrl ? resolveAsset(pet.avatarUrl) : undefined);

// Decorative empty-state photo for a screen about one pet: the given cat
// photo for cats, a cat-and-dog pair for everyone else, so a dog's screen
// never shows a lone kitten. Stock is decoration only, never the pet itself.
export const emptyPhotoFor = (pet, catPhoto) => (pet?.type === 'cat' ? catPhoto : photos.communityPals);

// The pet with this id, comparing as strings (API ids can arrive as numbers
// or strings depending on the payload) — undefined when there's none.
export const petById = (pets, id) =>
  id == null ? undefined : (pets || []).find((p) => String(p.id) === String(id));

// 'Golden Retriever · 4 y' — breed (or species) and age, whichever exist.
export const petMeta = (pet) =>
  [
    pet.breed || (pet.type ? pet.type.charAt(0).toUpperCase() + pet.type.slice(1) : null),
    pet.age ? `${pet.age} y` : null,
  ]
    .filter(Boolean)
    .join(' · ');
