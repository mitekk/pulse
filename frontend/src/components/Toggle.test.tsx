import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle, ToggleField } from './Toggle'

describe('Toggle', () => {
  it('renders with role=switch', () => {
    render(<Toggle checked={false} onChange={() => undefined} aria-label="Toggle feature" />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('reflects checked=false in aria-checked', () => {
    render(<Toggle checked={false} onChange={() => undefined} aria-label="Toggle" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('reflects checked=true in aria-checked', () => {
    render(<Toggle checked={true} onChange={() => undefined} aria-label="Toggle" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onChange with opposite value when clicked (false→true)', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} aria-label="Toggle" data-testid="sw" />)
    await userEvent.click(screen.getByTestId('sw'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with opposite value when clicked (true→false)', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={true} onChange={onChange} aria-label="Toggle" data-testid="sw" />)
    await userEvent.click(screen.getByTestId('sw'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not fire onChange when disabled', async () => {
    const onChange = vi.fn()
    render(
      <Toggle checked={false} onChange={onChange} aria-label="Toggle" disabled data-testid="sw" />,
    )
    await userEvent.click(screen.getByTestId('sw'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('is keyboard accessible via Space', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} aria-label="Toggle" data-testid="sw" />)
    screen.getByTestId('sw').focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('ToggleField', () => {
  it('renders label', () => {
    render(
      <ToggleField
        label="Protected account"
        checked={false}
        onChange={() => undefined}
      />,
    )
    expect(screen.getByText('Protected account')).toBeInTheDocument()
  })

  it('renders description', () => {
    render(
      <ToggleField
        label="Protected"
        description="Only followers can see posts"
        checked={false}
        onChange={() => undefined}
      />,
    )
    expect(screen.getByText('Only followers can see posts')).toBeInTheDocument()
  })

  it('label click fires toggle', async () => {
    const onChange = vi.fn()
    render(
      <ToggleField
        id="test-toggle"
        label="Toggle me"
        checked={false}
        onChange={onChange}
      />,
    )
    // Click the label — browser clicks the associated toggle
    await userEvent.click(screen.getByText('Toggle me'))
    expect(onChange).toHaveBeenCalled()
  })
})
