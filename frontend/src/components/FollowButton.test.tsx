// ============================================================
// FollowButton tests — relationship state matrix, optimistic
// toggle, rollback on error, self → edit profile link
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FollowButton } from './FollowButton'
import type { ProfileDto } from '@/types/api'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('@/lib/api/follow', () => ({
  followApi: {
    follow: vi.fn().mockResolvedValue({ state: 'active' }),
    unfollow: vi.fn().mockResolvedValue(undefined),
    block: vi.fn().mockResolvedValue({ blocked: true }),
    unblock: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/auth/useCurrentUser', () => ({
  useCurrentUser: vi.fn().mockReturnValue({
    id: 'viewer-id',
    handle: 'viewer',
    displayName: 'Viewer',
    email: 'viewer@example.com',
    avatarUrl: null,
    isVerified: false,
    isPrivate: false,
    dmPrivacy: 'everyone',
    createdAt: new Date().toISOString(),
  }),
}))

type ViewerFlags = ProfileDto['viewer']

function makeViewer(overrides: Partial<NonNullable<ViewerFlags>> = {}): NonNullable<ViewerFlags> {
  return {
    following: false,
    followedBy: false,
    blocked: false,
    muted: false,
    followRequested: false,
    ...overrides,
  }
}

function setup(props: Partial<Parameters<typeof FollowButton>[0]> = {}) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: 0 },
    },
  })
  const defaults = {
    handle: 'alice',
    userId: 'alice-id',
    isPrivate: false,
    viewerFlags: makeViewer(),
    ...props,
  }
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <FollowButton {...defaults} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('FollowButton', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── State matrix ──────────────────────────────────────────

  it('shows "Follow" when not following', () => {
    setup({ viewerFlags: makeViewer({ following: false }) })
    expect(screen.getByTestId('follow-button')).toHaveTextContent('Follow')
  })

  it('shows "Following" when already following', () => {
    setup({ viewerFlags: makeViewer({ following: true }) })
    expect(screen.getByTestId('follow-button-following')).toHaveTextContent('Following')
  })

  it('shows "Requested" when follow is pending', () => {
    setup({ viewerFlags: makeViewer({ followRequested: true }) })
    expect(screen.getByTestId('follow-button-requested')).toHaveTextContent('Requested')
  })

  it('shows "Blocked" when user is blocked', () => {
    setup({ viewerFlags: makeViewer({ blocked: true }) })
    expect(screen.getByTestId('follow-button-blocked')).toHaveTextContent('Blocked')
  })

  it('shows "Edit profile" link for self', () => {
    setup({ userId: 'viewer-id' })
    const link = screen.getByTestId('follow-button-self')
    expect(link).toBeInTheDocument()
    expect(link).toHaveTextContent('Edit profile')
    expect(link).toHaveAttribute('href', '/settings/account')
  })

  // ── Hover states ──────────────────────────────────────────

  it('shows "Unfollow" on hover when following', () => {
    setup({ viewerFlags: makeViewer({ following: true }) })
    const btn = screen.getByTestId('follow-button-following')
    fireEvent.mouseEnter(btn)
    expect(btn).toHaveTextContent('Unfollow')
  })

  it('shows "Cancel" on hover when requested', () => {
    setup({ viewerFlags: makeViewer({ followRequested: true }) })
    const btn = screen.getByTestId('follow-button-requested')
    fireEvent.mouseEnter(btn)
    expect(btn).toHaveTextContent('Cancel')
  })

  it('shows "Unblock" on hover when blocked', () => {
    setup({ viewerFlags: makeViewer({ blocked: true }) })
    const btn = screen.getByTestId('follow-button-blocked')
    fireEvent.mouseEnter(btn)
    expect(btn).toHaveTextContent('Unblock')
  })

  // ── Follow action ─────────────────────────────────────────

  it('calls followApi.follow on click when not following', async () => {
    const { followApi } = await import('@/lib/api/follow')
    setup({ viewerFlags: makeViewer({ following: false }) })
    fireEvent.click(screen.getByTestId('follow-button'))
    await waitFor(() => expect(followApi.follow).toHaveBeenCalledWith('alice'))
  })

  // ── Unfollow confirm dialog ───────────────────────────────

  it('opens confirm dialog when clicking "Following"', () => {
    setup({ viewerFlags: makeViewer({ following: true }) })
    const btn = screen.getByTestId('follow-button-following')
    fireEvent.click(btn)
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText(/Unfollow @alice/i)).toBeInTheDocument()
  })

  it('closes confirm dialog on cancel', () => {
    setup({ viewerFlags: makeViewer({ following: true }) })
    fireEvent.click(screen.getByTestId('follow-button-following'))
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument()
  })

  it('calls followApi.unfollow when confirming unfollow', async () => {
    const { followApi } = await import('@/lib/api/follow')
    setup({ viewerFlags: makeViewer({ following: true }) })
    fireEvent.click(screen.getByTestId('follow-button-following'))
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
    await waitFor(() => expect(followApi.unfollow).toHaveBeenCalledWith('alice'))
  })

  // ── Optimistic update rollback ────────────────────────────

  it('rolls back optimistic follow on error', async () => {
    const { followApi } = await import('@/lib/api/follow')
    vi.mocked(followApi.follow).mockRejectedValueOnce(new Error('Network error'))

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } } })
    const profileKey = ['users', 'alice', 'profile']
    const initialProfile = {
      user: {
        id: 'alice-id',
        handle: 'alice',
        counts: { followers: 100, following: 50, posts: 10 },
        viewer: makeViewer({ following: false }),
      },
    }
    qc.setQueryData(profileKey, initialProfile)

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <FollowButton handle="alice" userId="alice-id" viewerFlags={makeViewer({ following: false })} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByTestId('follow-button'))

    await waitFor(() => {
      // After error, cache should be restored to previous
      const data = qc.getQueryData<typeof initialProfile>(profileKey)
      expect(data?.user?.counts?.followers).toBe(100)
    })
  })

  // ── Private account ───────────────────────────────────────

  it('shows "Follow" for private account (follow sends request)', () => {
    setup({ isPrivate: true, viewerFlags: makeViewer({ following: false }) })
    expect(screen.getByTestId('follow-button')).toHaveTextContent('Follow')
  })

  // ── Compact variant ───────────────────────────────────────

  it('renders compact variant', () => {
    setup({ compact: true })
    expect(screen.getByTestId('follow-button')).toBeInTheDocument()
  })
})
