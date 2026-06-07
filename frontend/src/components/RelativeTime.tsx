// ============================================================
// RelativeTime — renders a human-readable relative timestamp
// Updates every 30s for recent times, then every minute
// ============================================================

import { useState, useEffect } from 'react'

interface RelativeTimeProps {
  date: string | Date
  className?: string
}

function formatRelative(date: Date): { short: string; full: string } {
  const now = Date.now()
  const diff = now - date.getTime()
  const abs = Math.abs(diff)

  const full = date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  })

  if (abs < 60_000) return { short: 'now', full }
  if (abs < 3_600_000) return { short: `${Math.floor(abs / 60_000)}m`, full }
  if (abs < 86_400_000) return { short: `${Math.floor(abs / 3_600_000)}h`, full }
  if (abs < 7 * 86_400_000) return { short: `${Math.floor(abs / 86_400_000)}d`, full }

  const shortDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
  return { short: shortDate, full }
}

export function RelativeTime({ date }: RelativeTimeProps) {
  const parsed = typeof date === 'string' ? new Date(date) : date
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  const { short, full } = formatRelative(parsed)

  return (
    <time
      dateTime={parsed.toISOString()}
      title={full}
      style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--color-text-muted)',
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {short}
    </time>
  )
}
