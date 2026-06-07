// ============================================================
// Avatar — user profile picture with optional verified ring
// Sizes: xs(24) sm(32) md(40) lg(48) xl(72)
// ============================================================

import type { CSSProperties } from 'react'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  src: string | null | undefined
  displayName: string
  handle?: string
  size?: AvatarSize
  isVerified?: boolean
  className?: string
  style?: CSSProperties
}

const SIZE_PX: Record<AvatarSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 72,
}

const FONT_SIZE: Record<AvatarSize, string> = {
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  md: 'var(--text-base)',
  lg: 'var(--text-md)',
  xl: 'var(--text-xl)',
}

export function Avatar({
  src,
  displayName,
  handle,
  size = 'md',
  isVerified = false,
  style,
}: AvatarProps) {
  const px = SIZE_PX[size]
  const initial = displayName ? displayName.charAt(0).toUpperCase() : '?'

  return (
    <div
      data-testid={`avatar${handle ? `-${handle}` : ''}`}
      style={{
        position: 'relative',
        width: `${px}px`,
        height: `${px}px`,
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{
          width: `${px}px`,
          height: `${px}px`,
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          background: 'var(--color-surface-raised)',
          border: isVerified
            ? '2px solid var(--color-accent)'
            : '1.5px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: FONT_SIZE[size],
          fontWeight: 'var(--font-weight-semibold)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {src ? (
          <img
            src={src}
            alt={displayName}
            width={px}
            height={px}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          initial
        )}
      </div>

      {/* Verified badge — only for md+ */}
      {isVerified && size !== 'xs' && size !== 'sm' && (
        <div
          aria-label="Verified"
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: Math.round(px * 0.38) + 'px',
            height: Math.round(px * 0.38) + 'px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--color-bg)',
          }}
        >
          <svg
            width={Math.round(px * 0.22)}
            height={Math.round(px * 0.22)}
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2 6l2.5 2.5L10 3.5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  )
}
