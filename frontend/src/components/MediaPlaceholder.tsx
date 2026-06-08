// ============================================================
// Media placeholders — shown in place of an image/video when the
// underlying object isn't renderable:
//   • MediaProcessing  — status pending|processing (still transcoding)
//   • MediaUnavailable — status failed, OR a ready object that 404s
//     (deleted/lost/reaped) caught via <img onError>
//
// Both fill their grid slot and carry a data-testid for e2e assertions.
// ============================================================

import type { CSSProperties } from 'react'

interface PlaceholderProps {
  /** Slot styles from the grid layout (aspect ratio, grid placement). */
  style?: CSSProperties
  /** Override the default test id (callers append an index). */
  testId?: string
  /** Smaller typography for compact thumbnail grids. */
  compact?: boolean
}

const baseStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  background: 'var(--color-surface)',
  color: 'var(--color-text-muted)',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
  textAlign: 'center',
  padding: '8px',
}

function ImageOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M21 15V5a2 2 0 0 0-2-2H7m-4 4v12a2 2 0 0 0 2 2h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

export function MediaProcessing({ style, testId, compact }: PlaceholderProps) {
  return (
    <div
      data-testid={testId ?? 'media-processing'}
      role="status"
      aria-label="Media is still processing"
      style={{ ...baseStyle, ...style }}
    >
      <div
        aria-hidden="true"
        style={{
          width: compact ? '18px' : '24px',
          height: compact ? '18px' : '24px',
          borderRadius: 'var(--radius-full)',
          border: '2px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          animation: 'media-spin 0.8s linear infinite',
        }}
      />
      {!compact && (
        <span style={{ fontSize: 'var(--text-xs)' }}>Processing…</span>
      )}
      <style>{`@keyframes media-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export function MediaUnavailable({ style, testId, compact }: PlaceholderProps) {
  return (
    <div
      data-testid={testId ?? 'media-unavailable'}
      role="img"
      aria-label="Media unavailable"
      style={{ ...baseStyle, ...style }}
    >
      <ImageOffIcon />
      {!compact && (
        <span style={{ fontSize: 'var(--text-xs)' }}>Media unavailable</span>
      )}
    </div>
  )
}
