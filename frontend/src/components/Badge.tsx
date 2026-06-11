// ============================================================
// Badge / Counter — small status pill
//
// Variants: default | success | danger | warning | accent
// ============================================================

export type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'accent'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  /** Compact dot-only mode — renders just the dot, aria-label required */
  dot?: boolean
  'aria-label'?: string
  'data-testid'?: string
}

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; color: string }> = {
  default: {
    bg: 'var(--color-surface-overlay)',
    color: 'var(--color-text-muted)',
  },
  success: {
    bg: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
    color: 'var(--color-success)',
  },
  danger: {
    bg: 'color-mix(in srgb, var(--color-danger) 15%, transparent)',
    color: 'var(--color-danger)',
  },
  warning: {
    bg: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
    color: 'var(--color-warning)',
  },
  accent: {
    bg: 'var(--color-accent-strong)',
    color: 'var(--color-accent-contrast)',
  },
}

export function Badge({
  children,
  variant = 'default',
  dot = false,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: BadgeProps) {
  const { bg, color } = VARIANT_COLORS[variant]

  if (dot) {
    return (
      <span
        data-testid={testId}
        aria-label={ariaLabel}
        role={ariaLabel ? 'status' : undefined}
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: 'var(--radius-full)',
          background: color,
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <span
      data-testid={testId}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 6px',
        borderRadius: 'var(--radius-full)',
        background: bg,
        color,
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        lineHeight: 1.4,
        minWidth: '18px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// ── Counter — numeric badge that caps at 99+ ──────────────────

interface CounterProps {
  count: number
  max?: number
  variant?: BadgeVariant
  'data-testid'?: string
}

export function Counter({ count, max = 99, variant = 'accent', 'data-testid': testId }: CounterProps) {
  if (count <= 0) return null
  const display = count > max ? `${max}+` : count
  return (
    <Badge variant={variant} data-testid={testId} aria-label={`${count} unread`}>
      {display}
    </Badge>
  )
}
