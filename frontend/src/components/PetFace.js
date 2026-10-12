import React from 'react';
import { ui, petPair } from '../theme';
import { petPhoto } from '../utils/pets';
import { speciesIcon } from './petStatus';
import StatusRing from './StatusRing';

// A pet's face (photo, or initial on its identity tint) with a quiet identity
// ring. Pure recognition: status never lives here — rows carry it once as a
// StatusPill. `ring={false}` for compact chips; `glyph` shows the species
// icon instead of the initial when there's no photo.
export default function PetFace({ pet, size = 34, ring = true, glyph = false, style }) {
  if (!pet) return null;
  return (
    <StatusRing
      size={size}
      color={pet.color || ui.accentTint}
      textColor={petPair(pet.color).fg}
      initial={(pet.name || '?')[0]}
      icon={glyph ? speciesIcon(pet.type) : undefined}
      photo={petPhoto(pet)}
      ringColor={ring ? pet.color || ui.accentTint : undefined}
      style={style}
    />
  );
}
