import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toPost } from '../context/DataContext';
import { communityKeys } from './queryKeys';
import { useLocaleSelect } from './useLocaleSelect';

// The community feed. Posting, pawing, reporting and commenting stay in
// DataContext, which write the server's answer into this cache.
const feedQuery = (user) => ({
  queryKey: communityKeys.feed(user?.id),
  queryFn: () => get('/community/posts'),
  enabled: !!user,
});

// The cache holds the server's posts as they came; they are mapped per render
// language (useLocaleSelect), because toPost's fallback author name must
// follow a language switch without a refetch.
export function useFeedQuery() {
  const { user } = useAuth();
  const select = useLocaleSelect(toPost);
  return useQuery({ ...feedQuery(user), select });
}

const countPosts = (posts) => posts.length;

// Home's teaser only needs how many posts there are: no mapping, and no
// re-render when a paw or a comment changes a post. undefined until the feed
// has loaded (or if it failed) — not 0.
export function useFeedCount() {
  const { user } = useAuth();
  return useQuery({ ...feedQuery(user), select: countPosts });
}
