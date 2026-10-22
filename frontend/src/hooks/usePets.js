import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { toPet } from '../context/DataContext';
import { petsKeys } from './queryKeys';

// Just the pets — names and photos, one request — for Home to show while the
// full records (usePetRecordsQuery: 1 + 6N requests) are still loading.
// Anything that needs a pet's records (vaccinations included) reads those.
async function fetchPets() {
  const apiPets = await get('/pets');
  return apiPets.map((apiPet, index) => toPet(apiPet, { index }));
}

// `options` pass through to useQuery (e.g. Home only needs it during the
// first load: `{ enabled: !dataLoaded }`).
export function usePetsQuery(options = {}) {
  return useQuery({ queryKey: petsKeys.all, queryFn: fetchPets, ...options });
}

