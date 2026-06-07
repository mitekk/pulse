// ============================================================
// PasswordStrengthMeter component tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

describe('PasswordStrengthMeter', () => {
  it('renders four strength bars', () => {
    render(<PasswordStrengthMeter password="" />)
    expect(screen.getByTestId('strength-bars').children).toHaveLength(4)
  })

  it('shows "Weak" for a simple 8-char lowercase password', () => {
    // "password" = 8 chars, lowercase only → score 1 → Weak
    render(<PasswordStrengthMeter password="password" />)
    expect(screen.getByText('Weak')).toBeInTheDocument()
  })

  it('shows "Strong" for a complex password', () => {
    // Long, mixed case, digit, special → score 4 → Strong
    render(<PasswordStrengthMeter password="Tr0ub4dor&3!" />)
    expect(screen.getByText('Strong')).toBeInTheDocument()
  })

  it('shows no label text for empty password', () => {
    render(<PasswordStrengthMeter password="" />)
    // The bars container is present but no strength label visible
    expect(screen.queryByText('Weak')).not.toBeInTheDocument()
    expect(screen.queryByText('Strong')).not.toBeInTheDocument()
  })
})
