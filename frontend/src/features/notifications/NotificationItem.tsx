// ============================================================
// NotificationItem — single aggregated notification row
// Renders up to 3 actor avatars + "and N others" label.
// Handles follow_request type with inline Accept/Decline.
// ============================================================

import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'

// ── Pure helper ────────────────────────────────────────────

function getRelativeTime(createdAt: string): string {
  const created = new Date(createdAt).getTime()
  const now = new Date().getTime()
  const diff = now - created
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}
import type { NotificationDto } from '@/types/api'
import { Avatar } from '@/components/Avatar'
import { NotificationIcon } from './NotificationIcon'
import { NOTIFICATION_CONFIG, formatActorLabel, getNotificationLink } from './notificationUtils'
import { followApi } from '@/lib/api/follow'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { CursorPage } from '@/types/api'

interface NotificationItemProps {
  notification: NotificationDto
  onRead?: (id: string) => void
}

// ── Follow request action buttons ─────────────────────────

interface FollowRequestActionsProps {
  notificationId: string
  requesterId: string
  requesterHandle: string
}

function FollowRequestActions({ notificationId, requesterId, requesterHandle }: FollowRequestActionsProps) {
  const queryClient = useQueryClient()

  const acceptMutation = useMutation({
    mutationFn: () => followApi.acceptFollowRequest(requesterId),
    onMutate: async () => {
      // Optimistically remove from notification list
      const key = queryKeys.notifications.list()
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)

      queryClient.setQueryData<{ pages: CursorPage<NotificationDto>[]; pageParams: unknown[] }>(
        key,
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.filter((n) => n.id !== notificationId),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.notifications.list(), ctx.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followRequests.list() })
    },
  })

  const declineMutation = useMutation({
    mutationFn: () => followApi.declineFollowRequest(requesterId),
    onMutate: async () => {
      const key = queryKeys.notifications.list()
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)

      queryClient.setQueryData<{ pages: CursorPage<NotificationDto>[]; pageParams: unknown[] }>(
        key,
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.filter((n) => n.id !== notificationId),
            })),
          }
        },
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKeys.notifications.list(), ctx.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followRequests.list() })
    },
  })

  const isLoading = acceptMutation.isPending || declineMutation.isPending

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        marginTop: '0.625rem',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        data-testid={`follow-request-accept-${requesterHandle}`}
        onClick={() => acceptMutation.mutate()}
        disabled={isLoading}
        aria-label={`Accept follow request from @${requesterHandle}`}
        style={{
          padding: '0.375rem 1rem',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-accent-strong)',
          color: 'var(--color-accent-contrast)',
          fontFamily: 'var(--font-body)',
          fontWeight: 'var(--font-weight-semibold)',
          fontSize: 'var(--text-sm)',
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'opacity var(--duration-fast)',
        }}
      >
        Accept
      </button>
      <button
        data-testid={`follow-request-decline-${requesterHandle}`}
        onClick={() => declineMutation.mutate()}
        disabled={isLoading}
        aria-label={`Decline follow request from @${requesterHandle}`}
        style={{
          padding: '0.375rem 1rem',
          borderRadius: 'var(--radius-full)',
          background: 'transparent',
          color: 'var(--color-text)',
          border: '1.5px solid var(--color-border)',
          fontFamily: 'var(--font-body)',
          fontWeight: 'var(--font-weight-semibold)',
          fontSize: 'var(--text-sm)',
          opacity: isLoading ? 0.6 : 1,
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'opacity var(--duration-fast)',
        }}
      >
        Decline
      </button>
    </div>
  )
}

// ── Main item ──────────────────────────────────────────────

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const { id, type, actors, otherCount, post, readAt, createdAt } = notification
  const config = NOTIFICATION_CONFIG[type]
  const link = getNotificationLink(notification)
  const isUnread = !readAt
  const actorLabel = formatActorLabel(actors, otherCount)

  // Relative time (simple) — computed once outside render
  const relativeTime = getRelativeTime(createdAt)

  const handleClick = () => {
    if (isUnread) onRead?.(id)
  }

  const content = (
    <div
      data-testid={`notification-item-${id}`}
      onClick={handleClick}
      role="article"
      aria-label={`${actorLabel} ${config.actionLabel}`}
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid var(--color-border)',
        background: isUnread ? 'color-mix(in srgb, var(--color-accent) 4%, transparent)' : 'transparent',
        cursor: link ? 'pointer' : 'default',
        transition: 'background var(--duration-fast)',
        alignItems: 'flex-start',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Icon column */}
      <div style={{ flexShrink: 0, paddingTop: '2px' }}>
        <NotificationIcon type={type} size={18} />
      </div>

      {/* Content column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Actor avatars (up to 3) */}
        {actors.length > 0 && (
          <div
            style={{ display: 'flex', gap: '4px', marginBottom: '0.5rem', flexWrap: 'wrap' }}
            data-testid={`notification-actors-${id}`}
          >
            {actors.slice(0, 3).map((actor) => (
              <Link
                key={actor.id}
                to={`/@${actor.handle}`}
                aria-label={`@${actor.handle}`}
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'block', flexShrink: 0 }}
              >
                <Avatar
                  src={actor.avatarUrl}
                  displayName={actor.displayName}
                  handle={actor.handle}
                  size="sm"
                />
              </Link>
            ))}
            {otherCount > 0 && (
              <div
                data-testid={`notification-other-count-${id}`}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-surface-raised)',
                  border: '1.5px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-muted)',
                  flexShrink: 0,
                }}
              >
                +{otherCount > 99 ? '99' : otherCount}
              </div>
            )}
          </div>
        )}

        {/* Actor label + action */}
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          <strong style={{ fontWeight: 'var(--font-weight-semibold)' }}>{actorLabel}</strong>
          {actorLabel && ' '}
          <span style={{ color: 'var(--color-text-muted)' }}>{config.actionLabel}</span>
          <span
            style={{
              marginLeft: '0.5rem',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--text-xs)',
            }}
          >
            · {relativeTime}
          </span>
        </p>

        {/* Post preview (for post-related notifications) */}
        {post && post.text && (
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              marginTop: '0.375rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
            data-testid={`notification-post-preview-${id}`}
          >
            {post.text}
          </p>
        )}

        {/* Follow request inline actions */}
        {type === 'follow_request' && actors.length > 0 && (
          <FollowRequestActions
            notificationId={id}
            requesterId={actors[0].id}
            requesterHandle={actors[0].handle}
          />
        )}
      </div>

      {/* Unread dot */}
      {isUnread && (
        <div
          aria-label="Unread"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--color-accent)',
            flexShrink: 0,
            marginTop: '6px',
          }}
        />
      )}
    </div>
  )

  if (link) {
    return (
      <Link
        to={link}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        onClick={handleClick}
      >
        {content}
      </Link>
    )
  }

  return content
}
