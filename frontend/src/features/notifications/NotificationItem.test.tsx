// ============================================================
// Tests: NotificationItem — aggregated rendering + follow request
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { NotificationItem } from './NotificationItem'
import type { NotificationDto, UserCardDto, PostDto } from '@/types/api'
import { followApi } from '@/lib/api/follow'

vi.mock('@/lib/api/follow', () => ({
  followApi: {
    acceptFollowRequest: vi.fn(),
    declineFollowRequest: vi.fn(),
  },
}))

// ── Test helpers ──────────────────────────────────────────

function makeActor(handle: string, displayName = handle): UserCardDto {
  return {
    id: `id-${handle}`,
    handle,
    displayName,
    avatarUrl: null,
    isVerified: false,
    isPrivate: false,
  }
}

function makePost(handle = 'alice'): PostDto {
  return {
    id: 'post1',
    author: {
      id: 'user1',
      handle,
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: false,
    },
    text: 'Great post here',
    createdAt: new Date().toISOString(),
    entities: { mentions: [], hashtags: [], urls: [] },
    media: [],
    counts: { replies: 0, reposts: 0, likes: 1, bookmarks: 0 },
    viewer: null,
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
  }
}

function makeNotification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: 'n1',
    type: 'like',
    actors: [makeActor('alice', 'Alice')],
    otherCount: 0,
    post: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderItem(notification: NotificationDto, onRead?: (id: string) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationItem notification={notification} onRead={onRead} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Aggregated actor rendering ─────────────────────────────

describe('NotificationItem — actor rendering', () => {
  it('renders single actor display name', () => {
    renderItem(makeNotification({ actors: [makeActor('alice', 'Alice')] }))
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('renders up to 3 actor avatars', () => {
    const n = makeNotification({
      actors: [
        makeActor('alice', 'Alice'),
        makeActor('bob', 'Bob'),
        makeActor('carol', 'Carol'),
      ],
    })
    renderItem(n)
    // Each actor link renders an avatar
    const actorsContainer = screen.getByTestId('notification-actors-n1')
    expect(actorsContainer.querySelectorAll('[data-testid^="avatar-"]').length).toBe(3)
  })

  it('shows +N badge when otherCount > 0', () => {
    const n = makeNotification({
      actors: [makeActor('alice', 'Alice'), makeActor('bob', 'Bob')],
      otherCount: 5,
    })
    renderItem(n)
    const badge = screen.getByTestId('notification-other-count-n1')
    expect(badge).toHaveTextContent('+5')
  })

  it('does not show +N badge when otherCount is 0', () => {
    renderItem(makeNotification({ otherCount: 0 }))
    expect(screen.queryByTestId('notification-other-count-n1')).toBeNull()
  })

  it('caps badge at +99', () => {
    const n = makeNotification({
      actors: [makeActor('alice', 'Alice')],
      otherCount: 200,
    })
    renderItem(n)
    expect(screen.getByTestId('notification-other-count-n1')).toHaveTextContent('+99')
  })
})

// ── Per-type icon ──────────────────────────────────────────

describe('NotificationItem — per-type icon', () => {
  const types = [
    'like',
    'reply',
    'repost',
    'quote',
    'follow',
    'mention',
    'follow_request',
    'dm',
  ] as const

  it.each(types)('renders icon for type %s', (type) => {
    renderItem(makeNotification({ type }))
    expect(screen.getByTestId(`notif-icon-${type}`)).toBeInTheDocument()
  })
})

// ── Action label ──────────────────────────────────────────

describe('NotificationItem — action labels', () => {
  it('shows "liked your post" for like', () => {
    renderItem(makeNotification({ type: 'like' }))
    expect(screen.getByText('liked your post')).toBeInTheDocument()
  })

  it('shows "followed you" for follow', () => {
    renderItem(makeNotification({ type: 'follow' }))
    expect(screen.getByText('followed you')).toBeInTheDocument()
  })
})

// ── Post preview ──────────────────────────────────────────

describe('NotificationItem — post preview', () => {
  it('shows post text preview when post is present', () => {
    const post = makePost()
    const n = makeNotification({ type: 'like', post })
    renderItem(n)
    expect(screen.getByTestId('notification-post-preview-n1')).toHaveTextContent('Great post here')
  })

  it('does not show post preview when post is null', () => {
    renderItem(makeNotification({ post: null }))
    expect(screen.queryByTestId('notification-post-preview-n1')).toBeNull()
  })
})

// ── Unread state ──────────────────────────────────────────

describe('NotificationItem — unread state', () => {
  it('shows unread dot when readAt is null', () => {
    renderItem(makeNotification({ readAt: null }))
    expect(screen.getByLabelText('Unread')).toBeInTheDocument()
  })

  it('hides unread dot when readAt is set', () => {
    renderItem(makeNotification({ readAt: new Date().toISOString() }))
    expect(screen.queryByLabelText('Unread')).toBeNull()
  })
})

// ── Follow request Accept / Decline ───────────────────────

describe('NotificationItem — follow_request inline actions', () => {
  beforeEach(() => {
    vi.mocked(followApi.acceptFollowRequest).mockResolvedValue({ state: 'active' })
    vi.mocked(followApi.declineFollowRequest).mockResolvedValue({ state: 'declined' })
  })

  it('renders Accept and Decline buttons', () => {
    renderItem(makeNotification({ type: 'follow_request', actors: [makeActor('bob', 'Bob')] }))
    expect(screen.getByTestId('follow-request-accept-bob')).toBeInTheDocument()
    expect(screen.getByTestId('follow-request-decline-bob')).toBeInTheDocument()
  })

  it('calls acceptFollowRequest when Accept clicked', async () => {
    renderItem(makeNotification({ type: 'follow_request', actors: [makeActor('bob', 'Bob')], id: 'n2' }))
    fireEvent.click(screen.getByTestId('follow-request-accept-bob'))
    await waitFor(() => {
      expect(followApi.acceptFollowRequest).toHaveBeenCalledWith('id-bob')
    })
  })

  it('calls declineFollowRequest when Decline clicked', async () => {
    renderItem(makeNotification({ type: 'follow_request', actors: [makeActor('bob', 'Bob')], id: 'n3' }))
    fireEvent.click(screen.getByTestId('follow-request-decline-bob'))
    await waitFor(() => {
      expect(followApi.declineFollowRequest).toHaveBeenCalledWith('id-bob')
    })
  })

  it('disables buttons while loading', async () => {
    // Never resolves — simulates in-flight state
    vi.mocked(followApi.acceptFollowRequest).mockImplementation(
      () => new Promise(() => undefined),
    )
    renderItem(makeNotification({ type: 'follow_request', actors: [makeActor('bob', 'Bob')] }))
    const acceptBtn = screen.getByTestId('follow-request-accept-bob')
    fireEvent.click(acceptBtn)
    // Wait for React Query mutation to enter pending state and disable button
    await waitFor(() => {
      expect(acceptBtn).toBeDisabled()
    })
  })
})

// ── Optimistic removal on accept ──────────────────────────

describe('NotificationItem — optimistic update on accept', () => {
  it('removes item from cache optimistically', async () => {
    vi.mocked(followApi.acceptFollowRequest).mockResolvedValue({ state: 'active' })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const notif = makeNotification({
      id: 'fr1',
      type: 'follow_request',
      actors: [makeActor('dave', 'Dave')],
    })

    // Seed cache
    queryClient.setQueryData(['notifications'], {
      pages: [{ items: [notif], cursor: null, hasMore: false }],
      pageParams: [null],
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationItem notification={notif} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByTestId('follow-request-accept-dave'))

    await waitFor(() => {
      const cached = queryClient.getQueryData<{
        pages: { items: NotificationDto[] }[]
      }>(['notifications'])
      expect(cached?.pages[0].items).toHaveLength(0)
    })
  })
})
