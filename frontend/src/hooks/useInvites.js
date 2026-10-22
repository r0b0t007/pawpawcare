import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toInvite } from '../context/DataContext';
import { invitesKeys } from './queryKeys';
import { useLogoutOnExpiredSession } from './useSessionExpiry';

// Pet-sharing invitations addressed to me. Accepting and declining stay in
// DataContext (acceptInvite/declineInvite), which drop the resolved invite
// from this cache. The server answers [] until the account's email is
// confirmed, so InvitesScreen refetches once it is.
async function fetchInvites() {
  const apiInvites = await get('/invites');
  return apiInvites.map(toInvite);
}

export function useInvitesQuery() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: invitesKeys.list(user?.id),
    queryFn: fetchInvites,
    enabled: !!user,
  });
  useLogoutOnExpiredSession(query.error);
  return query;
}
