// ============================================================
// RichText tests — entity linkification using backend offsets
// ============================================================

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RichText } from './RichText'
import type { PostEntities } from '@/types/api'

const emptyEntities: PostEntities = {
  mentions: [],
  hashtags: [],
  urls: [],
}

function renderRich(text: string, entities: PostEntities) {
  return render(
    <MemoryRouter>
      <RichText text={text} entities={entities} />
    </MemoryRouter>,
  )
}

describe('RichText', () => {
  it('renders plain text with no entities', () => {
    renderRich('Hello world', emptyEntities)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders mention as link to profile route', () => {
    const text = 'hello @bob there'
    const entities: PostEntities = {
      mentions: [{ handle: 'bob', userId: 'u1', start: 6, end: 10 }],
      hashtags: [],
      urls: [],
    }
    renderRich(text, entities)
    const link = screen.getByTestId('mention-bob')
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/@bob')
    expect(link.textContent).toBe('@bob')
  })

  it('renders hashtag as link to search route', () => {
    const text = 'hello #world!'
    const entities: PostEntities = {
      mentions: [],
      hashtags: [{ tag: 'world', start: 6, end: 12 }],
      urls: [],
    }
    renderRich(text, entities)
    const link = screen.getByTestId('hashtag-world')
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toContain('/tag/')
    expect(link.getAttribute('href')).toContain('world')
    expect(link.textContent).toBe('#world')
  })

  it('renders external URL as anchor with displayUrl', () => {
    const text = 'check this https://example.com out'
    const entities: PostEntities = {
      mentions: [],
      hashtags: [],
      urls: [
        {
          url: 'https://example.com',
          displayUrl: 'example.com',
          start: 11,
          end: 30,
        },
      ],
    }
    renderRich(text, entities)
    // segment index 1 because there is a plain-text segment before the URL
    const link = screen.getByTestId('url-link-1')
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.textContent).toBe('example.com')
  })

  it('renders multiple entity types in order', () => {
    // "hey @alice #cool"
    //  0123456789012345
    const text = 'hey @alice #cool'
    const entities: PostEntities = {
      mentions: [{ handle: 'alice', userId: 'u1', start: 4, end: 10 }],
      hashtags: [{ tag: 'cool', start: 11, end: 16 }],
      urls: [],
    }
    renderRich(text, entities)
    expect(screen.getByTestId('mention-alice')).toBeInTheDocument()
    expect(screen.getByTestId('hashtag-cool')).toBeInTheDocument()
  })

  it('preserves plain text segments between entities', () => {
    const text = 'pre @bob mid #tag post'
    const entities: PostEntities = {
      mentions: [{ handle: 'bob', userId: 'u1', start: 4, end: 8 }],
      hashtags: [{ tag: 'tag', start: 13, end: 17 }],
      urls: [],
    }
    const { container } = renderRich(text, entities)
    expect(container.textContent).toContain('pre ')
    expect(container.textContent).toContain(' mid ')
    expect(container.textContent).toContain(' post')
  })
})
