import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toLostPet } from '../context/DataContext';
import { useLocaleSelect } from './useLocaleSelect';
import { lostPetsKeys } from './queryKeys';

// Lost-pet reports. Reporting and resolving stay in DataContext
// (reportPetLost/resolveLostPet), which re-read both lists before resolving.
//
// The cache holds the server's reports as they came; they are mapped per
// render language (useLocaleSelect), because toLostPet's fallback name
// ("A pet") must follow a language switch without a refetch.

// Other owners post and resolve reports at any time, so the board is fresh
// for a minute rather than the app-wide five.
export const BOARD_STALE_MS = 60 * 1000;

// The community board: every active report, newest first.
export function useLostPetsBoardQuery() {
  const { user } = useAuth();
  const select = useLocaleSelect(toLostPet);
  return useQuery({
    queryKey: lostPetsKeys.board(user?.id),
    queryFn: () => get('/lost-pets'),
    enabled: !!user,
    staleTime: BOARD_STALE_MS,
    select,
  });
}

// My reports, active and resolved: those on pets I own or share, whoever in
// the family filed them, and active ones I filed (CHW-277) — each `isMine`.
// Never filter them by reportedBy. Until they load, data stays undefined
// (never a stand-in []), so a screen can tell "not lost" from "not known yet".
export function useMyLostReportsQuery() {
  const { user } = useAuth();
  const select = useLocaleSelect(toLostPet);
  return useQuery({
    queryKey: lostPetsKeys.mine(user?.id),
    queryFn: () => get('/lost-pets/mine'),
    enabled: !!user,
    select,
  });
}
