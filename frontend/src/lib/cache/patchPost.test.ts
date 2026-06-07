// ============================================================
// Tests for patchPostInCaches + restorePostSnapshots
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { patchPostInCaches, restorePostSnapshots } from './patchPost'
import type { PostDto, CursorPage } from '@/types/api'

// ── Fixtures ──────────────────────────────────────────────

function makePost(id: string, likes = 0): PostDto {
  return {
    id,
    author: { id: 'user-1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false },
    text: `Post ${id}`,
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

function makePage(items: PostDto[], cursor: string | null = null): CursorPage<PostDto> {
  return { items, cursor, hasMore: cursor !== null }
}

// ── Tests ──────────────────────────────────────────────────

describe('patchPostInCaches', () => {
  let qc: QueryClient

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  })

  it('patches a post in the detail cache { post: PostDto }', () => {
    const post = makePost('post-1', 5)
    qc.setQueryData(['posts', 'post-1'], { post })

    patchPostInCaches(qc, 'post-1', (p) => ({
      ...p,
      counts: { ...p.counts, likes: 6 },
    }))

    const updated = qc.getQueryData<{ post: PostDto }>(['posts', 'post-1'])
    expect(updated?.post.counts.likes).toBe(6)
  })

  it('patches a post inside an infinite page list', () => {
    const post1 = makePost('post-1', 3)
    const post2 = makePost('post-2', 10)
    qc.setQueryData(['timeline', 'home'], {
      pages: [makePage([post1, post2])],
      pageParams: [null],
    })

    patchPostInCaches(qc, 'post-1', (p) => ({
      ...p,
      viewer: { ...p.viewer!, liked: true },
      counts: { ...p.counts, likes: p.counts.likes + 1 },
    }))

    const data = qc.getQueryData<{ pages: CursorPage<PostDto>[] }>(['timeline', 'home'])
    const items = data?.pages[0].items
    expect(items?.[0].viewer?.liked).toBe(true)
    expect(items?.[0].counts.likes).toBe(4)
    // post-2 should be untouched
    expect(items?.[1].counts.likes).toBe(10)
  })

  it('patches across multiple caches simultaneously', () => {
    const post = makePost('post-99', 0)
    qc.setQueryData(['posts', 'post-99'], { post })
    qc.setQueryData(['timeline', 'home'], {
      pages: [makePage([post])],
      pageParams: [null],
    })

    patchPostInCaches(qc, 'post-99', (p) => ({
      ...p,
      counts: { ...p.counts, likes: 7 },
    }))

    const detail = qc.getQueryData<{ post: PostDto }>(['posts', 'post-99'])
    const timeline = qc.getQueryData<{ pages: CursorPage<PostDto>[] }>(['timeline', 'home'])

    expect(detail?.post.counts.likes).toBe(7)
    expect(timeline?.pages[0].items[0].counts.likes).toBe(7)
  })

  it('does not patch posts with a different id', () => {
    const post1 = makePost('post-1', 5)
    const post2 = makePost('post-2', 10)
    qc.setQueryData(['timeline', 'home'], {
      pages: [makePage([post1, post2])],
      pageParams: [null],
    })

    patchPostInCaches(qc, 'post-1', (p) => ({
      ...p,
      counts: { ...p.counts, likes: 99 },
    }))

    const data = qc.getQueryData<{ pages: CursorPage<PostDto>[] }>(['timeline', 'home'])
    expect(data?.pages[0].items[1].counts.likes).toBe(10) // post-2 unchanged
  })

  it('returns snapshots that can be used to roll back', () => {
    const post = makePost('post-1', 5)
    qc.setQueryData(['posts', 'post-1'], { post })

    const snapshots = patchPostInCaches(qc, 'post-1', (p) => ({
      ...p,
      counts: { ...p.counts, likes: 99 },
    }))

    // Verify patch applied
    expect(
      qc.getQueryData<{ post: PostDto }>(['posts', 'post-1'])?.post.counts.likes,
    ).toBe(99)

    // Rollback
    restorePostSnapshots(qc, snapshots)

    expect(
      qc.getQueryData<{ post: PostDto }>(['posts', 'post-1'])?.post.counts.likes,
    ).toBe(5)
  })

  it('returns empty snapshots when post id not found in cache', () => {
    const post = makePost('post-other')
    qc.setQueryData(['posts', 'post-other'], { post })

    const snapshots = patchPostInCaches(qc, 'post-not-here', (p) => ({
      ...p,
      counts: { ...p.counts, likes: 99 },
    }))

    expect(snapshots).toHaveLength(0)
  })
})
