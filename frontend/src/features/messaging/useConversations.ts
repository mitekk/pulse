// ============================================================
// useConversations — infinite list of conversations
// Ordered by latest message; live-bumped via WS dm.message
// ============================================================

import { useInfiniteList } from '@/hooks/useInfiniteList'
import { messagingApi } from '@/lib/api/messaging'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { ConversationDto } from '@/types/api'

interface UseConversationsResult {
  conversations: ConversationDto[]
  sentinelRef: (node: HTMLElement | null) => void
  status: 'pending' | 'error' | 'success'
  error: Error | null
  isFetchingNextPage: boolean
  hasNextPage: boolean
}

export function useConversations(): UseConversationsResult {
  const { items, sentinelRef, status, error, isFetchingNextPage, hasNextPage } =
    useInfiniteList<ConversationDto>({
      queryKey: queryKeys.conversations.list(),
      queryFn: ({ pageParam }) =>
        messagingApi.getConversations(pageParam as string | null ?? undefined),
      staleTime: 0, // always-fresh: conversations update frequently via WS
    })

  // Sort by latest message descending (WS dm.message bumps the list
  // in-cache; we sort the flattened items to keep order correct)
  const sorted = [...items].sort((a, b) => {
    const ta = a.lastMessage?.createdAt ?? a.createdAt
    const tb = b.lastMessage?.createdAt ?? b.createdAt
    return new Date(tb).getTime() - new Date(ta).getTime()
  })

  return {
    conversations: sorted,
    sentinelRef,
    status,
    error,
    isFetchingNextPage,
    hasNextPage,
  }
}
