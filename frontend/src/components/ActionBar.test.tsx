// ============================================================
// ActionBar tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ActionBar } from './ActionBar'
import type { PostDto, PostEntities } from '@/types/api'

const emptyEntities: PostEntities = { mentions: [], hashtags: [], urls: [] }

function makePost(overrides: Partial<PostDto> = {}): PostDto {
  return {
    id: 'p1',
    author: { id: 'u1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false },
    text: 'Test',
    createdAt: new Date().toISOString(),
    entities: emptyEntities,
    media: [],
    counts: { replies: 3, reposts: 2, likes: 10, bookmarks: 1 },
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
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ActionBar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders all action buttons', () => {
    setup(<ActionBar post={makePost()} />)
    expect(screen.getByTestId('action-reply')).toBeInTheDocument()
    expect(screen.getByTestId('action-repost')).toBeInTheDocument()
    expect(screen.getByTestId('action-like')).toBeInTheDocument()
    expect(screen.getByTestId('action-bookmark')).toBeInTheDocument()
    expect(screen.getByTestId('action-share')).toBeInTheDocument()
  })

  it('calls onLike when like button clicked and not liked', () => {
    const onLike = vi.fn()
    setup(<ActionBar post={makePost()} onLike={onLike} />)
    fireEvent.click(screen.getByTestId('action-like'))
    expect(onLike).toHaveBeenCalledOnce()
  })

  it('calls onUnlike when like button clicked and already liked', () => {
    const onUnlike = vi.fn()
    const post = makePost({ viewer: { liked: true, reposted: false, bookmarked: false } })
    setup(<ActionBar post={post} onUnlike={onUnlike} />)
    fireEvent.click(screen.getByTestId('action-like'))
    expect(onUnlike).toHaveBeenCalledOnce()
  })

  it('shows like button as pressed when viewer.liked is true', () => {
    const post = makePost({ viewer: { liked: true, reposted: false, bookmarked: false } })
    setup(<ActionBar post={post} />)
    expect(screen.getByTestId('action-like')).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onBookmark when bookmark button clicked and not bookmarked', () => {
    const onBookmark = vi.fn()
    setup(<ActionBar post={makePost()} onBookmark={onBookmark} />)
    fireEvent.click(screen.getByTestId('action-bookmark'))
    expect(onBookmark).toHaveBeenCalledOnce()
  })

  it('calls onUnbookmark when bookmark button clicked and bookmarked', () => {
    const onUnbookmark = vi.fn()
    const post = makePost({ viewer: { liked: false, reposted: false, bookmarked: true } })
    setup(<ActionBar post={post} onUnbookmark={onUnbookmark} />)
    fireEvent.click(screen.getByTestId('action-bookmark'))
    expect(onUnbookmark).toHaveBeenCalledOnce()
  })

  it('opens repost menu when repost button clicked', () => {
    setup(<ActionBar post={makePost()} />)
    fireEvent.click(screen.getByTestId('action-repost'))
    expect(screen.getByTestId('repost-menu')).toBeInTheDocument()
    expect(screen.getByTestId('repost-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('quote-post')).toBeInTheDocument()
  })

  it('calls onRepost when Repost menu item clicked and not reposted', () => {
    const onRepost = vi.fn()
    setup(<ActionBar post={makePost()} onRepost={onRepost} />)
    fireEvent.click(screen.getByTestId('action-repost'))
    fireEvent.click(screen.getByTestId('repost-toggle'))
    expect(onRepost).toHaveBeenCalledOnce()
  })

  it('calls onUnrepost when Repost toggle clicked and already reposted', () => {
    const onUnrepost = vi.fn()
    const post = makePost({ viewer: { liked: false, reposted: true, bookmarked: false } })
    setup(<ActionBar post={post} onUnrepost={onUnrepost} />)
    fireEvent.click(screen.getByTestId('action-repost'))
    fireEvent.click(screen.getByTestId('repost-toggle'))
    expect(onUnrepost).toHaveBeenCalledOnce()
  })

  it('calls onReply when reply button clicked', () => {
    const onReply = vi.fn()
    setup(<ActionBar post={makePost()} onReply={onReply} />)
    fireEvent.click(screen.getByTestId('action-reply'))
    expect(onReply).toHaveBeenCalledOnce()
  })

  it('shows counts > 0', () => {
    const post = makePost({ counts: { replies: 5, reposts: 3, likes: 12, bookmarks: 1 } })
    setup(<ActionBar post={post} />)
    expect(screen.getByTestId('action-reply').textContent).toContain('5')
    expect(screen.getByTestId('action-like').textContent).toContain('12')
  })
})
