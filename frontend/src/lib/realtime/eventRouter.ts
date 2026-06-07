// ============================================================
// WebSocket Event Router
//
// Maps every server→client WS event to either:
//   a) A TanStack Query cache mutation (no refetch)
//   b) A Zustand store update
//
// Cache-effect table (architecture.md §C5.3):
//   dm.message        → prepend to conversation messages cache;
//                       update conversation list (lastMessage, unreadCount);
//                       set unread badge via unreadStore
//   dm.typing         → typingStore.setTyping
//   dm.read           → patch conversation cache (clear unread)
//   notification.new  → prepend to notifications list;
//                       unreadStore.incrementNotifications
//   timeline.newPosts → timelineBufferStore.add (no auto-inject)
//   post.counters     → patchPostInCaches with new counter values
//   follow.update     → invalidate profile + follower count queries
//                       (too complex for in-place patch; shallow invalidate)
//
// Called once from useRealtimeSetup hook on mount.
// Handlers are removed on cleanup (socket.off).
// ============================================================

import type { QueryClient } from '@tanstack/react-query'
import type { AppSocket } from './socket'
import type { MessageDto, NotificationDto, ConversationDto, PostDto } from '@/types/api'
import { queryKeys } from '@/lib/cache/queryKeys'
import { patchPostInCaches } from '@/lib/cache/patchPost'
import { useTypingStore } from '@/lib/stores/typingStore'
import { useTimelineBufferStore } from '@/lib/stores/timelineBufferStore'
import { useUnreadStore } from '@/lib/stores/unreadStore'
import type { CursorPage } from '@/types/api'

// ── dm.message ────────────────────────────────────────────

function handleDmMessage(queryClient: QueryClient, message: MessageDto): void {
  const convId = message.conversationId

  // 1. Prepend to the messages infinite list for this conversation
  const messagesKey = queryKeys.conversations.messages(convId)
  queryClient.setQueryData<{ pages: CursorPage<MessageDto>[]; pageParams: unknown[] }>(
    messagesKey,
    (prev) => {
      if (!prev) return prev
      const [firstPage, ...rest] = prev.pages
      return {
        ...prev,
        pages: [
          {
            ...firstPage,
            items: [message, ...firstPage.items],
          },
          ...rest,
        ],
      }
    },
  )

  // 2. Update conversation list: bump lastMessage + unreadCount
  const convListKey = queryKeys.conversations.list()
  queryClient.setQueryData<{ pages: CursorPage<ConversationDto>[]; pageParams: unknown[] }>(
    convListKey,
    (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          items: page.items.map((conv) => {
            if (conv.id !== convId) return conv
            return {
              ...conv,
              lastMessage: message,
              unreadCount: conv.unreadCount + 1,
            }
          }),
        })),
      }
    },
  )

  // 3. Update unread badge
  useUnreadStore.getState().addUnreadConversation(convId)
}

// ── dm.typing ─────────────────────────────────────────────

function handleDmTyping(payload: { conversationId: string; userId: string }): void {
  useTypingStore.getState().setTyping(payload.conversationId, payload.userId)
}

// ── dm.read ───────────────────────────────────────────────

function handleDmRead(
  queryClient: QueryClient,
  payload: { conversationId: string; userId: string; lastReadMessageId: string },
): void {
  const { conversationId } = payload

  // Patch conversation list: zero out unread for this conv
  const convListKey = queryKeys.conversations.list()
  queryClient.setQueryData<{ pages: CursorPage<ConversationDto>[]; pageParams: unknown[] }>(
    convListKey,
    (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          items: page.items.map((conv) =>
            conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv,
          ),
        })),
      }
    },
  )

  // Clear unread badge for this conversation
  useUnreadStore.getState().clearConversation(conversationId)
}

// ── notification.new ──────────────────────────────────────

function handleNotificationNew(
  queryClient: QueryClient,
  notification: NotificationDto,
): void {
  // Prepend to notification list
  const notifKey = queryKeys.notifications.list()
  queryClient.setQueryData<{ pages: CursorPage<NotificationDto>[]; pageParams: unknown[] }>(
    notifKey,
    (prev) => {
      if (!prev) return prev
      const [firstPage, ...rest] = prev.pages
      return {
        ...prev,
        pages: [
          {
            ...firstPage,
            items: [notification, ...firstPage.items],
          },
          ...rest,
        ],
      }
    },
  )

  // Bump unread count cache entry
  queryClient.setQueryData<{ count: number }>(queryKeys.notifications.unreadCount(), (prev) =>
    prev ? { count: prev.count + 1 } : { count: 1 },
  )

  // Bump Zustand badge
  useUnreadStore.getState().incrementNotifications()
}

// ── timeline.newPosts ─────────────────────────────────────

function handleTimelineNewPosts(payload: { count: number; previewIds: string[] }): void {
  useTimelineBufferStore.getState().add(payload.count, payload.previewIds)
}

// ── post.counters ─────────────────────────────────────────

function handlePostCounters(
  queryClient: QueryClient,
  payload: { postId: string; likes: number; replies: number; reposts: number },
): void {
  patchPostInCaches(queryClient, payload.postId, (post: PostDto) => ({
    ...post,
    counts: {
      ...post.counts,
      likes: payload.likes,
      replies: payload.replies,
      reposts: payload.reposts,
    },
  }))
}

// ── follow.update ─────────────────────────────────────────

function handleFollowUpdate(
  queryClient: QueryClient,
  payload: { type: 'followed' | 'unfollowed' | 'requested'; actorId: string },
): void {
  // Follow graph changes are complex to patch in-place (profile viewer flags,
  // follower counts, etc.) — shallow-invalidate affected profiles so they
  // refetch next time they're observed. We do NOT force an immediate refetch.
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      // Invalidate any profile query (follower counts might have changed)
      return Array.isArray(key) && key[0] === 'users' && key[2] === 'profile'
    },
    refetchType: 'none', // Only mark stale; refetch when next observed
  })

  // Also invalidate follow-requests list if someone sent a request
  if (payload.type === 'requested') {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.followRequests.list(),
      refetchType: 'none',
    })
  }
}

// ── Registration ──────────────────────────────────────────

/**
 * Wire all server→client event handlers to the socket.
 * Returns a cleanup function that removes all listeners.
 */
export function registerEventRouter(
  socket: AppSocket,
  queryClient: QueryClient,
): () => void {
  const onDmMessage = (msg: MessageDto) => handleDmMessage(queryClient, msg)
  const onDmTyping = (p: { conversationId: string; userId: string }) => handleDmTyping(p)
  const onDmRead = (p: {
    conversationId: string
    userId: string
    lastReadMessageId: string
  }) => handleDmRead(queryClient, p)
  const onNotificationNew = (n: NotificationDto) => handleNotificationNew(queryClient, n)
  const onTimelineNewPosts = (p: { count: number; previewIds: string[] }) =>
    handleTimelineNewPosts(p)
  const onPostCounters = (p: {
    postId: string
    likes: number
    replies: number
    reposts: number
  }) => handlePostCounters(queryClient, p)
  const onFollowUpdate = (p: { type: 'followed' | 'unfollowed' | 'requested'; actorId: string }) =>
    handleFollowUpdate(queryClient, p)

  socket.on('dm.message', onDmMessage)
  socket.on('dm.typing', onDmTyping)
  socket.on('dm.read', onDmRead)
  socket.on('notification.new', onNotificationNew)
  socket.on('timeline.newPosts', onTimelineNewPosts)
  socket.on('post.counters', onPostCounters)
  socket.on('follow.update', onFollowUpdate)

  return () => {
    socket.off('dm.message', onDmMessage)
    socket.off('dm.typing', onDmTyping)
    socket.off('dm.read', onDmRead)
    socket.off('notification.new', onNotificationNew)
    socket.off('timeline.newPosts', onTimelineNewPosts)
    socket.off('post.counters', onPostCounters)
    socket.off('follow.update', onFollowUpdate)
  }
}
