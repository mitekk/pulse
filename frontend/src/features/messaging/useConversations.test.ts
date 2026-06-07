// ============================================================
// Tests: useConversations
// - ordering by latest message
// - unread state from unreadStore
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useConversations } from './useConversations'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { ConversationDto, MessageDto } from '@/types/api'

function makeMessage(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'msg1',
    conversationId: 'conv1',
    senderId: 'user1',
    text: 'hello',
    media: null,
    clientNonce: 'nonce1',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeConversation(overrides: Partial<ConversationDto> = {}): ConversationDto {
  return {
    id: 'conv1',
    participants: [
      { id: 'user1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false, isPrivate: false },
      { id: 'user2', handle: 'bob', displayName: 'Bob', avatarUrl: null, isVerified: false, isPrivate: false },
    ],
    lastMessage: null,
    unreadCount: 0,
    muted: false,
    createdAt: '2024-01-01T10:00:00Z',
    ...overrides,
  }
}

function createWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useConversations', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
  })

  it('returns conversations sorted by latest message descending', () => {
    const older = makeConversation({
      id: 'conv-old',
      lastMessage: makeMessage({
        id: 'msg-old',
        conversationId: 'conv-old',
        createdAt: '2024-01-01T09:00:00Z',
      }),
    })
    const newer = makeConversation({
      id: 'conv-new',
      lastMessage: makeMessage({
        id: 'msg-new',
        conversationId: 'conv-new',
        createdAt: '2024-01-01T10:30:00Z',
      }),
    })

    queryClient.setQueryData(queryKeys.conversations.list(), {
      pages: [{ items: [older, newer], cursor: null, hasMore: false }],
      pageParams: [null],
    })

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(queryClient),
    })

    // Newer should be first
    expect(result.current.conversations[0].id).toBe('conv-new')
    expect(result.current.conversations[1].id).toBe('conv-old')
  })

  it('falls back to createdAt when lastMessage is null', () => {
    const earlyCreated = makeConversation({
      id: 'conv-early',
      createdAt: '2024-01-01T08:00:00Z',
      lastMessage: null,
    })
    const lateCreated = makeConversation({
      id: 'conv-late',
      createdAt: '2024-01-01T12:00:00Z',
      lastMessage: null,
    })

    queryClient.setQueryData(queryKeys.conversations.list(), {
      pages: [{ items: [earlyCreated, lateCreated], cursor: null, hasMore: false }],
      pageParams: [null],
    })

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(queryClient),
    })

    expect(result.current.conversations[0].id).toBe('conv-late')
    expect(result.current.conversations[1].id).toBe('conv-early')
  })

  it('returns empty array when no conversations in cache and status=pending', () => {
    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(queryClient),
    })

    expect(result.current.conversations).toEqual([])
    expect(result.current.status).toBe('pending')
  })

  it('returns status=success and conversations when cache is seeded', () => {
    const conv = makeConversation({ id: 'c1' })
    queryClient.setQueryData(queryKeys.conversations.list(), {
      pages: [{ items: [conv], cursor: null, hasMore: false }],
      pageParams: [null],
    })

    const { result } = renderHook(() => useConversations(), {
      wrapper: createWrapper(queryClient),
    })

    expect(result.current.status).toBe('success')
    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.conversations[0].id).toBe('c1')
  })
})
