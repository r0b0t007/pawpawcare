import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toInvite } from '../context/DataContext';
import { useLocale } from '../i18n';
import { invitesKeys } from './queryKeys';

// Pet-sharing invitations addressed to me. Accepting and declining stay in
// DataContext (acceptInvite/declineInvite), which drop the resolved invite
// from this cache. The server answers [] until the account's email is
// confirmed, so InvitesScreen refetches once it is.
//
// The cache holds the server's invites as they came; they are mapped per
// render language, because toInvite fills in translated fallbacks ("a pet",
// "Someone") that must follow a language switch without a refetch.
export function useInvitesQuery() {
  const { user } = useAuth();
  const locale = useLocale();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const select = useCallback((invites) => invites.map(toInvite), [locale]);
  return useQuery({
    queryKey: invitesKeys.list(user?.id),
    queryFn: () => get('/invites'),
    enabled: !!user,
    select,
  });
}
