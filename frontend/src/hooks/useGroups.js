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

// This account's most recently fetched list, in whichever language.
function newestList(queryClient, userId) {
  if (!userId) return undefined;
  const [newest] = queryClient
    .getQueryCache()
    .findAll({ queryKey: communityKeys.groupsFor(userId) })
    .filter((q) => q.state.data)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return newest?.state.data;
}

export function useGroupsQuery() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: communityKeys.groups(user?.id, user?.locale),
    queryFn: fetchGroups,
    enabled: !!user,
    // A new language starts from this account's last list, marked stale so it
    // is fetched at once: the groups stay on screen while the new names load,
    // and stay if that fetch fails. It is this key's own cache entry, so a
    // join updates exactly what is shown. Never another account's list.
    initialData: () => newestList(queryClient, user?.id),
    initialDataUpdatedAt: 0,
  });
  return query;
}
