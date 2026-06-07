// ============================================================
// SettingsPage tests — form validation, session revoke,
// navigation hub, account settings form
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsPage from './SettingsPage'
import type { SessionDto, ProfileDto } from '@/types/api'

// ── Mock implementations ──────────────────────────────────────
// Use vi.hoisted so mock factories can reference these variables
const {
  mockGetSessions,
  mockDeleteSession,
  mockLogout,
  mockGetProfile,
  mockUpdateMe,
  mockLogoutStore,
  mockSetAuth,
} = vi.hoisted(() => ({
  mockGetSessions: vi.fn(),
  mockDeleteSession: vi.fn().mockResolvedValue(undefined),
  mockLogout: vi.fn().mockResolvedValue(undefined),
  mockGetProfile: vi.fn(),
  mockUpdateMe: vi.fn(),
  mockLogoutStore: vi.fn(),
  mockSetAuth: vi.fn(),
}))

vi.mock('@/lib/api/auth', () => ({
  authApi: {
    getSessions: (...args: unknown[]) => mockGetSessions(...args),
    deleteSession: (...args: unknown[]) => mockDeleteSession(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
  },
}))

vi.mock('@/lib/api/users', () => ({
  usersApi: {
    getProfile: (...args: unknown[]) => mockGetProfile(...args),
    updateMe: (...args: unknown[]) => mockUpdateMe(...args),
  },
}))

const inlineUser = {
  id: 'user-id',
  handle: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  isVerified: false,
  isPrivate: false,
  dmPrivacy: 'everyone' as const,
  createdAt: '2024-01-01T00:00:00Z',
}

vi.mock('@/lib/auth/useCurrentUser', () => ({
  useCurrentUser: vi.fn().mockReturnValue({
    id: 'user-id',
    handle: 'alice',
    displayName: 'Alice',
    email: 'alice@example.com',
    avatarUrl: null,
    isVerified: false,
    isPrivate: false,
    dmPrivacy: 'everyone',
    createdAt: '2024-01-01T00:00:00Z',
  }),
}))

vi.mock('@/lib/auth/store', () => ({
  useAuthStore: vi.fn().mockImplementation((selector?: (s: {
    accessToken: string
    user: typeof inlineUser
    logout: () => void
    setAuth: () => void
  }) => unknown) => {
    const state = {
      accessToken: 'token',
      user: inlineUser,
      logout: mockLogoutStore,
      setAuth: mockSetAuth,
    }
    return selector ? selector(state) : state
  }),
}))

function makeSession(overrides: Partial<SessionDto> = {}): SessionDto {
  return {
    id: 'session-1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120',
    ip: '192.168.1.1',
    createdAt: '2024-01-01T00:00:00Z',
    expiresAt: '2024-02-01T00:00:00Z',
    isCurrent: false,
    ...overrides,
  }
}

function makeProfile(): ProfileDto {
  return {
    id: 'user-id',
    handle: 'alice',
    displayName: 'Alice',
    bio: 'Hello',
    location: 'NYC',
    website: 'https://alice.dev',
    avatarUrl: null,
    bannerUrl: null,
    isVerified: false,
    isPrivate: false,
    counts: { followers: 100, following: 50, posts: 200 },
    viewer: null,
    createdAt: '2024-01-01T00:00:00Z',
  }
}

function setup(initialPath = '/settings') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  })
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSessions.mockResolvedValue({ items: [], cursor: null, hasMore: false })
    mockGetProfile.mockResolvedValue({ user: makeProfile() })
    mockUpdateMe.mockResolvedValue({ user: makeProfile() })
    mockDeleteSession.mockResolvedValue(undefined)
    mockLogout.mockResolvedValue(undefined)
  })

  // ── Settings hub ──────────────────────────────────────────

  it('renders settings hub at /settings', () => {
    setup('/settings')
    expect(screen.getByTestId('settings-hub')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows link to account settings', () => {
    setup('/settings')
    expect(screen.getByTestId('settings-link-account')).toBeInTheDocument()
    expect(screen.getByText('Edit profile')).toBeInTheDocument()
  })

  it('shows link to sessions settings', () => {
    setup('/settings')
    expect(screen.getByTestId('settings-link-sessions')).toBeInTheDocument()
    expect(screen.getByText('Security & sessions')).toBeInTheDocument()
  })

  // ── Account settings form ─────────────────────────────────

  it('renders account settings form at /settings/account', async () => {
    setup('/settings/account')
    const form = await screen.findByTestId('account-settings-form')
    expect(form).toBeInTheDocument()
  })

  it('shows back button on account settings', async () => {
    setup('/settings/account')
    await screen.findByTestId('account-settings-form')
    expect(screen.getByTestId('settings-back')).toBeInTheDocument()
  })

  it('pre-fills form with current profile data', async () => {
    setup('/settings/account')
    const displayName = await screen.findByTestId('settings-display-name') as HTMLInputElement
    expect(displayName.value).toBe('Alice')
  })

  it('shows validation error when display name is empty', async () => {
    setup('/settings/account')
    const displayName = await screen.findByTestId('settings-display-name')
    fireEvent.change(displayName, { target: { value: '' } })
    fireEvent.click(screen.getByTestId('settings-save-button'))

    await waitFor(() => {
      expect(screen.getByText('Display name is required')).toBeInTheDocument()
    })
  })

  it('shows validation error when display name exceeds 50 chars', async () => {
    setup('/settings/account')
    const displayName = await screen.findByTestId('settings-display-name')
    fireEvent.change(displayName, { target: { value: 'A'.repeat(51) } })
    fireEvent.click(screen.getByTestId('settings-save-button'))

    await waitFor(() => {
      expect(screen.getByText('Display name must be 50 characters or less')).toBeInTheDocument()
    })
  })

  it('save button is disabled when form is pristine', async () => {
    setup('/settings/account')
    const saveBtn = await screen.findByTestId('settings-save-button')
    expect(saveBtn).toBeDisabled()
  })

  it('submits form with valid data', async () => {
    setup('/settings/account')
    const displayName = await screen.findByTestId('settings-display-name')
    fireEvent.change(displayName, { target: { value: 'Alice Updated' } })
    fireEvent.click(screen.getByTestId('settings-save-button'))

    await waitFor(() => {
      expect(mockUpdateMe).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Alice Updated' }),
      )
    })
  })

  it('shows success message after save', async () => {
    // Force form to be dirty by providing different initial values
    mockGetProfile.mockResolvedValue({
      user: { ...makeProfile(), displayName: 'Alice Old' },
    })
    mockUpdateMe.mockResolvedValue({ user: makeProfile() })

    setup('/settings/account')
    const displayName = await screen.findByTestId('settings-display-name')
    // Wait until input is populated
    await waitFor(() => expect((displayName as HTMLInputElement).value).toBe('Alice Old'))

    fireEvent.change(displayName, { target: { value: 'Alice Updated' } })
    // Now the form is dirty
    const saveBtn = screen.getByTestId('settings-save-button')
    expect(saveBtn).not.toBeDisabled()
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByTestId('settings-success-message')).toBeInTheDocument()
    })
  }, 10000)

  it('shows error message on save failure', async () => {
    mockUpdateMe.mockRejectedValueOnce(new Error('Server error'))

    setup('/settings/account')
    const displayName = await screen.findByTestId('settings-display-name')
    fireEvent.change(displayName, { target: { value: 'Alice Updated' } })
    fireEvent.click(screen.getByTestId('settings-save-button'))

    await waitFor(() => {
      expect(screen.getByTestId('settings-error-message')).toBeInTheDocument()
    })
  })

  it('renders bio textarea', async () => {
    setup('/settings/account')
    await screen.findByTestId('account-settings-form')
    expect(screen.getByTestId('settings-bio')).toBeInTheDocument()
  })

  it('renders location input', async () => {
    setup('/settings/account')
    await screen.findByTestId('account-settings-form')
    expect(screen.getByTestId('settings-location')).toBeInTheDocument()
  })

  it('renders is-private checkbox', async () => {
    setup('/settings/account')
    await screen.findByTestId('account-settings-form')
    expect(screen.getByTestId('settings-is-private')).toBeInTheDocument()
  })

  it('renders dm-privacy select', async () => {
    setup('/settings/account')
    await screen.findByTestId('account-settings-form')
    expect(screen.getByTestId('settings-dm-privacy')).toBeInTheDocument()
  })

  // ── Sessions settings ─────────────────────────────────────

  it('renders sessions list at /settings/sessions', async () => {
    mockGetSessions.mockResolvedValue({
      items: [makeSession({ isCurrent: true }), makeSession({ id: 'session-2' })],
      cursor: null,
      hasMore: false,
    })

    setup('/settings/sessions')
    await screen.findByTestId('sessions-settings')
    expect(screen.getByTestId('session-item-session-1')).toBeInTheDocument()
    expect(screen.getByTestId('session-item-session-2')).toBeInTheDocument()
  })

  it('marks current session', async () => {
    mockGetSessions.mockResolvedValue({
      items: [makeSession({ isCurrent: true })],
      cursor: null,
      hasMore: false,
    })

    setup('/settings/sessions')
    await screen.findByTestId('sessions-settings')
    expect(screen.getByTestId('session-current-badge')).toBeInTheDocument()
    expect(screen.getByText('This device')).toBeInTheDocument()
  })

  it('does not show revoke button for current session', async () => {
    mockGetSessions.mockResolvedValue({
      items: [makeSession({ id: 'cur', isCurrent: true })],
      cursor: null,
      hasMore: false,
    })

    setup('/settings/sessions')
    await screen.findByTestId('sessions-settings')
    expect(screen.queryByTestId('session-revoke-cur')).not.toBeInTheDocument()
  })

  it('shows revoke button for non-current sessions', async () => {
    mockGetSessions.mockResolvedValue({
      items: [makeSession({ id: 'other', isCurrent: false })],
      cursor: null,
      hasMore: false,
    })

    setup('/settings/sessions')
    await screen.findByTestId('sessions-settings')
    expect(screen.getByTestId('session-revoke-other')).toBeInTheDocument()
  })

  it('calls deleteSession on revoke click', async () => {
    mockGetSessions.mockResolvedValue({
      items: [makeSession({ id: 'revokable', isCurrent: false })],
      cursor: null,
      hasMore: false,
    })

    setup('/settings/sessions')
    await screen.findByTestId('sessions-settings')
    fireEvent.click(screen.getByTestId('session-revoke-revokable'))

    await waitFor(() => {
      expect(mockDeleteSession).toHaveBeenCalledWith('revokable')
    })
  })

  it('shows logout button', async () => {
    setup('/settings/sessions')
    await screen.findByTestId('sessions-settings')
    expect(screen.getByTestId('logout-button')).toBeInTheDocument()
  })

  it('shows loading skeleton while sessions load', () => {
    mockGetSessions.mockReturnValue(new Promise(() => {}))

    setup('/settings/sessions')
    expect(screen.getByTestId('sessions-loading')).toBeInTheDocument()
  })

  it('shows revoke all button when there are other sessions', async () => {
    mockGetSessions.mockResolvedValue({
      items: [
        makeSession({ id: 'current', isCurrent: true }),
        makeSession({ id: 'other', isCurrent: false }),
      ],
      cursor: null,
      hasMore: false,
    })

    setup('/settings/sessions')
    await screen.findByTestId('sessions-settings')
    expect(screen.getByTestId('revoke-all-sessions')).toBeInTheDocument()
  })
})
