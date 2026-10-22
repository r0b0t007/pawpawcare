import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toPost } from '../context/DataContext';
import { useLocale } from '../i18n';
import { communityKeys } from './queryKeys';

// The community feed. Posting, pawing, reporting and commenting stay in
// DataContext, which write the server's answer into this cache.
//
// The cache holds the server's posts as they came; they are mapped per render
// language, because toPost's fallback author name must follow a language
// switch without a refetch.
export function useFeedQuery() {
  const { user } = useAuth();
  const locale = useLocale();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const select = useCallback((posts) => posts.map(toPost), [locale]);
  return useQuery({
    queryKey: communityKeys.feed(user?.id),
    queryFn: () => get('/community/posts'),
    enabled: !!user,
    select,
  });
}
