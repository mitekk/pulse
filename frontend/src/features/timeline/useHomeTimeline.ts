// ============================================================
// useHomeTimeline — home timeline infinite list hook
// Uses useInfiniteList with timeline.home query key + staleTime.
// ============================================================

import { useInfiniteList } from '@/hooks/useInfiniteList'
import { timelineApi } from '@/lib/api/timeline'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { PostDto } from '@/types/api'

export function useHomeTimeline() {
  return useInfiniteList<PostDto>({
    queryKey: queryKeys.timeline.home(),
    queryFn: ({ pageParam }) =>
      timelineApi.getHome(pageParam as string | undefined),
    // Home timeline: moderate staleness — WS post.counters keeps counts live
    staleTime: 30_000,
  })
}
