// ============================================================
// Tests: getDmPermission — read-receipt tick logic + permission gate
// ============================================================

import { describe, it, expect } from 'vitest'
import { getDmPermission } from './dmPermission'
import type { ProfileDto } from '@/types/api'

function makeProfile(overrides: Partial<ProfileDto> = {}): ProfileDto {
  return {
    id: 'user2',
    handle: 'bob',
    displayName: 'Bob',
    bio: null,
    location: null,
    website: null,
    avatarUrl: null,
    bannerUrl: null,
    isVerified: false,
    isPrivate: false,
    counts: { followers: 10, following: 5, posts: 20 },
    viewer: {
      following: false,
      followedBy: false,
      blocked: false,
      muted: false,
      followRequested: false,
    },
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('getDmPermission', () => {
  it('returns loading when profile is null', () => {
    const result = getDmPermission(null)
    expect(result.status).toBe('loading')
    expect(result.explanation).toBeNull()
  })

  it('returns loading when profile is undefined', () => {
    const result = getDmPermission(undefined)
    expect(result.status).toBe('loading')
  })

  it('returns unknown when viewer is null (unauthenticated)', () => {
    const profile = makeProfile({ viewer: null })
    const result = getDmPermission(profile)
    expect(result.status).toBe('unknown')
    expect(result.explanation).toContain('Unable to determine')
  })

  it('returns blocked when viewer.blocked is true', () => {
    const profile = makeProfile({
      viewer: {
        following: false,
        followedBy: false,
        blocked: true,
        muted: false,
        followRequested: false,
      },
    })
    const result = getDmPermission(profile)
    expect(result.status).toBe('blocked')
    expect(result.explanation).toContain('@bob')
  })

  it('returns allowed when dmPrivacy=everyone', () => {
    const profile = makeProfile({
      // ProfileDto doesn't carry dmPrivacy; we cast for the test
    })
    ;(profile as unknown as { dmPrivacy: string }).dmPrivacy = 'everyone'
    const result = getDmPermission(profile)
    expect(result.status).toBe('allowed')
    expect(result.explanation).toBeNull()
  })

  it('returns not_following when dmPrivacy=following and followedBy=false', () => {
    const profile = makeProfile({
      viewer: {
        following: true, // viewer follows them
        followedBy: false, // but they do NOT follow viewer back
        blocked: false,
        muted: false,
        followRequested: false,
      },
    })
    ;(profile as unknown as { dmPrivacy: string }).dmPrivacy = 'following'
    const result = getDmPermission(profile)
    expect(result.status).toBe('not_following')
    expect(result.explanation).toContain('only accepts messages')
  })

  it('returns allowed when dmPrivacy=following and followedBy=true', () => {
    const profile = makeProfile({
      viewer: {
        following: true,
        followedBy: true, // they follow viewer back
        blocked: false,
        muted: false,
        followRequested: false,
      },
    })
    ;(profile as unknown as { dmPrivacy: string }).dmPrivacy = 'following'
    const result = getDmPermission(profile)
    expect(result.status).toBe('allowed')
  })

  it('returns allowed by default (no dmPrivacy field = everyone)', () => {
    const profile = makeProfile()
    const result = getDmPermission(profile)
    expect(result.status).toBe('allowed')
  })
})
