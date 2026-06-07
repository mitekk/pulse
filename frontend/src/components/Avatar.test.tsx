// ============================================================
// Avatar tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('renders initials when no src', () => {
    render(<Avatar src={null} displayName="Alice" handle="alice" size="md" />)
    const el = screen.getByTestId('avatar-alice')
    expect(el).toBeInTheDocument()
    expect(el.textContent).toContain('A')
  })

  it('renders image when src is provided', () => {
    render(<Avatar src="https://example.com/avatar.jpg" displayName="Bob" handle="bob" size="md" />)
    const img = screen.getByRole('img', { name: 'Bob' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('renders verified badge for verified users (md+)', () => {
    render(<Avatar src={null} displayName="Alice" handle="alice" size="md" isVerified={true} />)
    expect(screen.getByLabelText('Verified')).toBeInTheDocument()
  })

  it('does not render verified badge for xs size', () => {
    render(<Avatar src={null} displayName="Alice" handle="alice" size="xs" isVerified={true} />)
    expect(screen.queryByLabelText('Verified')).not.toBeInTheDocument()
  })

  it('renders all size variants without error', () => {
    const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const
    for (const size of sizes) {
      const { unmount } = render(<Avatar src={null} displayName="Test" size={size} />)
      unmount()
    }
  })
})
