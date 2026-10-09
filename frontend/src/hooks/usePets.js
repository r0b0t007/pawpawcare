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

export function usePetsQuery() {
  return useQuery({ queryKey: petsKeys.all, queryFn: fetchPets });
}

