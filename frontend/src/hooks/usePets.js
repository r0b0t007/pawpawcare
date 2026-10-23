import { skipToken, useQuery } from '@tanstack/react-query';
import { petsKeys } from './queryKeys';

// Just the pets — names and photos — for Home to show while the full records
// (usePetRecordsQuery: 1 + 6N requests) are still loading. The records load
// puts them here from its own /pets answer, so there is no fetch of its own
// (one /pets request at sign-in, not two). Anything that needs a pet's
// records (vaccinations included) reads those (hooks/usePetRecords.js).
// `options` pass through to useQuery (Home reads it only during the first
// load: `{ enabled: !dataLoaded }`).
export function usePetsQuery(options = {}) {
  return useQuery({ queryKey: petsKeys.all, queryFn: skipToken, ...options });
}
