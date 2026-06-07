// ============================================================
// Tests: notificationUtils
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  formatActorLabel,
  getNotificationLink,
  NOTIFICATION_CONFIG,
} from './notificationUtils'
import type { NotificationDto, UserCardDto } from '@/types/api'

// ── Fixtures ──────────────────────────────────────────────

function makeActor(handle: string, displayName: string): UserCardDto {
  return {
    id: `id-${handle}`,
    handle,
    displayName,
    avatarUrl: null,
    isVerified: false,
    isPrivate: false,
  }
}

function makeNotification(
  overrides: Partial<NotificationDto> = {},
): NotificationDto {
  return {
    id: 'n1',
    type: 'like',
    actors: [],
    otherCount: 0,
    post: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ── formatActorLabel ───────────────────────────────────────

describe('formatActorLabel', () => {
  it('returns empty string for no actors', () => {
    expect(formatActorLabel([], 0)).toBe('')
  })

  it('returns single name when one actor, no others', () => {
    const actors = [makeActor('alice', 'Alice')]
    expect(formatActorLabel(actors, 0)).toBe('Alice')
  })

  it('returns "A and B" for two actors, no others', () => {
    const actors = [makeActor('alice', 'Alice'), makeActor('bob', 'Bob')]
    expect(formatActorLabel(actors, 0)).toBe('Alice and Bob')
  })

  it('returns "A, B, and C" for three actors, no others', () => {
    const actors = [
      makeActor('alice', 'Alice'),
      makeActor('bob', 'Bob'),
      makeActor('carol', 'Carol'),
    ]
    expect(formatActorLabel(actors, 0)).toBe('Alice, Bob, and Carol')
  })

  it('returns "A and N others" for 1 actor + N others', () => {
    const actors = [makeActor('alice', 'Alice')]
    expect(formatActorLabel(actors, 4)).toBe('Alice and 4 others')
  })

  it('returns "A and 1 other" (singular) for 1 actor + 1 other', () => {
    const actors = [makeActor('alice', 'Alice')]
    expect(formatActorLabel(actors, 1)).toBe('Alice and 1 other')
  })

  it('returns "A, B, and 3 others" for 2 actors + 3 others', () => {
    const actors = [makeActor('alice', 'Alice'), makeActor('bob', 'Bob')]
    expect(formatActorLabel(actors, 3)).toBe('Alice, Bob, and 3 others')
  })
})

// ── NOTIFICATION_CONFIG icon mapping ──────────────────────

describe('NOTIFICATION_CONFIG', () => {
  const allTypes = [
    'like',
    'reply',
    'repost',
    'quote',
    'follow',
    'mention',
    'follow_request',
    'dm',
  ] as const

  it.each(allTypes)('has config for type %s', (type) => {
    expect(NOTIFICATION_CONFIG[type]).toBeDefined()
    expect(NOTIFICATION_CONFIG[type].icon).toBeTruthy()
    expect(NOTIFICATION_CONFIG[type].actionLabel).toBeTruthy()
  })

  it('maps like → heart icon', () => {
    expect(NOTIFICATION_CONFIG.like.icon).toBe('heart')
  })

  it('maps follow → follow icon', () => {
    expect(NOTIFICATION_CONFIG.follow.icon).toBe('follow')
  })

  it('maps follow_request → person-request icon', () => {
    expect(NOTIFICATION_CONFIG.follow_request.icon).toBe('person-request')
  })

  it('maps dm → dm icon', () => {
    expect(NOTIFICATION_CONFIG.dm.icon).toBe('dm')
  })

  it('maps reply → reply icon', () => {
    expect(NOTIFICATION_CONFIG.reply.icon).toBe('reply')
  })
})

// ── getNotificationLink ────────────────────────────────────

describe('getNotificationLink', () => {
  const mockPost = {
    id: 'post1',
    author: {
      id: 'user1',
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: false,
    },
    text: 'Hello',
    createdAt: new Date().toISOString(),
    entities: { mentions: [], hashtags: [], urls: [] },
    media: [],
    counts: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
    viewer: null,
    replyToId: null,
    replyPolicy: 'everyone' as const,
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
  }

  it('returns thread link for like notification with post', () => {
    const n = makeNotification({ type: 'like', post: mockPost })
    expect(getNotificationLink(n)).toBe('/@alice/status/post1')
  })

  it('returns thread link for reply notification with post', () => {
    const n = makeNotification({ type: 'reply', post: mockPost })
    expect(getNotificationLink(n)).toBe('/@alice/status/post1')
  })

  it('returns actor profile for follow notification', () => {
    const n = makeNotification({
      type: 'follow',
      actors: [makeActor('bob', 'Bob')],
    })
    expect(getNotificationLink(n)).toBe('/@bob')
  })

  it('returns actor profile for follow_request notification', () => {
    const n = makeNotification({
      type: 'follow_request',
      actors: [makeActor('carol', 'Carol')],
    })
    expect(getNotificationLink(n)).toBe('/@carol')
  })

  it('returns /messages for dm notification', () => {
    const n = makeNotification({ type: 'dm' })
    expect(getNotificationLink(n)).toBe('/messages')
  })

  it('returns null for follow notification with no actors', () => {
    const n = makeNotification({ type: 'follow', actors: [] })
    expect(getNotificationLink(n)).toBeNull()
  })
})
