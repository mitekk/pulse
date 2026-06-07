import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="Helpful tip">
        <button data-testid="target">Hover me</button>
      </Tooltip>,
    )
    expect(screen.getByTestId('target')).toBeInTheDocument()
  })

  it('tooltip element is present in the DOM (always rendered for a11y)', () => {
    render(
      <Tooltip content="Tooltip text" data-testid="tip">
        <button>Trigger</button>
      </Tooltip>,
    )
    // The tooltip span is always in the DOM; aria-hidden=true when not visible
    expect(screen.getByRole('tooltip', { hidden: true })).toBeInTheDocument()
  })

  it('tooltip is hidden (aria-hidden=true) by default', () => {
    render(
      <Tooltip content="Hidden tip">
        <button>Trigger</button>
      </Tooltip>,
    )
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('aria-hidden', 'true')
  })

  it('tooltip content matches prop', () => {
    render(
      <Tooltip content="My tooltip content">
        <button>Trigger</button>
      </Tooltip>,
    )
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('My tooltip content')
  })

  it('shows tooltip (aria-hidden=false) after mouseenter + delay elapses', () => {
    vi.useFakeTimers()
    const { container } = render(
      <Tooltip content="Delay tip" delay={200}>
        <button>Hover me</button>
      </Tooltip>,
    )

    const wrap = container.querySelector('.pulse-tooltip-wrap') as HTMLElement

    // fireEvent triggers React synthetic events
    act(() => { fireEvent.mouseEnter(wrap) })

    // Before delay: still hidden
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('aria-hidden', 'true')

    act(() => { vi.advanceTimersByTime(250) })

    // After delay: visible
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('aria-hidden', 'false')

    vi.useRealTimers()
  })

  it('hides tooltip after mouseleave', () => {
    vi.useFakeTimers()
    const { container } = render(
      <Tooltip content="Leave tip" delay={0}>
        <button>Hover me</button>
      </Tooltip>,
    )

    const wrap = container.querySelector('.pulse-tooltip-wrap') as HTMLElement

    act(() => { fireEvent.mouseEnter(wrap) })
    act(() => { vi.advanceTimersByTime(10) })

    // Tooltip visible
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('aria-hidden', 'false')

    act(() => { fireEvent.mouseLeave(wrap) })

    // Tooltip hidden again
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveAttribute('aria-hidden', 'true')

    vi.useRealTimers()
  })
})
