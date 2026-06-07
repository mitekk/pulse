// ============================================================
// Skeleton tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton, PostCardSkeleton } from './Skeleton'

describe('Skeleton', () => {
  it('renders a hidden placeholder', () => {
    render(<Skeleton />)
    const el = document.querySelector('[aria-hidden="true"]')
    expect(el).toBeInTheDocument()
  })

  it('applies custom width and height', () => {
    render(<Skeleton width={100} height={20} />)
    const el = document.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(el.style.width).toBe('100px')
    expect(el.style.height).toBe('20px')
  })
})

describe('PostCardSkeleton', () => {
  it('renders a loading article', () => {
    render(<PostCardSkeleton />)
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Loading post')).toBeInTheDocument()
  })
})
