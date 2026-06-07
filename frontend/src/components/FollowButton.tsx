// ============================================================
// FollowButton — relationship-aware follow action button
//
// States:
//   self       → "Edit profile" (link to /settings/account)
//   blocked    → "Blocked" + hover → "Unblock"
//   following  → "Following" (hover → "Unfollow") + confirm dialog
//   requested  → "Requested" (private acct, pending follow req)
//   not following → "Follow" (private acct → optimistic "Requested")
//
// Optimistic mutations update the profile cache for :handle.
// WS `follow.update` events handled by the parent ProfileHeader.
// ============================================================

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { followApi } from '@/lib/api/follow'
import { queryKeys } from '@/lib/cache/queryKeys'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import { ConfirmDialog } from './ConfirmDialog'
import type { ProfileDto } from '@/types/api'

interface FollowButtonProps {
  handle: string
  userId: string
  isPrivate?: boolean
  /** Viewer relationship flags — derived from ProfileDto.viewer */
  viewerFlags?: ProfileDto['viewer']
  /** Compact variant for user lists — smaller pill */
  compact?: boolean
  testId?: string
}

export function FollowButton({
  handle,
  userId,
  isPrivate = false,
  viewerFlags,
  compact = false,
  testId,
}: FollowButtonProps) {
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const [hovered, setHovered] = useState(false)
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false)

  // Self check
  const isSelf = currentUser?.id === userId || currentUser?.handle === handle

  // Derive state from viewerFlags
  const isBlocked = viewerFlags?.blocked ?? false
  const isFollowing = viewerFlags?.following ?? false
  const isRequested = viewerFlags?.followRequested ?? false

  // ── Follow mutation ──────────────────────────────────────
  const followMutation = useMutation({
    mutationFn: () => followApi.follow(handle),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.profile(handle) })
      const previous = queryClient.getQueryData(queryKeys.users.profile(handle))
      queryClient.setQueryData(queryKeys.users.profile(handle), (old: { user: ProfileDto } | undefined) => {
        if (!old) return old
        return {
          user: {
            ...old.user,
            counts: {
              ...old.user.counts,
              followers: isPrivate ? old.user.counts.followers : old.user.counts.followers + 1,
            },
            viewer: old.user.viewer
              ? {
                  ...old.user.viewer,
                  following: !isPrivate,
                  followRequested: isPrivate,
                }
              : null,
          },
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.users.profile(handle), ctx.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(handle) })
    },
  })

  // ── Unfollow mutation ────────────────────────────────────
  const unfollowMutation = useMutation({
    mutationFn: () => followApi.unfollow(handle),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.profile(handle) })
      const previous = queryClient.getQueryData(queryKeys.users.profile(handle))
      queryClient.setQueryData(queryKeys.users.profile(handle), (old: { user: ProfileDto } | undefined) => {
        if (!old) return old
        return {
          user: {
            ...old.user,
            counts: {
              ...old.user.counts,
              followers: Math.max(0, old.user.counts.followers - 1),
            },
            viewer: old.user.viewer
              ? {
                  ...old.user.viewer,
                  following: false,
                  followRequested: false,
                }
              : null,
          },
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.users.profile(handle), ctx.previous)
      }
    },
    onSettled: () => {
      setShowUnfollowConfirm(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(handle) })
    },
  })

  // ── Unblock mutation ─────────────────────────────────────
  const unblockMutation = useMutation({
    mutationFn: () => followApi.unblock(handle),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.profile(handle) })
      const previous = queryClient.getQueryData(queryKeys.users.profile(handle))
      queryClient.setQueryData(queryKeys.users.profile(handle), (old: { user: ProfileDto } | undefined) => {
        if (!old) return old
        return {
          user: {
            ...old.user,
            viewer: old.user.viewer
              ? { ...old.user.viewer, blocked: false }
              : null,
          },
        }
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.users.profile(handle), ctx.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(handle) })
    },
  })

  const isLoading =
    followMutation.isPending || unfollowMutation.isPending || unblockMutation.isPending

  const btnBase: React.CSSProperties = {
    borderRadius: 'var(--radius-full)',
    fontFamily: 'var(--font-body)',
    fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    padding: compact ? '0.25rem 0.75rem' : '0.4375rem 1.125rem',
    cursor: isLoading ? 'default' : 'pointer',
    transition: 'background var(--duration-fast), color var(--duration-fast), border-color var(--duration-fast)',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    whiteSpace: 'nowrap',
    minWidth: compact ? '72px' : '96px',
    justifyContent: 'center',
  }

  // ── Self: Edit Profile ───────────────────────────────────
  if (isSelf) {
    return (
      <Link
        to="/settings/account"
        data-testid={testId ?? 'follow-button-self'}
        style={{
          ...btnBase,
          textDecoration: 'none',
          background: 'transparent',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        Edit profile
      </Link>
    )
  }

  // ── Blocked ──────────────────────────────────────────────
  if (isBlocked) {
    return (
      <button
        data-testid={testId ?? 'follow-button-blocked'}
        onClick={() => unblockMutation.mutate()}
        disabled={isLoading}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...btnBase,
          background: hovered ? 'var(--color-danger)' : 'var(--color-surface-raised)',
          color: hovered ? '#fff' : 'var(--color-text)',
          border: `1px solid ${hovered ? 'var(--color-danger)' : 'var(--color-border)'}`,
        }}
      >
        {hovered ? 'Unblock' : 'Blocked'}
      </button>
    )
  }

  // ── Following ────────────────────────────────────────────
  if (isFollowing) {
    return (
      <>
        <button
          data-testid={testId ?? 'follow-button-following'}
          onClick={() => setShowUnfollowConfirm(true)}
          disabled={isLoading}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            ...btnBase,
            background: hovered ? 'transparent' : 'var(--color-surface-raised)',
            color: hovered ? 'var(--color-danger)' : 'var(--color-text)',
            border: `1px solid ${hovered ? 'var(--color-danger)' : 'var(--color-border)'}`,
          }}
        >
          {hovered ? 'Unfollow' : 'Following'}
        </button>
        <ConfirmDialog
          isOpen={showUnfollowConfirm}
          onClose={() => setShowUnfollowConfirm(false)}
          onConfirm={() => unfollowMutation.mutate()}
          title={`Unfollow @${handle}?`}
          description="Their posts will no longer appear in your timeline."
          confirmLabel="Unfollow"
          cancelLabel="Cancel"
          danger
          isLoading={unfollowMutation.isPending}
        />
      </>
    )
  }

  // ── Requested (pending follow request) ──────────────────
  if (isRequested) {
    return (
      <button
        data-testid={testId ?? 'follow-button-requested'}
        onClick={() => unfollowMutation.mutate()}
        disabled={isLoading}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...btnBase,
          background: hovered ? 'transparent' : 'var(--color-surface-raised)',
          color: hovered ? 'var(--color-danger)' : 'var(--color-text)',
          border: `1px solid ${hovered ? 'var(--color-danger)' : 'var(--color-border)'}`,
        }}
      >
        {hovered ? 'Cancel' : 'Requested'}
      </button>
    )
  }

  // ── Not following ────────────────────────────────────────
  return (
    <button
      data-testid={testId ?? 'follow-button'}
      onClick={() => followMutation.mutate()}
      disabled={isLoading}
      style={{
        ...btnBase,
        background: 'var(--color-accent)',
        color: 'var(--color-accent-contrast)',
        border: 'none',
        opacity: isLoading ? 0.7 : 1,
      }}
    >
      {isLoading ? '…' : isPrivate ? 'Follow' : 'Follow'}
    </button>
  )
}
