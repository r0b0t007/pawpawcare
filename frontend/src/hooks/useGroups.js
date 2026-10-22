import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toGroup } from '../context/DataContext';
import { communityKeys } from './queryKeys';

// Community groups. Joining/leaving stays in DataContext (toggleGroupMembership),
// which writes the answer into this query's cache.
//
// The seeded groups' names and descriptions come back in the account's saved
// language (the server prefers users.locale over Accept-Language), so the
// locale is part of the key: once updateUser has saved a new language and
// handed back the user, the key changes and the groups are fetched in it.
// Keying on i18n's own language instead would race that save and get the old
// language back. Each language is its own query, so an earlier fetch that
// answers late can never overwrite the newer one.
async function fetchGroups() {
  const apiGroups = await get('/community/groups');
  return apiGroups.map(toGroup);
}

export function useGroupsQuery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: communityKeys.groups(user?.id, user?.locale),
    queryFn: fetchGroups,
    enabled: !!user,
  });
  if (query.data || !user) return query;
  // While the new language's groups load, or if that fetch fails, show this
  // account's newest list in another language rather than none — including
  // an earlier fetch that only answered after the switch.
  const [newest] = queryClient
    .getQueryCache()
    .findAll({ queryKey: communityKeys.groupsFor(user.id) })
    .filter((q) => q.state.data)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return { ...query, data: newest?.state.data };
}
