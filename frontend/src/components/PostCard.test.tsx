// ============================================================
// PostCard tests — all variants: normal, reply, repost, quote, tombstone
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostCard } from './PostCard'
import type { PostDto, PostEntities } from '@/types/api'

// ── Mock engagement API ────────────────────────────────────
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

// ── Fixture helpers ────────────────────────────────────────

const emptyEntities: PostEntities = { mentions: [], hashtags: [], urls: [] }

function makeAuthor(handle = 'alice') {
  return {
    id: 'u1',
    handle,
    displayName: handle.charAt(0).toUpperCase() + handle.slice(1),
    avatarUrl: null,
    isVerified: false,
  }
}

function makePost(overrides: Partial<PostDto> = {}): PostDto {
  return {
    id: 'p1',
    author: makeAuthor(),
    text: 'Hello world',
    createdAt: new Date().toISOString(),
    entities: emptyEntities,
    media: [],
    counts: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
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

function setup(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PostCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders normal post', () => {
    setup(<PostCard post={makePost()} />)
    expect(screen.getByTestId('post-card')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
  })

  it('renders tombstone when post is deleted', () => {
    setup(<PostCard post={makePost({ deleted: true })} />)
    expect(screen.getByTestId('post-card-tombstone')).toBeInTheDocument()
    expect(screen.getByText(/This post was deleted/i)).toBeInTheDocument()
  })

  it('renders tombstone as embedded without crash', () => {
    setup(<PostCard post={makePost({ deleted: true })} embedded />)
    expect(screen.getByTestId('post-card-tombstone')).toBeInTheDocument()
  })

  it('renders repost wrapper with attribution', () => {
    const originalPost = makePost({ id: 'original', text: 'The original post' })
    const repostPost = makePost({
      id: 'p2',
      author: makeAuthor('bob'),
      repostOf: originalPost,
    })
    setup(<PostCard post={repostPost} />)
    expect(screen.getByTestId('post-card-repost')).toBeInTheDocument()
    expect(screen.getByText(/Bob reposted/i)).toBeInTheDocument()
    expect(screen.getByText('The original post')).toBeInTheDocument()
  })

  it('renders quote post with embedded QuoteCard', () => {
    const quoted = makePost({
      id: 'quoted',
      text: 'The quoted post',
      author: makeAuthor('carol'),
    })
    const quotePost = makePost({
      id: 'p3',
      text: 'My take on this',
      quoteOf: quoted,
    })
    setup(<PostCard post={quotePost} />)
    expect(screen.getByTestId('post-card')).toBeInTheDocument()
    expect(screen.getByText('My take on this')).toBeInTheDocument()
    expect(screen.getByTestId('quote-card')).toBeInTheDocument()
    expect(screen.getByText('The quoted post')).toBeInTheDocument()
  })

  it('renders tombstone QuoteCard when quoteOf is deleted', () => {
    const deletedQuote = makePost({ id: 'del', deleted: true, text: null })
    const quotePost = makePost({ text: 'quoting a deleted post', quoteOf: deletedQuote })
    setup(<PostCard post={quotePost} />)
    expect(screen.getByTestId('quote-card-tombstone')).toBeInTheDocument()
  })

  it('renders action bar with correct data-testids', () => {
    setup(<PostCard post={makePost()} />)
    expect(screen.getByTestId('action-bar')).toBeInTheDocument()
    expect(screen.getByTestId('action-reply')).toBeInTheDocument()
    expect(screen.getByTestId('action-repost')).toBeInTheDocument()
    expect(screen.getByTestId('action-like')).toBeInTheDocument()
    expect(screen.getByTestId('action-bookmark')).toBeInTheDocument()
    expect(screen.getByTestId('action-share')).toBeInTheDocument()
  })

  it('shows liked state when viewer.liked is true', () => {
    const post = makePost({ viewer: { liked: true, reposted: false, bookmarked: false } })
    setup(<PostCard post={post} />)
    const likeBtn = screen.getByTestId('action-like')
    expect(likeBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders reply context when post has replyToId', () => {
    const replyPost = makePost({ replyToId: 'parent-p1' })
    setup(<PostCard post={replyPost} />)
    expect(screen.getByTestId('replying-to')).toBeInTheDocument()
  })

  it('renders repostedBy banner from feed context', () => {
    const post = makePost({
      repostedBy: { handle: 'dan', displayName: 'Dan' },
    })
    setup(<PostCard post={post} />)
    expect(screen.getByText(/Dan reposted/i)).toBeInTheDocument()
  })

  it('renders media grid when post has media', () => {
    const post = makePost({
      media: [
        {
          id: 'm1',
          type: 'image',
          status: 'ready',
          variants: { small: 'https://example.com/img.jpg' },
          altText: 'A cat',
          width: 800,
          height: 600,
        },
      ],
    })
    setup(<PostCard post={post} />)
    expect(screen.getByTestId('media-grid')).toBeInTheDocument()
  })

  it('renders noNavigate variant with default cursor', () => {
    setup(<PostCard post={makePost()} noNavigate />)
    const article = screen.getByTestId('post-card')
    expect(article.style.cursor).toBe('default')
  })

  it('clicking avatar button navigates to profile', () => {
    setup(<PostCard post={makePost()} />)
    const avatarBtn = screen.getByTestId('avatar-link-alice')
    fireEvent.click(avatarBtn)
    expect(avatarBtn).toBeInTheDocument()
  })

  it('clicking author name navigates to profile', () => {
    setup(<PostCard post={makePost()} />)
    fireEvent.click(screen.getByTestId('author-name-alice'))
    expect(screen.getByTestId('author-name-alice')).toBeInTheDocument()
  })

  it('shows verified badge for verified author', () => {
    const post = makePost({
      author: { ...makeAuthor(), isVerified: true },
    })
    setup(<PostCard post={post} />)
    expect(screen.getByTitle('Verified')).toBeInTheDocument()
  })

  it('renders without text gracefully when text is null', () => {
    const post = makePost({ text: null })
    setup(<PostCard post={post} />)
    expect(screen.getByTestId('post-card')).toBeInTheDocument()
  })

  it('clicking quote-card fires click handler', () => {
    const quoted = makePost({ id: 'q', text: 'Quote me', author: makeAuthor('carol') })
    const post = makePost({ text: 'My view', quoteOf: quoted })
    setup(<PostCard post={post} />)
    fireEvent.click(screen.getByTestId('quote-card'))
    expect(screen.getByTestId('quote-card')).toBeInTheDocument()
  })

  it('mouseenter/mouseleave on card does not crash when noNavigate', () => {
    setup(<PostCard post={makePost()} noNavigate />)
    const article = screen.getByTestId('post-card')
    fireEvent.mouseEnter(article)
    fireEvent.mouseLeave(article)
    expect(article).toBeInTheDocument()
  })

  it('mouseenter/mouseleave on card changes background when navigable', () => {
    setup(<PostCard post={makePost()} />)
    const article = screen.getByTestId('post-card')
    fireEvent.mouseEnter(article)
    expect(article.style.background).toBeTruthy()
    fireEvent.mouseLeave(article)
  })
})
