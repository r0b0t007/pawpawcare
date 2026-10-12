import React from 'react';
import { ui, petPair } from '../theme';
import { petPhoto } from '../utils/pets';
import StatusRing from './StatusRing';

// A pet's face (photo, or initial on its identity tint) with a quiet identity
// ring. Pure recognition: status never lives here — rows carry it once as a
// StatusPill.
export default function PetFace({ pet, size = 34, style }) {
  if (!pet) return null;
  return (
    <StatusRing
      size={size}
      color={pet.color || ui.accentTint}
      textColor={petPair(pet.color).fg}
      initial={(pet.name || '?')[0]}
      photo={petPhoto(pet)}
      ringColor={pet.color || ui.accentTint}
      style={style}
    />
  );
}
