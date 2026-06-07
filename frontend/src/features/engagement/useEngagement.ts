// ============================================================
// Engagement hooks — useLike, useRepost, useBookmark
//
// Each hook:
//   1. onMutate: cancels queries, snapshots, patches viewer + counts
//      via patchPostInCaches (all caches updated atomically)
//   2. onError: restores snapshots (full rollback)
//   3. onSettled: light reconcile (invalidate just that post detail)
//
// WS post.counters events keep counts honest after settlement.
// ============================================================

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { engagementApi } from '@/lib/api/engagement'
import { patchPostInCaches, restorePostSnapshots } from '@/lib/cache/patchPost'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { PostSnapshot } from '@/lib/cache/patchPost'

// ── useLike ───────────────────────────────────────────────

export function useLike() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (postId: string) => engagementApi.like(postId),

    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts.detail(postId) })

      const snapshots: PostSnapshot[] = patchPostInCaches(qc, postId, (post) => ({
        ...post,
        viewer: { ...(post.viewer ?? { liked: false, reposted: false, bookmarked: false }), liked: true },
        counts: { ...post.counts, likes: post.counts.likes + 1 },
      }))

      return { snapshots, postId }
    },

    onError: (_err, _postId, ctx) => {
      if (ctx?.snapshots) {
        restorePostSnapshots(qc, ctx.snapshots)
      }
    },

    onSettled: (_data, _err, postId) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.posts.detail(postId),
        refetchType: 'none',
      })
    },
  })
}

// ── useUnlike ─────────────────────────────────────────────

export function useUnlike() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (postId: string) => engagementApi.unlike(postId),

    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts.detail(postId) })

      const snapshots = patchPostInCaches(qc, postId, (post) => ({
        ...post,
        viewer: { ...(post.viewer ?? { liked: true, reposted: false, bookmarked: false }), liked: false },
        counts: { ...post.counts, likes: Math.max(0, post.counts.likes - 1) },
      }))

      return { snapshots, postId }
    },

    onError: (_err, _postId, ctx) => {
      if (ctx?.snapshots) restorePostSnapshots(qc, ctx.snapshots)
    },

    onSettled: (_data, _err, postId) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.posts.detail(postId),
        refetchType: 'none',
      })
    },
  })
}

// ── useRepost ─────────────────────────────────────────────

export function useRepost() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (postId: string) => engagementApi.repost(postId),

    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts.detail(postId) })

      const snapshots = patchPostInCaches(qc, postId, (post) => ({
        ...post,
        viewer: { ...(post.viewer ?? { liked: false, reposted: false, bookmarked: false }), reposted: true },
        counts: { ...post.counts, reposts: post.counts.reposts + 1 },
      }))

      return { snapshots, postId }
    },

    onError: (_err, _postId, ctx) => {
      if (ctx?.snapshots) restorePostSnapshots(qc, ctx.snapshots)
    },

    onSettled: (_data, _err, postId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId), refetchType: 'none' })
    },
  })
}

// ── useUnrepost ───────────────────────────────────────────

export function useUnrepost() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (postId: string) => engagementApi.unrepost(postId),

    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts.detail(postId) })

      const snapshots = patchPostInCaches(qc, postId, (post) => ({
        ...post,
        viewer: { ...(post.viewer ?? { liked: false, reposted: true, bookmarked: false }), reposted: false },
        counts: { ...post.counts, reposts: Math.max(0, post.counts.reposts - 1) },
      }))

      return { snapshots, postId }
    },

    onError: (_err, _postId, ctx) => {
      if (ctx?.snapshots) restorePostSnapshots(qc, ctx.snapshots)
    },

    onSettled: (_data, _err, postId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId), refetchType: 'none' })
    },
  })
}

// ── useBookmark ───────────────────────────────────────────

export function useBookmark() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (postId: string) => engagementApi.bookmark(postId),

    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts.detail(postId) })

      const snapshots = patchPostInCaches(qc, postId, (post) => ({
        ...post,
        viewer: { ...(post.viewer ?? { liked: false, reposted: false, bookmarked: false }), bookmarked: true },
        counts: { ...post.counts, bookmarks: post.counts.bookmarks + 1 },
      }))

      return { snapshots, postId }
    },

    onError: (_err, _postId, ctx) => {
      if (ctx?.snapshots) restorePostSnapshots(qc, ctx.snapshots)
    },

    onSettled: (_data, _err, postId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId), refetchType: 'none' })
      void qc.invalidateQueries({ queryKey: queryKeys.timeline.bookmarks(), refetchType: 'none' })
    },
  })
}

// ── useUnbookmark ─────────────────────────────────────────

export function useUnbookmark() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (postId: string) => engagementApi.unbookmark(postId),

    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.posts.detail(postId) })

      const snapshots = patchPostInCaches(qc, postId, (post) => ({
        ...post,
        viewer: { ...(post.viewer ?? { liked: false, reposted: false, bookmarked: true }), bookmarked: false },
        counts: { ...post.counts, bookmarks: Math.max(0, post.counts.bookmarks - 1) },
      }))

      return { snapshots, postId }
    },

    onError: (_err, _postId, ctx) => {
      if (ctx?.snapshots) restorePostSnapshots(qc, ctx.snapshots)
    },

    onSettled: (_data, _err, postId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId), refetchType: 'none' })
      void qc.invalidateQueries({ queryKey: queryKeys.timeline.bookmarks(), refetchType: 'none' })
    },
  })
}
