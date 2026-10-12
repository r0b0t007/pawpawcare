import { resolveAsset } from '../config';

// The user's own photo for a pet, resolved to a full URL — undefined when
// there is none (callers fall back to the identity tint, never stock).
export const petPhoto = (pet) => (pet?.avatarUrl ? resolveAsset(pet.avatarUrl) : undefined);

// 'Golden Retriever · 4 y' — breed (or species) and age, whichever exist.
export const petMeta = (pet) =>
  [
    pet.breed || (pet.type ? pet.type.charAt(0).toUpperCase() + pet.type.slice(1) : null),
    pet.age ? `${pet.age} y` : null,
  ]
    .filter(Boolean)
    .join(' · ');
