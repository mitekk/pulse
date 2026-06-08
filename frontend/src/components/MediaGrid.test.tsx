// ============================================================
// MediaGrid tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MediaGrid } from './MediaGrid'
import type { PostMediaDto } from '@/types/api'

function makeImage(id: string): PostMediaDto {
  return {
    id,
    type: 'image',
    status: 'ready',
    variants: { thumb: `https://cdn.example.com/${id}-thumb.jpg`, small: `https://cdn.example.com/${id}.jpg` },
    altText: `Alt for ${id}`,
    width: 800,
    height: 600,
  }
}

function setup(media: PostMediaDto[]) {
  return render(
    <MemoryRouter>
      <MediaGrid media={media} postId="p1" authorHandle="alice" />
    </MemoryRouter>,
  )
}

describe('MediaGrid', () => {
  it('renders nothing when media array is empty', () => {
    const { container } = setup([])
    expect(container.firstChild).toBeNull()
  })

  it('renders single image with media-grid container', () => {
    setup([makeImage('m1')])
    expect(screen.getByTestId('media-grid')).toBeInTheDocument()
    expect(screen.getByTestId('media-item-0')).toBeInTheDocument()
  })

  it('renders 2 images in a 2-column layout', () => {
    setup([makeImage('m1'), makeImage('m2')])
    expect(screen.getByTestId('media-item-0')).toBeInTheDocument()
    expect(screen.getByTestId('media-item-1')).toBeInTheDocument()
  })

  it('renders only first 4 images when more provided', () => {
    const media = ['m1', 'm2', 'm3', 'm4', 'm5'].map(makeImage)
    setup(media)
    expect(screen.getByTestId('media-item-0')).toBeInTheDocument()
    expect(screen.getByTestId('media-item-3')).toBeInTheDocument()
    expect(screen.queryByTestId('media-item-4')).not.toBeInTheDocument()
  })

  it('renders images with loading=lazy and alt text', () => {
    setup([makeImage('m1')])
    const img = screen.getByRole('img', { name: 'Alt for m1' })
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('alt', 'Alt for m1')
  })

  it('renders GIF type with GIF badge', () => {
    const gif: PostMediaDto = {
      id: 'g1',
      type: 'gif',
      status: 'ready',
      variants: { mp4: 'https://cdn.example.com/g1.mp4', thumb: 'https://cdn.example.com/g1-thumb.jpg' },
      altText: null,
      width: 480,
      height: 270,
    }
    setup([gif])
    expect(screen.getByText('GIF')).toBeInTheDocument()
  })

  it('renders video type with video element', () => {
    const video: PostMediaDto = {
      id: 'v1',
      type: 'video',
      status: 'ready',
      variants: { mp4: 'https://cdn.example.com/v1.mp4', poster: 'https://cdn.example.com/v1-poster.jpg' },
      altText: 'My video',
      width: 1280,
      height: 720,
    }
    setup([video])
    expect(document.querySelector('video')).toBeInTheDocument()
  })

  // ── Status-aware placeholders ──────────────────────────────

  it('renders a processing placeholder while media is not ready', () => {
    const processing: PostMediaDto = { ...makeImage('m1'), status: 'processing' }
    setup([processing])
    expect(screen.getByTestId('media-item-0')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: /processing/i })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Alt for m1' })).not.toBeInTheDocument()
  })

  it('renders an unavailable placeholder for failed media', () => {
    const failed: PostMediaDto = { ...makeImage('m1'), status: 'failed' }
    setup([failed])
    const slot = screen.getByTestId('media-item-0')
    expect(slot).toHaveAttribute('aria-label', 'Media unavailable')
  })

  it('swaps a ready image to the unavailable placeholder when it fails to load', () => {
    setup([makeImage('m1')])
    const img = screen.getByRole('img', { name: 'Alt for m1' })
    fireEvent.error(img)
    expect(screen.getByTestId('media-item-0')).toHaveAttribute('aria-label', 'Media unavailable')
  })
})
