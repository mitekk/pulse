// ============================================================
// Notification utilities — icon mapping, actor label formatting
// ============================================================

import type { NotificationType, NotificationDto, UserCardDto } from '@/types/api'

// ── Icon names for each notification type ─────────────────

export interface NotificationConfig {
  icon: 'heart' | 'reply' | 'repost' | 'quote' | 'follow' | 'mention' | 'person-request' | 'dm'
  actionLabel: string
  /** Accent color override (uses CSS var by default) */
  color?: string
}

export const NOTIFICATION_CONFIG: Record<NotificationType, NotificationConfig> = {
  like: {
    icon: 'heart',
    actionLabel: 'liked your post',
    color: 'var(--color-like)',
  },
  reply: {
    icon: 'reply',
    actionLabel: 'replied to your post',
    color: 'var(--color-accent)',
  },
  repost: {
    icon: 'repost',
    actionLabel: 'reposted your post',
    color: 'var(--color-repost)',
  },
  quote: {
    icon: 'quote',
    actionLabel: 'quoted your post',
    color: 'var(--color-accent)',
  },
  follow: {
    icon: 'follow',
    actionLabel: 'followed you',
    color: 'var(--color-accent)',
  },
  mention: {
    icon: 'mention',
    actionLabel: 'mentioned you',
    color: 'var(--color-accent)',
  },
  follow_request: {
    icon: 'person-request',
    actionLabel: 'requested to follow you',
    color: 'var(--color-accent)',
  },
  dm: {
    icon: 'dm',
    actionLabel: 'sent you a message',
    color: 'var(--color-accent)',
  },
}

// ── Actor label: "Alice, Bob, and 4 others" ───────────────

export function formatActorLabel(actors: UserCardDto[], otherCount: number): string {
  if (actors.length === 0) return ''
  const names = actors.map((a) => a.displayName)
  if (otherCount === 0) {
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} and ${names[1]}`
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  }
  if (names.length === 1) return `${names[0]} and ${otherCount} other${otherCount === 1 ? '' : 's'}`
  return `${names.join(', ')}, and ${otherCount} other${otherCount === 1 ? '' : 's'}`
}

// ── Target link for notification ──────────────────────────

export function getNotificationLink(notification: NotificationDto): string | null {
  const { type, post, actors } = notification
  if (post) {
    // For post-related notifications link to the thread
    return `/@${post.author.handle}/status/${post.id}`
  }
  if ((type === 'follow' || type === 'follow_request') && actors.length > 0) {
    return `/@${actors[0].handle}`
  }
  if (type === 'dm') {
    return '/messages'
  }
  return null
}
