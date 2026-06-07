// ============================================================
// Skeleton — loading placeholder shapes
// ============================================================

import type { CSSProperties } from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  radius?: string
  style?: CSSProperties
  className?: string
}

const shimmerKeyframes = `
@keyframes skeleton-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`

let injected = false
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return
  injected = true
  const style = document.createElement('style')
  style.textContent = shimmerKeyframes
  document.head.appendChild(style)
}

export function Skeleton({ width, height = '1em', radius = 'var(--radius-md)', style }: SkeletonProps) {
  injectKeyframes()

  return (
    <div
      aria-hidden="true"
      style={{
        width: typeof width === 'number' ? `${width}px` : width ?? '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, var(--color-surface) 0%, var(--color-surface-raised) 40%, var(--color-surface) 80%)',
        backgroundSize: '800px 100%',
        animation: 'skeleton-shimmer 1.4s infinite linear',
        display: 'block',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

// ── PostCard skeleton ──────────────────────────────────────
export function PostCardSkeleton() {
  return (
    <article
      aria-busy="true"
      aria-label="Loading post"
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* Avatar */}
      <Skeleton width={40} height={40} radius="var(--radius-full)" style={{ flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {/* Author line */}
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Skeleton width={100} height={14} />
          <Skeleton width={70} height={12} />
        </div>
        {/* Text body */}
        <Skeleton width="92%" height={14} />
        <Skeleton width="78%" height={14} />
        <Skeleton width="60%" height={14} />
        {/* Action bar */}
        <div style={{ display: 'flex', gap: 'var(--space-8)', marginTop: 'var(--space-2)' }}>
          <Skeleton width={40} height={20} />
          <Skeleton width={40} height={20} />
          <Skeleton width={40} height={20} />
          <Skeleton width={40} height={20} />
        </div>
      </div>
    </article>
  )
}
