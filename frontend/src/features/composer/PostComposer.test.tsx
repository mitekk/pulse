// ============================================================
// PostComposer tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostComposer } from './PostComposer'
import type { PostDto, PostEntities } from '@/types/api'

// ── Mocks ──────────────────────────────────────────────────

const mockCreate = vi.fn()
const mockSuggest = vi.fn()

vi.mock('@/lib/api/posts', () => ({
  postsApi: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}))

vi.mock('@/lib/api/search', () => ({
  searchApi: {
    suggest: (...args: unknown[]) => mockSuggest(...args),
  },
}))

vi.mock('@/lib/api/media', () => ({
  mediaApi: {
    getUploadUrl: vi.fn(),
    finalize: vi.fn(),
    getById: vi.fn(),
  },
}))

// Mock auth store to return a user
vi.mock('@/lib/auth/store', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({
      user: {
        id: 'u1',
        handle: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
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

// ── Test helpers ───────────────────────────────────────────

const emptyEntities: PostEntities = { mentions: [], hashtags: [], urls: [] }

function makePost(overrides: Partial<PostDto> = {}): PostDto {
  return {
    id: 'p1',
    author: {
      id: 'u1',
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: false,
    },
    text: 'Original post',
    createdAt: new Date().toISOString(),
    entities: emptyEntities,
    media: [],
    counts: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
    viewer: null,
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
    ...overrides,
  }
}

function makeNewPostResponse(): { post: PostDto } {
  return {
    post: {
      id: 'new-post',
      author: {
        id: 'u1',
        handle: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        isVerified: false,
      },
      text: 'test text',
      createdAt: new Date().toISOString(),
      entities: emptyEntities,
      media: [],
      counts: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
      viewer: null,
      replyToId: null,
      replyPolicy: 'everyone',
      quoteOf: null,
      repostOf: null,
      repostedBy: null,
      deleted: false,
    },
  }
}

function renderComposer(props: Parameters<typeof PostComposer>[0] = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PostComposer {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ──────────────────────────────────────────────────

describe('PostComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSuggest.mockResolvedValue({ users: [], tags: [] })
    mockCreate.mockResolvedValue(makeNewPostResponse())
  })

  it('renders the textarea and submit button', () => {
    renderComposer()
    expect(screen.getByTestId('composer-textarea')).toBeInTheDocument()
    expect(screen.getByTestId('composer-submit')).toBeInTheDocument()
  })

  it('submit button is disabled when textarea is empty', () => {
    renderComposer()
    expect(screen.getByTestId('composer-submit')).toBeDisabled()
  })

  it('submit button is enabled when text is entered', async () => {
    renderComposer()
    const ta = screen.getByTestId('composer-textarea')
    fireEvent.change(ta, { target: { value: 'Hello world' } })
    expect(screen.getByTestId('composer-submit')).not.toBeDisabled()
  })

  it('submit button is disabled when text exceeds 280 chars', async () => {
    renderComposer()
    const ta = screen.getByTestId('composer-textarea')
    fireEvent.change(ta, { target: { value: 'a'.repeat(281) } })
    expect(screen.getByTestId('composer-submit')).toBeDisabled()
  })

  it('char ring appears when text is entered', async () => {
    renderComposer()
    const ta = screen.getByTestId('composer-textarea')
    fireEvent.change(ta, { target: { value: 'Hello' } })
    expect(screen.getByTestId('char-ring')).toBeInTheDocument()
  })

  it('shows reply placeholder when in reply mode', () => {
    renderComposer({ mode: 'reply', replyToId: 'p1' })
    const ta = screen.getByTestId('composer-textarea')
    expect(ta).toHaveAttribute('placeholder', 'Post your reply…')
  })

  it('submit button shows Reply in reply mode', () => {
    renderComposer({ mode: 'reply', replyToId: 'p1' })
    expect(screen.getByTestId('composer-submit')).toHaveTextContent('Reply')
  })

  it('shows reply context header when replyToPost is provided', () => {
    const post = makePost()
    renderComposer({ mode: 'reply', replyToId: 'p1', replyToPost: post })
    expect(screen.getByText(/Replying to/)).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
  })

  it('shows reply-policy selector in new-post mode', () => {
    renderComposer({ mode: 'new' })
    expect(screen.getByTestId('reply-policy-trigger')).toBeInTheDocument()
  })

  it('does not show reply-policy selector in reply mode', () => {
    renderComposer({ mode: 'reply', replyToId: 'p1' })
    expect(screen.queryByTestId('reply-policy-trigger')).not.toBeInTheDocument()
  })

  it('calls onSuccess after successful submit', async () => {
    const onSuccess = vi.fn()
    renderComposer({ onSuccess })
    const ta = screen.getByTestId('composer-textarea')
    fireEvent.change(ta, { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByTestId('composer-submit'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('shows attach-media button', () => {
    renderComposer()
    expect(screen.getByTestId('attach-media-button')).toBeInTheDocument()
  })

  it('autocomplete dropdown is hidden initially', () => {
    renderComposer()
    expect(screen.queryByTestId('autocomplete-dropdown')).not.toBeInTheDocument()
  })

  it('shows autocomplete dropdown when user types @handle and suggestions exist', async () => {
    mockSuggest.mockResolvedValue({
      users: [
        {
          id: 'u2',
          handle: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
          isVerified: false,
          isPrivate: false,
        },
      ],
      tags: [],
    })

    const user = userEvent.setup({ delay: null })
    renderComposer()
    const ta = screen.getByTestId('composer-textarea')
    await user.click(ta)
    await user.type(ta, '@bo')

    await waitFor(
      () => expect(screen.getByTestId('autocomplete-dropdown')).toBeInTheDocument(),
      { timeout: 1000 },
    )
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('clears textarea after successful submit', async () => {
    renderComposer()
    const ta = screen.getByTestId('composer-textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Some text to post' } })
    expect(ta.value).toBe('Some text to post')

    fireEvent.click(screen.getByTestId('composer-submit'))
    await waitFor(() => expect(ta.value).toBe(''))
  })
})
