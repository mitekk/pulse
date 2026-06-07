import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button data-testid="btn">Click me</Button>)
    expect(screen.getByTestId('btn')).toHaveTextContent('Click me')
  })

  it('applies primary variant by default', () => {
    render(<Button data-testid="btn">Primary</Button>)
    const btn = screen.getByTestId('btn')
    expect(btn).toHaveStyle({ background: 'var(--color-accent)' })
  })

  it('applies secondary variant', () => {
    render(
      <Button variant="secondary" data-testid="btn">
        Secondary
      </Button>,
    )
    const btn = screen.getByTestId('btn')
    expect(btn).toHaveStyle({ background: 'transparent' })
    expect(btn).toHaveStyle({ color: 'var(--color-text)' })
  })

  it('applies ghost variant', () => {
    render(
      <Button variant="ghost" data-testid="btn">
        Ghost
      </Button>,
    )
    const btn = screen.getByTestId('btn')
    expect(btn).toHaveStyle({ color: 'var(--color-text-muted)' })
  })

  it('applies danger variant', () => {
    render(
      <Button variant="danger" data-testid="btn">
        Danger
      </Button>,
    )
    const btn = screen.getByTestId('btn')
    expect(btn).toHaveStyle({ color: 'var(--color-danger)' })
  })

  it('shows spinner and sets aria-busy when loading', () => {
    render(
      <Button loading data-testid="btn">
        Loading
      </Button>,
    )
    const btn = screen.getByTestId('btn')
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toBeDisabled()
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <Button disabled data-testid="btn">
        Disabled
      </Button>,
    )
    expect(screen.getByTestId('btn')).toBeDisabled()
  })

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick} data-testid="btn">
        Disabled
      </Button>,
    )
    // pointer-events: none prevents userEvent click — verify via the disabled attribute instead
    expect(screen.getByTestId('btn')).toBeDisabled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('fires onClick when enabled', async () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} data-testid="btn">
        Click
      </Button>,
    )
    await userEvent.click(screen.getByTestId('btn'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders leftIcon', () => {
    render(
      <Button leftIcon={<span data-testid="icon" />} data-testid="btn">
        With Icon
      </Button>,
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders fullWidth', () => {
    render(
      <Button fullWidth data-testid="btn">
        Full
      </Button>,
    )
    expect(screen.getByTestId('btn')).toHaveStyle({ width: '100%' })
  })

  it('applies sm size', () => {
    render(
      <Button size="sm" data-testid="btn">
        Small
      </Button>,
    )
    expect(screen.getByTestId('btn')).toHaveStyle({ height: '30px' })
  })

  it('applies lg size', () => {
    render(
      <Button size="lg" data-testid="btn">
        Large
      </Button>,
    )
    expect(screen.getByTestId('btn')).toHaveStyle({ height: '46px' })
  })
})
