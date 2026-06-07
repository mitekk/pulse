// ============================================================
// PhotoPage (Lightbox) tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PhotoPage from './PhotoPage'
import type { PostDto, PostEntities } from '@/types/api'

// ── Mocks ──────────────────────────────────────────────────

const mockGetById = vi.fn()

vi.mock('@/lib/api/posts', () => ({
  postsApi: {
    getById: (...args: unknown[]) => mockGetById(...args),
  },
}))

// ── Helpers ────────────────────────────────────────────────

const emptyEntities: PostEntities = { mentions: [], hashtags: [], urls: [] }

function makePost(mediaCount = 2): PostDto {
  const media = Array.from({ length: mediaCount }, (_, i) => ({
    id: `m${i}`,
    type: 'image' as const,
    variants: {
      large: `https://cdn.example.com/large-${i}.jpg`,
      thumb: `https://cdn.example.com/thumb-${i}.jpg`,
    },
    altText: `Photo ${i + 1} alt text`,
    width: 1200,
    height: 675,
  }))

  return {
    id: 'p1',
    author: {
      id: 'u1',
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: false,
    },
    text: 'Post with photos',
    createdAt: new Date().toISOString(),
    entities: emptyEntities,
    media,
    counts: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
    viewer: null,
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
  }
}

function renderLightbox(idx = '1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/@alice/status/p1/photo/${idx}`]}>
        <Routes>
          <Route path="/:handle/status/:postId/photo/:idx" element={<PhotoPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ──────────────────────────────────────────────────

describe('PhotoPage (Lightbox)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading indicator while fetching', () => {
    mockGetById.mockReturnValue(new Promise(() => {}))
    renderLightbox()
    expect(screen.getByTestId('lightbox-loading')).toBeInTheDocument()
  })

  it('renders the lightbox overlay', async () => {
    mockGetById.mockResolvedValue({ post: makePost() })
    renderLightbox()
    await waitFor(() => expect(screen.getByTestId('lightbox')).toBeInTheDocument())
  })

  it('renders the image with alt text', async () => {
    mockGetById.mockResolvedValue({ post: makePost() })
    renderLightbox('1')
    await waitFor(() => expect(screen.getByTestId('lightbox-image')).toBeInTheDocument())
    expect(screen.getByAltText('Photo 1 alt text')).toBeInTheDocument()
  })

  it('shows alt text display element', async () => {
    mockGetById.mockResolvedValue({ post: makePost() })
    renderLightbox('1')
    await waitFor(() => expect(screen.getByTestId('lightbox-alt-text')).toBeInTheDocument())
    expect(screen.getByTestId('lightbox-alt-text')).toHaveTextContent('Photo 1 alt text')
  })

  it('shows counter for multi-photo posts', async () => {
    mockGetById.mockResolvedValue({ post: makePost(3) })
    renderLightbox('1')
    await waitFor(() => expect(screen.getByTestId('lightbox-counter')).toBeInTheDocument())
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('1 / 3')
  })

  it('shows prev/next buttons on middle photo', async () => {
    mockGetById.mockResolvedValue({ post: makePost(3) })
    renderLightbox('2')
    await waitFor(() => expect(screen.getByTestId('lightbox-image')).toBeInTheDocument())
    expect(screen.getByTestId('lightbox-prev')).toBeInTheDocument()
    expect(screen.getByTestId('lightbox-next')).toBeInTheDocument()
  })

  it('does not show prev button on first photo', async () => {
    mockGetById.mockResolvedValue({ post: makePost(2) })
    renderLightbox('1')
    await waitFor(() => expect(screen.getByTestId('lightbox-image')).toBeInTheDocument())
    expect(screen.queryByTestId('lightbox-prev')).not.toBeInTheDocument()
    expect(screen.getByTestId('lightbox-next')).toBeInTheDocument()
  })

  it('does not show next button on last photo', async () => {
    mockGetById.mockResolvedValue({ post: makePost(2) })
    renderLightbox('2')
    await waitFor(() => expect(screen.getByTestId('lightbox-image')).toBeInTheDocument())
    expect(screen.getByTestId('lightbox-prev')).toBeInTheDocument()
    expect(screen.queryByTestId('lightbox-next')).not.toBeInTheDocument()
  })

  it('navigates to next photo on ArrowRight keydown', async () => {
    mockGetById.mockResolvedValue({ post: makePost(3) })
    renderLightbox('1')
    await waitFor(() =>
      expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('1 / 3'),
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() =>
      expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('2 / 3'),
    )
  })

  it('navigates to prev photo on ArrowLeft keydown', async () => {
    mockGetById.mockResolvedValue({ post: makePost(3) })
    renderLightbox('2')
    await waitFor(() =>
      expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('2 / 3'),
    )

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() =>
      expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('1 / 3'),
    )
  })

  it('shows dot indicators', async () => {
    mockGetById.mockResolvedValue({ post: makePost(3) })
    renderLightbox('1')
    await waitFor(() => expect(screen.getByTestId('lightbox-dots')).toBeInTheDocument())
    expect(screen.getAllByTestId(/lightbox-dot-/)).toHaveLength(3)
  })

  it('renders close button', async () => {
    mockGetById.mockResolvedValue({ post: makePost() })
    renderLightbox()
    await waitFor(() => expect(screen.getByTestId('lightbox-close')).toBeInTheDocument())
  })
})
