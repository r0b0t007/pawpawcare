import { resolveAsset } from '../config';
import i18n from '../i18n';
import { formatDecimal, pluralCount } from './numbers';
import { photos } from '../theme';

// The user's own photo for a pet, resolved to a full URL — undefined when
// there is none (callers fall back to the identity tint, never stock).
export const petPhoto = (pet) => (pet?.avatarUrl ? resolveAsset(pet.avatarUrl) : undefined);

// Decorative empty-state photo for a screen about one pet: the given cat
// photo for cats, a cat-and-dog pair for everyone else, so a dog's screen
// never shows a lone kitten. Stock is decoration only, never the pet itself.
export const emptyPhotoFor = (pet, catPhoto) => (pet?.type === 'cat' ? catPhoto : photos.communityPals);

// Whether the signed-in user owns this pet (as opposed to co-owning it). The
// API reserves deleting the pet and managing its care team to the owner and
// answers anyone else with 403, so screens offer those actions only when this
// is true. Ids compare as strings, like petById.
export const isPetOwner = (pet, user) =>
  !!pet && pet.ownerId != null && user?.id != null && String(pet.ownerId) === String(user.id);

// The pet with this id, comparing as strings (API ids can arrive as numbers
// or strings depending on the payload) — undefined when there's none.
export const petById = (pets, id) =>
  id == null ? undefined : (pets || []).find((p) => String(p.id) === String(id));

// The breed suggestions AddPet offers as chips: stored value (always English,
// whatever the app language) -> i18n key under addPet.breeds. Breeds the user
// typed are their own data and are never translated.
export const BREED_KEYS = {
  'Golden Retriever': 'goldenRetriever',
  Labrador: 'labrador',
  Mixed: 'mixed',
  'Domestic Shorthair': 'domesticShorthair',
  Siamese: 'siamese',
  'Mini Lop': 'miniLop',
  'Netherland Dwarf': 'netherlandDwarf',
  Budgie: 'budgie',
  Cockatiel: 'cockatiel',
  Parrot: 'parrot',
};

/** A stored breed as shown in the app language: suggestions translated, typed breeds as-is. */
export const breedLabel = (breed) => {
  const key = breed ? BREED_KEYS[breed] : null;
  return key ? i18n.t(`addPet.breeds.${key}`) : breed || '';
};

/**
 * The value to store for breed text shown in (or typed into) a breed field:
 * a suggestion's label in the app language maps back to its English stored
 * value, so 'Croisé' is saved as 'Mixed'. Anything else is kept as typed.
 */
export const breedValue = (text) => {
  const typed = (text || '').trim();
  if (!typed) return '';
  const folded = typed.toLocaleLowerCase();
  const stored = Object.keys(BREED_KEYS).find(
    (value) => value.toLocaleLowerCase() === folded || breedLabel(value).toLocaleLowerCase() === folded,
  );
  return stored ?? typed;
};

/** A species id ('dog') in the app language ('Chien'), capitalised id for an unknown one. */
export const speciesLabel = (type) =>
  type ? i18n.t(`pets.types.${type}`, { defaultValue: type.charAt(0).toUpperCase() + type.slice(1) }) : null;

// 'Golden Retriever · 4 y' — breed (or species) and age, whichever exist, in
// the app language ('Chien · 4 ans').
export const petMeta = (pet) =>
  [
    pet.breed ? breedLabel(pet.breed) : speciesLabel(pet.type),
    pet.age ? i18n.t('pets.ageShort', { count: pluralCount(Number(pet.age)), age: formatDecimal(pet.age, { min: 0, max: 1 }) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

// A lost-pet report I may treat as mine and mark found: on a pet I own or
// share (whoever in the family filed it), or filed by me. The server says so
// (`is_mine`); before it did, only the reporter could.
export const isMyReport = (report, userId) => report.isMine ?? report.reportedBy === userId;
