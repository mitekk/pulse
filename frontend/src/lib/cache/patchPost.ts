// ============================================================
// patchPostInCaches — update a PostDto in every cache entry
// that contains it, without triggering a refetch.
//
// Covers: post detail, thread (ancestors + replies array),
// home timeline, profile tabs, bookmarks, hashtag timeline,
// search results, and post-replies infinite lists.
//
// Usage (optimistic mutation):
//   const snapshots = patchPostInCaches(qc, postId, (p) => ({
//     ...p,
//     viewer: { ...p.viewer!, liked: true },
//     counts: { ...p.counts, likes: p.counts.likes + 1 },
//   }))
//   // on rollback: restorePostSnapshots(qc, snapshots)
// ============================================================

import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { PostDto, CursorPage } from '@/types/api'
import type { ThreadResponse } from '@/lib/api/posts'

export type PostUpdater = (prev: PostDto) => PostDto

/** A saved snapshot so mutations can roll back. */
export interface PostSnapshot {
  key: QueryKey
  data: unknown
}

// ── Helpers ───────────────────────────────────────────────

function patchPost(post: PostDto, postId: string, updater: PostUpdater): PostDto {
  if (post.id !== postId) return post
  const patched = updater(post)
  // Also patch shallow quoteOf / repostOf if they match
  return patched
}

function patchMaybePost(
  post: PostDto | null | undefined,
  postId: string,
  updater: PostUpdater,
): PostDto | null | undefined {
  if (!post) return post
  return patchPost(post, postId, updater)
}

function patchInfiniteData(
  data: { pages: CursorPage<PostDto>[] } | undefined,
  postId: string,
  updater: PostUpdater,
): { pages: CursorPage<PostDto>[] } | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((p) => patchPost(p, postId, updater)),
    })),
  }
}

// ── Main export ───────────────────────────────────────────

/**
 * Patches a PostDto identified by `postId` in ALL matching query caches.
 * Returns snapshots for rollback via `restorePostSnapshots`.
 */
export function patchPostInCaches(
  queryClient: QueryClient,
  postId: string,
  updater: PostUpdater,
): PostSnapshot[] {
  const snapshots: PostSnapshot[] = []

  // Helper: save + apply
  function apply<T>(key: QueryKey, transform: (prev: T | undefined) => T | undefined): void {
    const prev = queryClient.getQueryData<T>(key)
    if (prev === undefined) return
    snapshots.push({ key, data: prev })
    const next = transform(prev)
    queryClient.setQueryData<T>(key, next)
  }

  // Gather all queries containing PostDto or PostDto[]
  const allQueries = queryClient.getQueryCache().getAll()

  for (const query of allQueries) {
    const key = query.queryKey
    const keyStr = JSON.stringify(key)
    const data = query.state.data

    if (data === undefined || data === null) continue

    // ── post detail: { post: PostDto } ───────────────────
    if (
      keyStr.includes('"posts"') &&
      !keyStr.includes('"thread"') &&
      !keyStr.includes('"replies"') &&
      !keyStr.includes('"reposts"') &&
      !keyStr.includes('"quotes"') &&
      !keyStr.includes('"likes"')
    ) {
      const typed = data as { post: PostDto }
      if (typed?.post?.id === postId) {
        apply<{ post: PostDto }>(key, (prev) =>
          prev ? { ...prev, post: patchPost(prev.post, postId, updater) } : prev,
        )
        continue
      }
    }

    // ── thread: { ancestors, post, replies, ... } ────────
    if (keyStr.includes('"thread"')) {
      const typed = data as ThreadResponse
      const relevantIds = [
        typed?.post?.id,
        ...(typed?.ancestors?.map((a) => a.id) ?? []),
        ...(typed?.replies?.map((r) => r.id) ?? []),
      ]
      if (relevantIds.includes(postId)) {
        apply<ThreadResponse>(key, (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            post: patchPost(prev.post, postId, updater),
            ancestors: prev.ancestors.map((p) => patchPost(p, postId, updater)),
            replies: prev.replies.map((p) => patchPost(p, postId, updater)),
          }
        })
        continue
      }
    }

    // ── infinite cursor pages: { pages: [{ items: PostDto[] }] } ──
    if (
      typeof data === 'object' &&
      'pages' in (data as object) &&
      Array.isArray((data as { pages: unknown[] }).pages)
    ) {
      const typed = data as { pages: CursorPage<PostDto>[]; pageParams: unknown[] }
      const found = typed.pages.some((page) => page.items?.some((p) => p.id === postId))
      if (found) {
        apply<typeof typed>(key, (prev) =>
          prev
            ? {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  items: page.items.map((p) => patchPost(p, postId, updater)),
                })),
              }
            : prev,
        )
        continue
      }
    }
  }

  return snapshots
}

/**
 * Restore all snapshots saved by patchPostInCaches.
 * Call in mutation's onError handler.
 */
export function restorePostSnapshots(queryClient: QueryClient, snapshots: PostSnapshot[]): void {
  for (const { key, data } of snapshots) {
    queryClient.setQueryData(key, data)
  }
}

/**
 * Optimistic snapshot/rollback utility for a single typed query.
 * Use when patchPostInCaches scope is too broad.
 */
export function snapshot<T>(
  queryClient: QueryClient,
  key: QueryKey,
): { data: T | undefined; rollback: () => void } {
  const data = queryClient.getQueryData<T>(key)
  return {
    data,
    rollback: () => queryClient.setQueryData<T>(key, data),
  }
}

export { patchMaybePost, patchInfiniteData }
