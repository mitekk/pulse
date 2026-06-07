// ============================================================
// PostPage (Thread view) tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PostPage from './PostPage'
import type { PostDto, PostEntities } from '@/types/api'
import type { ThreadResponse } from '@/lib/api/posts'

// ── Mocks ──────────────────────────────────────────────────

const mockGetThread = vi.fn()
const mockGetReplies = vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false })

vi.mock('@/lib/api/posts', () => ({
  postsApi: {
    getThread: (...args: unknown[]) => mockGetThread(...args),
    getReplies: (...args: unknown[]) => mockGetReplies(...args),
    create: vi.fn(),
  },
}))

vi.mock('@/lib/realtime/roomManager', () => ({
  subscribePost: vi.fn(),
  unsubscribePost: vi.fn(),
}))

vi.mock('@/lib/api/engagement', () => ({
  engagementApi: {
    like: vi.fn(),
    unlike: vi.fn(),
    repost: vi.fn(),
    unrepost: vi.fn(),
    bookmark: vi.fn(),
    unbookmark: vi.fn(),
  },
}))

vi.mock('@/lib/api/search', () => ({
  searchApi: {
    suggest: vi.fn().mockResolvedValue({ users: [], tags: [] }),
  },
}))

vi.mock('@/lib/api/media', () => ({
  mediaApi: { getUploadUrl: vi.fn(), finalize: vi.fn(), getById: vi.fn() },
}))

vi.mock('@/lib/auth/store', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({
      user: {
        id: 'u1',
        handle: 'alice',
        displayName: 'Alice',
        email: 'a@a.com',
        avatarUrl: null,
        isVerified: false,
        isPrivate: false,
        dmPrivacy: 'everyone' as const,
        createdAt: '2024-01-01T00:00:00Z',
      },
    }),
  selectUser: (s: { user: unknown }) => s.user,
}))

vi.mock('@/lib/stores/timelineBufferStore', () => ({
  useTimelineBufferStore: () => vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────

const emptyEntities: PostEntities = { mentions: [], hashtags: [], urls: [] }

function makePost(overrides: Partial<PostDto> = {}): PostDto {
  return {
    id: 'p1',
    author: { id: 'u1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false },
    text: 'Focus post',
    createdAt: new Date().toISOString(),
    entities: emptyEntities,
    media: [],
    counts: { replies: 3, reposts: 1, likes: 5, bookmarks: 0 },
    viewer: { liked: false, reposted: false, bookmarked: false },
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/@alice/status/p1']}>
        <Routes>
          <Route path="/:handle/status/:postId" element={<PostPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ──────────────────────────────────────────────────

describe('PostPage (Thread view)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetReplies.mockResolvedValue({ items: [], cursor: null, hasMore: false })
  })

  it('shows loading skeleton while fetching', () => {
    mockGetThread.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('thread-loading')).toBeInTheDocument()
  })

  it('renders focused post after loading', async () => {
    const focused = makePost({ text: 'This is the focused post' })
    const response: ThreadResponse = {
      ancestors: [],
      post: focused,
      replies: [],
      cursor: null,
      hasMore: false,
    }
    mockGetThread.mockResolvedValue(response)

    renderPage()
    await waitFor(() => expect(screen.getByTestId('focused-post')).toBeInTheDocument())
    expect(screen.getByText('This is the focused post')).toBeInTheDocument()
  })

  it('renders ancestor chain with connector', async () => {
    const ancestor = makePost({ id: 'ancestor1', text: 'Ancestor post' })
    const focused = makePost({ text: 'Focused post', replyToId: 'ancestor1' })
    const response: ThreadResponse = {
      ancestors: [ancestor],
      post: focused,
      replies: [],
      cursor: null,
      hasMore: false,
    }
    mockGetThread.mockResolvedValue(response)

    renderPage()
    await waitFor(() => expect(screen.getByTestId('ancestor-chain')).toBeInTheDocument())
    expect(screen.getByTestId('ancestor-card')).toBeInTheDocument()
    expect(screen.getByText('Ancestor post')).toBeInTheDocument()
  })

  it('renders deleted ancestor as tombstone', async () => {
    const deletedAncestor = makePost({ id: 'anc1', deleted: true, text: null })
    const focused = makePost()
    const response: ThreadResponse = {
      ancestors: [deletedAncestor],
      post: focused,
      replies: [],
      cursor: null,
      hasMore: false,
    }
    mockGetThread.mockResolvedValue(response)

    renderPage()
    await waitFor(() => expect(screen.getByTestId('ancestor-tombstone')).toBeInTheDocument())
  })

  it('renders initial replies from thread response', async () => {
    const focused = makePost()
    const reply1 = makePost({ id: 'r1', text: 'Reply one', replyToId: 'p1' })
    const reply2 = makePost({ id: 'r2', text: 'Reply two', replyToId: 'p1' })
    const response: ThreadResponse = {
      ancestors: [],
      post: focused,
      replies: [reply1, reply2],
      cursor: null,
      hasMore: false,
    }
    mockGetThread.mockResolvedValue(response)

    renderPage()
    await waitFor(() => expect(screen.getByText('Reply one')).toBeInTheDocument())
    expect(screen.getByText('Reply two')).toBeInTheDocument()
  })

  it('renders reply composer section', async () => {
    const response: ThreadResponse = {
      ancestors: [],
      post: makePost(),
      replies: [],
      cursor: null,
      hasMore: false,
    }
    mockGetThread.mockResolvedValue(response)

    renderPage()
    await waitFor(() => expect(screen.getByTestId('reply-composer-section')).toBeInTheDocument())
    // Composer should be present for 'everyone' reply policy
    expect(screen.getByTestId('post-composer')).toBeInTheDocument()
  })

  it('shows reply-policy note on focused post', async () => {
    const response: ThreadResponse = {
      ancestors: [],
      post: makePost({ replyPolicy: 'following' }),
      replies: [],
      cursor: null,
      hasMore: false,
    }
    mockGetThread.mockResolvedValue(response)

    renderPage()
    await waitFor(() => expect(screen.getByTestId('reply-policy-note')).toBeInTheDocument())
    expect(screen.getByText(/People you follow can reply/)).toBeInTheDocument()
  })

  it('shows full timestamp on focused post', async () => {
    const response: ThreadResponse = {
      ancestors: [],
      post: makePost({ createdAt: '2024-06-07T12:00:00Z' }),
      replies: [],
      cursor: null,
      hasMore: false,
    }
    mockGetThread.mockResolvedValue(response)

    renderPage()
    await waitFor(() => expect(screen.getByTestId('post-full-time')).toBeInTheDocument())
  })

  it('shows error state on fetch failure', async () => {
    mockGetThread.mockRejectedValue(new Error('Network error'))

    renderPage()
    await waitFor(() =>
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument(),
    )
  })
})
