// ============================================================
// UserCard (UserRow) tests — renders user info, follow button,
// verified/private indicators, link targets
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserRow } from './UserCard'
import type { UserCardDto } from '@/types/api'

vi.mock('@/lib/api/follow', () => ({
  followApi: {
    follow: vi.fn(),
    unfollow: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
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

function makeUser(overrides: Partial<UserCardDto> = {}): UserCardDto {
  return {
    id: 'user-1',
    handle: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isVerified: false,
    isPrivate: false,
    ...overrides,
  }
}

function setup(user: UserCardDto, showFollow = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UserRow user={user} showFollow={showFollow} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('UserRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the user display name', () => {
    setup(makeUser())
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('renders the handle', () => {
    setup(makeUser())
    expect(screen.getByText('@alice')).toBeInTheDocument()
  })

  it('links to the user profile', () => {
    setup(makeUser())
    const link = screen.getByTestId('user-row-link-alice')
    expect(link).toHaveAttribute('href', '/@alice')
  })

  it('renders the follow button by default', () => {
    setup(makeUser())
    expect(screen.getByTestId('follow-button')).toBeInTheDocument()
  })

  it('does not render follow button when showFollow is false', () => {
    setup(makeUser(), false)
    expect(screen.queryByTestId('follow-button')).not.toBeInTheDocument()
  })

  it('shows verified indicator for verified users', () => {
    setup(makeUser({ isVerified: true }))
    // Both Avatar and inline row badge may show "Verified"
    const verifiedEls = screen.getAllByLabelText('Verified')
    expect(verifiedEls.length).toBeGreaterThanOrEqual(1)
  })

  it('does not show verified indicator for unverified users', () => {
    setup(makeUser({ isVerified: false }))
    expect(screen.queryByLabelText('Verified')).not.toBeInTheDocument()
  })

  it('shows private indicator for private accounts', () => {
    setup(makeUser({ isPrivate: true }))
    expect(screen.getByLabelText('Private account')).toBeInTheDocument()
  })

  it('renders avatar with initials when no avatarUrl', () => {
    setup(makeUser())
    expect(screen.getByTestId('avatar-alice')).toBeInTheDocument()
  })

  it('uses custom testId when provided', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <UserRow user={makeUser()} testId="custom-user-row" />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('custom-user-row')).toBeInTheDocument()
  })
})
