// ============================================================
// useMessages — reverse-paginated infinite list for a thread
// Older messages are fetched on scroll-up (first page = newest)
// ============================================================

import { useCallback, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { messagingApi } from '@/lib/api/messaging'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { MessageDto, CursorPage } from '@/types/api'

interface UseMessagesResult {
  messages: MessageDto[]
  /** Attach to a top sentinel to trigger loading older messages */
  topSentinelRef: (node: HTMLElement | null) => void
  status: 'pending' | 'error' | 'success'
  error: Error | null
  isFetchingNextPage: boolean
  hasNextPage: boolean
}

export function useMessages(conversationId: string): UseMessagesResult {
  const { data, status, error, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery<CursorPage<MessageDto>>({
      queryKey: queryKeys.conversations.messages(conversationId),
      queryFn: ({ pageParam }) =>
        messagingApi.getMessages(conversationId, pageParam as string | null ?? undefined),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage: CursorPage<MessageDto>) => lastPage.cursor ?? undefined,
      staleTime: 0,
    })

  // Flatten all pages; server returns newest-first within each page,
  // so reverse the page order to get chronological order for rendering.
  const pages = (data?.pages as CursorPage<MessageDto>[] | undefined) ?? []
  // Pages are fetched newest-first; when rendered bottom-up we want
  // page[0] items at the bottom, page[1] older above, etc.
  const messages: MessageDto[] = pages.flatMap((page) => page.items).reverse()

  // IntersectionObserver on top sentinel for scroll-up load-more
  const observerRef = useRef<IntersectionObserver | null>(null)
  const topNodeRef = useRef<HTMLElement | null>(null)

  const setupObserver = useCallback(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    if (topNodeRef.current) observerRef.current.observe(topNodeRef.current)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    setupObserver()
    return () => observerRef.current?.disconnect()
  }, [setupObserver])

  const topSentinelRef = useCallback((node: HTMLElement | null) => {
    topNodeRef.current = node
    if (observerRef.current) {
      observerRef.current.disconnect()
      if (node) observerRef.current.observe(node)
    }
  }, [])

  return {
    messages,
    topSentinelRef,
    status: status as 'pending' | 'error' | 'success',
    error: error as Error | null,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
  }
}
