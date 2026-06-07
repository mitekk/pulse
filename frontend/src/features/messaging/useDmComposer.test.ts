// ============================================================
// Tests: useDmComposer
// - optimistic send creates bubble with status='sending'
// - nonce reconciliation: removes optimistic on REST success
// - failed state when REST throws
// - retry clears failed bubble and re-sends
// ============================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useDmComposer, isOptimistic } from './useDmComposer'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { MessageDto, CursorPage } from '@/types/api'
import type { MessageEntry } from './useDmComposer'

// Mock deps
vi.mock('@/lib/realtime/roomManager', () => ({
  emitSendMessage: vi.fn(),
}))

vi.mock('@/lib/api/messaging', () => ({
  messagingApi: {
    sendMessage: vi.fn(),
  },
}))

import { emitSendMessage } from '@/lib/realtime/roomManager'
import { messagingApi } from '@/lib/api/messaging'

const sendMessageMock = vi.mocked(messagingApi.sendMessage)
const emitSendMock = vi.mocked(emitSendMessage)

function makeSentMessage(nonce: string): MessageDto {
  return {
    id: `server-id-${nonce}`,
    conversationId: 'conv1',
    senderId: 'me',
    text: 'hello',
    media: null,
    clientNonce: nonce,
    createdAt: new Date().toISOString(),
  }
}

function createWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useDmComposer', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.clearAllMocks()

    // Seed an empty messages cache
    queryClient.setQueryData<{ pages: CursorPage<MessageEntry>[]; pageParams: unknown[] }>(
      queryKeys.conversations.messages('conv1'),
      { pages: [{ items: [], cursor: null, hasMore: false }], pageParams: [null] },
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('appends an optimistic bubble with status=sending on send', async () => {
    sendMessageMock.mockResolvedValue({ message: makeSentMessage('nonce1') })

    const { result } = renderHook(
      () => useDmComposer({ conversationId: 'conv1', currentUserId: 'me' }),
      { wrapper: createWrapper(queryClient) },
    )

    // Intercept crypto.randomUUID to get a predictable nonce
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('nonce1' as ReturnType<typeof crypto.randomUUID>)

    let sendPromise: Promise<void>
    act(() => {
      sendPromise = result.current.send('hello')
    })

    // Check optimistic bubble was added immediately
    const cache = queryClient.getQueryData<{ pages: CursorPage<MessageEntry>[] }>(
      queryKeys.conversations.messages('conv1'),
    )
    const items = cache?.pages[0].items ?? []
    const optimistic = items[0]
    expect(optimistic).toBeDefined()
    expect(isOptimistic(optimistic)).toBe(true)
    if (isOptimistic(optimistic)) {
      expect(optimistic._status).toBe('sending')
      expect(optimistic.text).toBe('hello')
      expect(optimistic.senderId).toBe('me')
    }

    await act(async () => {
      await sendPromise!
    })
  })

  it('emits dm.send WS event on send', async () => {
    sendMessageMock.mockResolvedValue({ message: makeSentMessage('nonce2') })
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('nonce2' as ReturnType<typeof crypto.randomUUID>)

    const { result } = renderHook(
      () => useDmComposer({ conversationId: 'conv1', currentUserId: 'me' }),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.send('test message')
    })

    expect(emitSendMock).toHaveBeenCalledWith({
      conversationId: 'conv1',
      text: 'test message',
      mediaId: undefined,
      clientNonce: 'nonce2',
    })
  })

  it('removes optimistic bubble and injects canonical message on REST success', async () => {
    const canonicalMsg = makeSentMessage('nonce3')
    sendMessageMock.mockResolvedValue({ message: canonicalMsg })
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('nonce3' as ReturnType<typeof crypto.randomUUID>)

    const { result } = renderHook(
      () => useDmComposer({ conversationId: 'conv1', currentUserId: 'me' }),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.send('hello')
    })

    const cache = queryClient.getQueryData<{ pages: CursorPage<MessageEntry>[] }>(
      queryKeys.conversations.messages('conv1'),
    )
    const items = cache?.pages[0].items ?? []
    // No optimistic bubbles remain
    const optimisticItems = items.filter((m) => isOptimistic(m))
    expect(optimisticItems).toHaveLength(0)
    // Canonical message injected
    const canonicalInCache = items.find((m) => m.id === canonicalMsg.id)
    expect(canonicalInCache).toBeDefined()
  })

  it('marks optimistic bubble as failed on REST error', async () => {
    sendMessageMock.mockRejectedValue(new Error('Network error'))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('nonce4' as ReturnType<typeof crypto.randomUUID>)

    const { result } = renderHook(
      () => useDmComposer({ conversationId: 'conv1', currentUserId: 'me' }),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.send('failing message')
    })

    const cache = queryClient.getQueryData<{ pages: CursorPage<MessageEntry>[] }>(
      queryKeys.conversations.messages('conv1'),
    )
    const items = cache?.pages[0].items ?? []
    const failed = items.find((m) => isOptimistic(m) && m._localNonce === 'nonce4')
    expect(failed).toBeDefined()
    if (isOptimistic(failed!)) {
      expect(failed!._status).toBe('failed')
    }
    expect(result.current.sendError).toBe('Network error')
  })

  it('retry removes the failed bubble and re-sends', async () => {
    // First send fails
    sendMessageMock.mockRejectedValueOnce(new Error('Network error'))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('nonce5' as ReturnType<typeof crypto.randomUUID>)

    const { result } = renderHook(
      () => useDmComposer({ conversationId: 'conv1', currentUserId: 'me' }),
      { wrapper: createWrapper(queryClient) },
    )

    await act(async () => {
      await result.current.send('retry this')
    })

    // Verify failed bubble exists
    let cache = queryClient.getQueryData<{ pages: CursorPage<MessageEntry>[] }>(
      queryKeys.conversations.messages('conv1'),
    )
    let failed = cache?.pages[0].items.find(
      (m) => isOptimistic(m) && m._localNonce === 'nonce5',
    )
    expect(failed).toBeDefined()

    // Now retry succeeds
    sendMessageMock.mockResolvedValue({ message: makeSentMessage('nonce5') })

    await act(async () => {
      await result.current.retry('nonce5')
    })

    // Failed bubble should be replaced with canonical
    cache = queryClient.getQueryData<{ pages: CursorPage<MessageEntry>[] }>(
      queryKeys.conversations.messages('conv1'),
    )
    failed = cache?.pages[0].items.find(
      (m) => isOptimistic(m) && m._localNonce === 'nonce5',
    )
    expect(failed).toBeUndefined()
  })
})
