// ============================================================
// Tests for the WS event router — cache mutation effects
// ============================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { registerEventRouter } from './eventRouter'
import { useTimelineBufferStore } from '@/lib/stores/timelineBufferStore'
import { useUnreadStore } from '@/lib/stores/unreadStore'
import { useTypingStore } from '@/lib/stores/typingStore'
import type { PostDto, MessageDto, NotificationDto, ConversationDto, CursorPage } from '@/types/api'
import type { AppSocket } from './socket'

// ── Fixtures ──────────────────────────────────────────────

function makePost(id: string, likes = 0): PostDto {
  return {
    id,
    author: { id: 'u1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false },
    text: 'hello',
    createdAt: '2026-06-07T12:00:00Z',
    entities: { mentions: [], hashtags: [], urls: [] },
    media: [],
    counts: { replies: 0, reposts: 0, likes, bookmarks: 0 },
    viewer: { liked: false, reposted: false, bookmarked: false },
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
  }
}

function makeMessage(id: string, convId: string): MessageDto {
  return {
    id,
    conversationId: convId,
    senderId: 'u2',
    text: 'hey',
    media: null,
    clientNonce: `nonce-${id}`,
    createdAt: '2026-06-07T12:00:00Z',
  }
}

function makeNotification(id: string): NotificationDto {
  return {
    id,
    type: 'like',
    actors: [{ id: 'u2', handle: 'bob', displayName: 'Bob', avatarUrl: null, isVerified: false, isPrivate: false }],
    otherCount: 0,
    post: null,
    readAt: null,
    createdAt: '2026-06-07T12:00:00Z',
  }
}

function makeConversation(id: string): ConversationDto {
  return {
    id,
    participants: [],
    lastMessage: null,
    unreadCount: 0,
    muted: false,
    createdAt: '2026-06-07T12:00:00Z',
  }
}

function makeInfiniteCache<T>(items: T[]): { pages: CursorPage<T>[]; pageParams: (string | null)[] } {
  return {
    pages: [{ items, cursor: null, hasMore: false }],
    pageParams: [null],
  }
}

// ── Minimal in-process event emitter ──────────────────────

class SimpleEmitter {
  private listeners: Record<string, ((...args: unknown[]) => void)[]> = {}

  on(event: string, handler: (...args: unknown[]) => void): this {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
    return this
  }

  off(event: string, handler: (...args: unknown[]) => void): this {
    if (!this.listeners[event]) return this
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler)
    return this
  }

  emit(event: string, ...args: unknown[]): this {
    for (const handler of this.listeners[event] ?? []) {
      handler(...args)
    }
    return this
  }
}

function makeSocketMock(): AppSocket {
  return new SimpleEmitter() as unknown as AppSocket
}

// ── Emit helper to avoid casting noise in tests ────────────

function emit(socket: AppSocket, event: string, payload: unknown): void {
  ;(socket as unknown as SimpleEmitter).emit(event, payload)
}

// ── Tests ──────────────────────────────────────────────────

describe('eventRouter', () => {
  let qc: QueryClient
  let socket: AppSocket
  let cleanup: () => void

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    socket = makeSocketMock()
    cleanup = registerEventRouter(socket, qc)

    // Reset Zustand stores
    useTimelineBufferStore.setState({ newCount: 0, previewIds: [] })
    useUnreadStore.setState({ notificationsCount: 0, conversationsWithUnread: new Set() })
    useTypingStore.setState({ typingUsers: {} })
  })

  afterEach(() => {
    cleanup()
    qc.clear()
    vi.restoreAllMocks()
  })

  // ── post.counters ────────────────────────────────────────

  it('post.counters patches the cached post with new counter values', () => {
    const post = makePost('post-1', 5)
    qc.setQueryData(['posts', 'post-1'], { post })

    emit(socket, 'post.counters', { postId: 'post-1', likes: 42, replies: 3, reposts: 7 })

    const updated = qc.getQueryData<{ post: PostDto }>(['posts', 'post-1'])
    expect(updated?.post.counts.likes).toBe(42)
    expect(updated?.post.counts.replies).toBe(3)
    expect(updated?.post.counts.reposts).toBe(7)
  })

  it('post.counters patches post inside infinite timeline cache', () => {
    const post = makePost('post-2', 0)
    qc.setQueryData(['timeline', 'home'], makeInfiniteCache([post]))

    emit(socket, 'post.counters', { postId: 'post-2', likes: 10, replies: 1, reposts: 2 })

    const data = qc.getQueryData<{ pages: CursorPage<PostDto>[] }>(['timeline', 'home'])
    expect(data?.pages[0].items[0].counts.likes).toBe(10)
  })

  // ── timeline.newPosts ────────────────────────────────────

  it('timeline.newPosts increments the buffer store', () => {
    emit(socket, 'timeline.newPosts', { count: 5, previewIds: ['p1', 'p2'] })

    expect(useTimelineBufferStore.getState().newCount).toBe(5)
    expect(useTimelineBufferStore.getState().previewIds).toEqual(['p1', 'p2'])
  })

  it('timeline.newPosts accumulates across multiple events', () => {
    emit(socket, 'timeline.newPosts', { count: 3, previewIds: ['p1'] })
    emit(socket, 'timeline.newPosts', { count: 2, previewIds: ['p2'] })

    expect(useTimelineBufferStore.getState().newCount).toBe(5)
  })

  // ── notification.new ─────────────────────────────────────

  it('notification.new prepends to notifications list cache', () => {
    const existing = makeNotification('notif-old')
    qc.setQueryData(['notifications'], makeInfiniteCache([existing]))

    emit(socket, 'notification.new', makeNotification('notif-new'))

    const data = qc.getQueryData<{ pages: CursorPage<NotificationDto>[] }>(['notifications'])
    expect(data?.pages[0].items[0].id).toBe('notif-new')
    expect(data?.pages[0].items[1].id).toBe('notif-old')
  })

  it('notification.new increments unread count in cache', () => {
    qc.setQueryData(['notifications', 'unread-count'], { count: 2 })

    emit(socket, 'notification.new', makeNotification('n1'))

    const data = qc.getQueryData<{ count: number }>(['notifications', 'unread-count'])
    expect(data?.count).toBe(3)
  })

  it('notification.new increments the unreadStore badge', () => {
    useUnreadStore.setState({ notificationsCount: 1 })
    emit(socket, 'notification.new', makeNotification('n2'))
    expect(useUnreadStore.getState().notificationsCount).toBe(2)
  })

  // ── dm.message ────────────────────────────────────────────

  it('dm.message prepends to the conversation messages cache', () => {
    const convId = 'conv-1'
    const old = makeMessage('msg-old', convId)
    qc.setQueryData(['conversations', convId, 'messages'], makeInfiniteCache([old]))

    emit(socket, 'dm.message', makeMessage('msg-new', convId))

    const data = qc.getQueryData<{ pages: CursorPage<MessageDto>[] }>(
      ['conversations', convId, 'messages'],
    )
    expect(data?.pages[0].items[0].id).toBe('msg-new')
    expect(data?.pages[0].items[1].id).toBe('msg-old')
  })

  it('dm.message updates lastMessage and unreadCount in conversation list', () => {
    const conv = makeConversation('conv-2')
    qc.setQueryData(['conversations'], makeInfiniteCache([conv]))

    emit(socket, 'dm.message', makeMessage('msg-1', 'conv-2'))

    const data = qc.getQueryData<{ pages: CursorPage<ConversationDto>[] }>(['conversations'])
    expect(data?.pages[0].items[0].lastMessage?.id).toBe('msg-1')
    expect(data?.pages[0].items[0].unreadCount).toBe(1)
  })

  // ── dm.typing ─────────────────────────────────────────────

  it('dm.typing sets typing indicator in typingStore', () => {
    emit(socket, 'dm.typing', { conversationId: 'conv-3', userId: 'user-bob' })

    const typingUsers = useTypingStore.getState().typingUsers
    expect(Object.keys(typingUsers)).toContain('conv-3:user-bob')
  })

  // ── dm.read ───────────────────────────────────────────────

  it('dm.read zeros out unread count in conversation list', () => {
    const conv = { ...makeConversation('conv-4'), unreadCount: 5 }
    qc.setQueryData(['conversations'], makeInfiniteCache([conv]))

    emit(socket, 'dm.read', {
      conversationId: 'conv-4',
      userId: 'u1',
      lastReadMessageId: 'msg-last',
    })

    const data = qc.getQueryData<{ pages: CursorPage<ConversationDto>[] }>(['conversations'])
    expect(data?.pages[0].items[0].unreadCount).toBe(0)
  })

  // ── cleanup ───────────────────────────────────────────────

  it('cleanup removes all event listeners', () => {
    cleanup()

    emit(socket, 'timeline.newPosts', { count: 99, previewIds: [] })
    expect(useTimelineBufferStore.getState().newCount).toBe(0)
  })
})
