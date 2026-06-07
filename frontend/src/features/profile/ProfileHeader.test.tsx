// ============================================================
// ProfileHeader tests — renders profile info, banner, follow button,
// private lock indicator, overflow menu visibility
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileHeader } from './ProfileHeader'
import type { ProfileDto } from '@/types/api'

vi.mock('@/lib/api/follow', () => ({
  followApi: {
    follow: vi.fn(),
    unfollow: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
  },
}))

vi.mock('@/lib/auth/useCurrentUser', () => ({
  useCurrentUser: vi.fn().mockReturnValue({
    id: 'viewer-id',
    handle: 'viewer',
    displayName: 'Viewer',
    email: 'v@example.com',
    avatarUrl: null,
    isVerified: false,
    isPrivate: false,
    dmPrivacy: 'everyone',
    createdAt: new Date().toISOString(),
  }),
}))

function makeProfile(overrides: Partial<ProfileDto> = {}): ProfileDto {
  return {
    id: 'alice-id',
    handle: 'alice',
    displayName: 'Alice',
    bio: 'Hello world',
    location: 'NYC',
    website: 'https://alice.dev',
    avatarUrl: null,
    bannerUrl: null,
    isVerified: false,
    isPrivate: false,
    counts: { followers: 120, following: 88, posts: 340 },
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

function setup(profile: ProfileDto) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfileHeader profile={profile} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfileHeader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders display name', () => {
    setup(makeProfile())
    expect(screen.getByTestId('profile-display-name')).toHaveTextContent('Alice')
  })

  it('renders handle', () => {
    setup(makeProfile())
    expect(screen.getByTestId('profile-handle')).toHaveTextContent('@alice')
  })

  it('renders bio', () => {
    setup(makeProfile())
    expect(screen.getByTestId('profile-bio')).toHaveTextContent('Hello world')
  })

  it('renders location', () => {
    setup(makeProfile())
    expect(screen.getByTestId('profile-location')).toHaveTextContent('NYC')
  })

  it('renders website link', () => {
    setup(makeProfile())
    const link = screen.getByTestId('profile-website')
    expect(link).toHaveAttribute('href', 'https://alice.dev')
  })

  it('renders follower count link', () => {
    setup(makeProfile())
    const el = screen.getByTestId('profile-followers-count')
    expect(el).toHaveTextContent('120')
    expect(el).toHaveTextContent('Followers')
  })

  it('renders following count link', () => {
    setup(makeProfile())
    const el = screen.getByTestId('profile-following-count')
    expect(el).toHaveTextContent('88')
    expect(el).toHaveTextContent('Following')
  })

  it('renders verified mark for verified profiles', () => {
    setup(makeProfile({ isVerified: true }))
    expect(screen.getByTestId('verified-mark')).toBeInTheDocument()
  })

  it('does not render verified mark for unverified profiles', () => {
    setup(makeProfile({ isVerified: false }))
    expect(screen.queryByTestId('verified-mark')).not.toBeInTheDocument()
  })

  it('renders private lock icon for private accounts', () => {
    setup(makeProfile({ isPrivate: true }))
    expect(screen.getByTestId('private-lock')).toBeInTheDocument()
  })

  it('renders follow button for non-self profiles', () => {
    setup(makeProfile())
    expect(screen.getByTestId('profile-follow-button')).toBeInTheDocument()
  })

  it('renders overflow menu trigger for non-self profiles', () => {
    setup(makeProfile())
    expect(screen.getByTestId('profile-menu-trigger')).toBeInTheDocument()
  })

  it('does not render overflow menu trigger for own profile', () => {
    // useCurrentUser returns { id: 'viewer-id' }, makeProfile returns id: 'alice-id'
    // but set handle same as viewer
    setup(makeProfile({ id: 'viewer-id' }))
    expect(screen.queryByTestId('profile-menu-trigger')).not.toBeInTheDocument()
  })

  it('renders banner when bannerUrl is set', () => {
    setup(makeProfile({ bannerUrl: 'https://cdn.example.com/banner.jpg' }))
    const banner = screen.getByTestId('profile-banner')
    expect(banner).toBeInTheDocument()
  })

  it('formats large follower counts with K suffix', () => {
    setup(makeProfile({ counts: { followers: 1500, following: 88, posts: 340 } }))
    expect(screen.getByTestId('profile-followers-count')).toHaveTextContent('1.5K')
  })

  it('renders profile avatar wrapper', () => {
    setup(makeProfile())
    expect(screen.getByTestId('profile-avatar-wrapper')).toBeInTheDocument()
  })
})
