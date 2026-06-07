// ============================================================
// useInfiniteList
//
// Wraps useInfiniteQuery with:
//   - Cursor-based getNextPageParam (last.cursor → undefined)
//   - IntersectionObserver sentinel ref for auto-load-more
//   - Flattened `items` array selector
//
// Usage:
//   const { items, sentinelRef, isFetchingNextPage, status } =
//     useInfiniteList({
//       queryKey: queryKeys.timeline.home(),
//       queryFn: ({ pageParam }) => timelineApi.getHome(pageParam as string | null),
//       staleTime: 30_000,
//     })
//
// Attach `sentinelRef` to a bottom div to trigger auto-load.
// ============================================================

import { useCallback, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { QueryKey, QueryFunction } from '@tanstack/react-query'
import type { CursorPage } from '@/types/api'

interface InfiniteListOptions<T> {
  queryKey: QueryKey
  queryFn: QueryFunction<CursorPage<T>, QueryKey, string | null>
  staleTime: number // required — must be explicit per frontend.md
  gcTime?: number
  enabled?: boolean
}

interface UseInfiniteListResult<T> {
  items: T[]
  sentinelRef: (node: HTMLElement | null) => void
  status: 'pending' | 'error' | 'success'
  error: Error | null
  isFetchingNextPage: boolean
  isFetching: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  refetch: () => void
}

export function useInfiniteList<T>({
  queryKey,
  queryFn,
  staleTime,
  gcTime,
  enabled,
}: InfiniteListOptions<T>): UseInfiniteListResult<T> {
  const {
    data,
    status,
    error,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: CursorPage<T>) => lastPage.cursor ?? undefined,
    staleTime,
    gcTime,
    enabled,
  })

  // Flatten all pages into a single items array
  const pages = (data?.pages as CursorPage<T>[] | undefined) ?? []
  const items: T[] = pages.flatMap((page) => page.items)

  // IntersectionObserver sentinel for auto load-more
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelNodeRef = useRef<HTMLElement | null>(null)

  const setupObserver = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' }, // trigger 200px before sentinel enters viewport
    )

    if (sentinelNodeRef.current) {
      observerRef.current.observe(sentinelNodeRef.current)
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Re-setup observer when pagination state changes
  useEffect(() => {
    setupObserver()
    return () => observerRef.current?.disconnect()
  }, [setupObserver])

  // Callback ref so we track the sentinel element
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    sentinelNodeRef.current = node
    if (observerRef.current) {
      observerRef.current.disconnect()
      if (node) observerRef.current.observe(node)
    }
  }, [])

  return {
    items,
    sentinelRef,
    status: status as 'pending' | 'error' | 'success',
    error: error as Error | null,
    isFetchingNextPage,
    isFetching,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    refetch,
  }
}
