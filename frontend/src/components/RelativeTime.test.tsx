// ============================================================
// RelativeTime tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelativeTime } from './RelativeTime'

describe('RelativeTime', () => {
  it('renders "now" for very recent dates', () => {
    const recent = new Date(Date.now() - 5000).toISOString()
    render(<RelativeTime date={recent} />)
    expect(screen.getByRole('time')).toHaveTextContent('now')
  })

  it('renders minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    render(<RelativeTime date={fiveMinutesAgo} />)
    expect(screen.getByRole('time')).toHaveTextContent('5m')
  })

  it('renders hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    render(<RelativeTime date={twoHoursAgo} />)
    expect(screen.getByRole('time')).toHaveTextContent('2h')
  })

  it('renders days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
    render(<RelativeTime date={threeDaysAgo} />)
    expect(screen.getByRole('time')).toHaveTextContent('3d')
  })

  it('renders date string for old dates', () => {
    const longAgo = new Date('2024-01-15').toISOString()
    render(<RelativeTime date={longAgo} />)
    const el = screen.getByRole('time')
    // Should show a formatted date, not "Nm"
    expect(el.textContent).not.toMatch(/^\d+[mhd]$/)
  })

  it('sets datetime attribute to ISO string', () => {
    const date = new Date('2026-06-07T10:00:00Z')
    render(<RelativeTime date={date} />)
    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2026-06-07T10:00:00.000Z')
  })
})
