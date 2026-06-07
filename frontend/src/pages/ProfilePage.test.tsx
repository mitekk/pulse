// ============================================================
// ProfilePage tests — tabs, private lock, loading/error states,
// profile header renders
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProfilePage from './ProfilePage'
import type { ProfileDto } from '@/types/api'

// ── Mocks ──────────────────────────────────────────────────────
const mockGetProfile = vi.fn()
const mockGetPosts = vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false })
const mockGetReplies = vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false })
const mockGetMedia = vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false })
const mockGetLikes = vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false })
const mockGetFollowers = vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false })
const mockGetFollowing = vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false })

vi.mock('@/lib/api/users', () => ({
  usersApi: {
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    getPosts: (...args: unknown[]) => mockGetPosts(...args),
    getReplies: (...args: unknown[]) => mockGetReplies(...args),
    getMedia: (...args: unknown[]) => mockGetMedia(...args),
    getLikes: (...args: unknown[]) => mockGetLikes(...args),
    getFollowers: (...args: unknown[]) => mockGetFollowers(...args),
    getFollowing: (...args: unknown[]) => mockGetFollowing(...args),
  },
}))

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
    email: 'v@test.com',
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
    displayName: 'Alice Wonder',
    bio: 'A bio',
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

function renderPage(
  tab: Parameters<typeof ProfilePage>[0]['tab'] = 'posts',
  handle = 'alice',
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  })

  // Route path is /:handle — handle param includes @ prefix in app
  // In tests we use /@handle to match the real app URL pattern
  const pathMap: Record<string, string> = {
    posts: `/@${handle}`,
    replies: `/@${handle}/replies`,
    media: `/@${handle}/media`,
    likes: `/@${handle}/likes`,
    followers: `/@${handle}/followers`,
    following: `/@${handle}/following`,
  }

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[pathMap[tab]]}>
        <Routes>
          <Route path="/:handle" element={<ProfilePage tab="posts" />} />
          <Route path="/:handle/replies" element={<ProfilePage tab="replies" />} />
          <Route path="/:handle/media" element={<ProfilePage tab="media" />} />
          <Route path="/:handle/likes" element={<ProfilePage tab="likes" />} />
          <Route path="/:handle/followers" element={<ProfilePage tab="followers" />} />
          <Route path="/:handle/following" element={<ProfilePage tab="following" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetProfile.mockResolvedValue({ user: makeProfile() })
    mockGetPosts.mockResolvedValue({ items: [], cursor: null, hasMore: false })
    mockGetReplies.mockResolvedValue({ items: [], cursor: null, hasMore: false })
    mockGetMedia.mockResolvedValue({ items: [], cursor: null, hasMore: false })
    mockGetLikes.mockResolvedValue({ items: [], cursor: null, hasMore: false })
    mockGetFollowers.mockResolvedValue({ items: [], cursor: null, hasMore: false })
    mockGetFollowing.mockResolvedValue({ items: [], cursor: null, hasMore: false })
  })

  it('shows loading skeleton initially', () => {
    mockGetProfile.mockReturnValue(new Promise(() => {})) // never resolves

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/@alice']}>
          <Routes>
            <Route path="/:handle" element={<ProfilePage tab="posts" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('profile-page-loading')).toBeInTheDocument()
    expect(screen.getByTestId('profile-header-skeleton')).toBeInTheDocument()
  })

  it('renders profile header after loading', async () => {
    renderPage('posts')
    await screen.findByTestId('profile-info')
    expect(screen.getByTestId('profile-display-name')).toHaveTextContent('Alice Wonder')
  })

  it('renders profile tabs for posts tab', async () => {
    renderPage('posts')
    await screen.findByTestId('profile-tabs')
    expect(screen.getByTestId('profile-tab-posts')).toBeInTheDocument()
    expect(screen.getByTestId('profile-tab-replies')).toBeInTheDocument()
    expect(screen.getByTestId('profile-tab-media')).toBeInTheDocument()
    expect(screen.getByTestId('profile-tab-likes')).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', async () => {
    renderPage('posts')
    await screen.findByTestId('profile-tabs')
    expect(screen.getByTestId('profile-tab-posts')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('profile-tab-replies')).toHaveAttribute('aria-selected', 'false')
  })

  it('shows private lock state for private account when viewer not following', async () => {
    mockGetProfile.mockResolvedValue({
      user: makeProfile({
        isPrivate: true,
        viewer: { following: false, followedBy: false, blocked: false, muted: false, followRequested: false },
      }),
    })
    renderPage('posts')
    await screen.findByTestId('private-lock-state')
    expect(screen.getByText(/These posts are protected/)).toBeInTheDocument()
  })

  it('does NOT show private lock when viewer is following', async () => {
    mockGetProfile.mockResolvedValue({
      user: makeProfile({
        isPrivate: true,
        viewer: { following: true, followedBy: false, blocked: false, muted: false, followRequested: false },
      }),
    })
    renderPage('posts')
    await screen.findByTestId('profile-info')
    expect(screen.queryByTestId('private-lock-state')).not.toBeInTheDocument()
  })

  it('does NOT show private lock for self (own profile)', async () => {
    mockGetProfile.mockResolvedValue({
      user: makeProfile({ isPrivate: true, id: 'viewer-id', handle: 'alice' }),
    })
    renderPage('posts')
    await screen.findByTestId('profile-info')
    expect(screen.queryByTestId('private-lock-state')).not.toBeInTheDocument()
  })

  it('does NOT show tabs for followers tab', async () => {
    renderPage('followers')
    await screen.findByTestId('profile-info')
    expect(screen.queryByTestId('profile-tabs')).not.toBeInTheDocument()
  })

  it('does NOT show tabs for following tab', async () => {
    renderPage('following')
    await screen.findByTestId('profile-info')
    expect(screen.queryByTestId('profile-tabs')).not.toBeInTheDocument()
  })

  it('shows empty state when no posts', async () => {
    renderPage('posts')
    await screen.findByTestId('profile-info')
    await screen.findByText("@alice hasn't posted anything yet.")
  })

  it('renders tabs with correct hrefs', async () => {
    renderPage('posts')
    await screen.findByTestId('profile-tabs')
    expect(screen.getByTestId('profile-tab-posts')).toHaveAttribute('href', '/@alice')
    expect(screen.getByTestId('profile-tab-replies')).toHaveAttribute('href', '/@alice/replies')
    expect(screen.getByTestId('profile-tab-media')).toHaveAttribute('href', '/@alice/media')
    expect(screen.getByTestId('profile-tab-likes')).toHaveAttribute('href', '/@alice/likes')
  })

  it('renders profile page wrapper with handle testid', async () => {
    renderPage('posts')
    await screen.findByTestId('profile-page-alice')
  })

  it('clicking a tab link renders without error', async () => {
    renderPage('posts')
    await screen.findByTestId('profile-tabs')
    const repliesTab = screen.getByTestId('profile-tab-replies')
    fireEvent.click(repliesTab)
    expect(repliesTab).toBeInTheDocument()
  })

  it('followers tab shows heading not profile tabs', async () => {
    renderPage('followers')
    await screen.findByTestId('profile-info')
    expect(screen.queryByTestId('profile-tabs')).not.toBeInTheDocument()
    // The heading div (not the count link) should be visible
    const headings = screen.getAllByText('Followers')
    expect(headings.length).toBeGreaterThanOrEqual(1)
  })

  it('following tab shows heading not profile tabs', async () => {
    renderPage('following')
    await screen.findByTestId('profile-info')
    expect(screen.queryByTestId('profile-tabs')).not.toBeInTheDocument()
    const headings = screen.getAllByText('Following')
    expect(headings.length).toBeGreaterThanOrEqual(1)
  })
})
