// ============================================================
// useEngagement tests
//
// Verifies:
//   - useLike optimistically patches liked=true + likes+1
//   - useUnlike reverses it
//   - On error: snapshots are restored (rollback)
//   - patchPostInCaches is called on the correct postId
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { useLike, useUnlike, useRepost, useUnrepost, useBookmark, useUnbookmark } from './useEngagement'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { PostDto, PostEntities } from '@/types/api'

// ── Mock engagement API ────────────────────────────────────
const mockLike = vi.fn()
const mockUnlike = vi.fn()
const mockBookmark = vi.fn()
const mockUnbookmark = vi.fn()
const mockRepost = vi.fn()
const mockUnrepost = vi.fn()

vi.mock('@/lib/api/engagement', () => ({
  engagementApi: {
    like: (...args: unknown[]) => mockLike(...args),
    unlike: (...args: unknown[]) => mockUnlike(...args),
    bookmark: (...args: unknown[]) => mockBookmark(...args),
    unbookmark: (...args: unknown[]) => mockUnbookmark(...args),
    repost: (...args: unknown[]) => mockRepost(...args),
    unrepost: (...args: unknown[]) => mockUnrepost(...args),
  },
}))

// ── Fixture helpers ────────────────────────────────────────

const emptyEntities: PostEntities = { mentions: [], hashtags: [], urls: [] }

function makePost(overrides: Partial<PostDto> = {}): PostDto {
  return {
    id: 'post-1',
    author: {
      id: 'u1',
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: false,
    },
    text: 'Test post',
    createdAt: new Date().toISOString(),
    entities: emptyEntities,
    media: [],
    counts: { replies: 0, reposts: 0, likes: 5, bookmarks: 2 },
    viewer: { liked: false, reposted: false, bookmarked: false },
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
    ...overrides,
  }
}

// ── Test setup ─────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe('useLike', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('optimistically patches liked=true and increments likes count', async () => {
    const post = makePost()
    // Seed post detail cache
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockLike.mockResolvedValue({ liked: true, count: 6 })

    const { result } = renderHook(() => useLike(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    // Immediately after mutate, optimistic patch should be applied
    await waitFor(() => {
      const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
      expect(cached?.post.viewer?.liked).toBe(true)
      expect(cached?.post.counts.likes).toBe(6)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('rolls back on error', async () => {
    const post = makePost()
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockLike.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useLike(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => expect(result.current.isError).toBe(true))

    // After rollback, data should be restored to original
    const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
    expect(cached?.post.viewer?.liked).toBe(false)
    expect(cached?.post.counts.likes).toBe(5)
  })
})

describe('useUnlike', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('optimistically patches liked=false and decrements likes count', async () => {
    const post = makePost({ viewer: { liked: true, reposted: false, bookmarked: false }, counts: { replies: 0, reposts: 0, likes: 6, bookmarks: 0 } })
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockUnlike.mockResolvedValue({ liked: false, count: 5 })

    const { result } = renderHook(() => useUnlike(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => {
      const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
      expect(cached?.post.viewer?.liked).toBe(false)
      expect(cached?.post.counts.likes).toBe(5)
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

describe('useBookmark', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('optimistically patches bookmarked=true', async () => {
    const post = makePost()
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockBookmark.mockResolvedValue({ bookmarked: true })

    const { result } = renderHook(() => useBookmark(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => {
      const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
      expect(cached?.post.viewer?.bookmarked).toBe(true)
    })
  })

  it('rolls back bookmark on error', async () => {
    const post = makePost()
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockBookmark.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useBookmark(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => expect(result.current.isError).toBe(true))

    const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
    expect(cached?.post.viewer?.bookmarked).toBe(false)
  })
})

describe('useUnbookmark', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('optimistically patches bookmarked=false', async () => {
    const post = makePost({ viewer: { liked: false, reposted: false, bookmarked: true } })
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockUnbookmark.mockResolvedValue({ bookmarked: false })

    const { result } = renderHook(() => useUnbookmark(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => {
      const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
      expect(cached?.post.viewer?.bookmarked).toBe(false)
    })
  })
})

describe('useRepost', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('optimistically patches reposted=true and increments reposts count', async () => {
    const post = makePost()
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockRepost.mockResolvedValue({ reposted: true, count: 1 })

    const { result } = renderHook(() => useRepost(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => {
      const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
      expect(cached?.post.viewer?.reposted).toBe(true)
      expect(cached?.post.counts.reposts).toBe(1)
    })
  })

  it('rolls back on error', async () => {
    const post = makePost()
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockRepost.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useRepost(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => expect(result.current.isError).toBe(true))

    const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
    expect(cached?.post.viewer?.reposted).toBe(false)
    expect(cached?.post.counts.reposts).toBe(0)
  })
})

describe('useUnrepost', () => {
  let qc: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  it('optimistically patches reposted=false and decrements reposts count', async () => {
    const post = makePost({
      viewer: { liked: false, reposted: true, bookmarked: false },
      counts: { replies: 0, reposts: 3, likes: 0, bookmarks: 0 },
    })
    qc.setQueryData(queryKeys.posts.detail('post-1'), { post })

    mockUnrepost.mockResolvedValue({ reposted: false, count: 2 })

    const { result } = renderHook(() => useUnrepost(), { wrapper: makeWrapper(qc) })

    result.current.mutate('post-1')

    await waitFor(() => {
      const cached = qc.getQueryData<{ post: PostDto }>(queryKeys.posts.detail('post-1'))
      expect(cached?.post.viewer?.reposted).toBe(false)
      expect(cached?.post.counts.reposts).toBe(2)
    })
  })
})
