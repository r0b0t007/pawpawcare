import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { toPet } from '../context/DataContext';
import { petsKeys } from './queryKeys';

// Pets with vaccinations only — enough for list cards and status badges.
// Screens that need the full sub-resource set (profile) still read DataContext.
async function fetchPets() {
  const apiPets = await get('/pets');
  return Promise.all(
    apiPets.map(async (apiPet, index) => {
      const vaccinations = await get(`/pets/${apiPet.id}/vaccinations`);
      return toPet(apiPet, { vaccinations, index });
    })
  );
}

// `options` pass through to useQuery (e.g. Home only needs it during the
// first load: `{ enabled: !dataLoaded }`).
export function usePetsQuery(options = {}) {
  return useQuery({ queryKey: petsKeys.all, queryFn: fetchPets, ...options });
}

