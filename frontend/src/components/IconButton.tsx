// ============================================================
// IconButton — square icon-only button with aria-label required
//
// Sizes: sm(28) | md(36) | lg(44)
// Variants: ghost | subtle | accent
// ============================================================

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type IconButtonVariant = 'ghost' | 'subtle' | 'accent'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label — required for icon-only buttons */
  'aria-label': string
  icon: ReactNode
  variant?: IconButtonVariant
  size?: IconButtonSize
  'data-testid'?: string
  round?: boolean
}

const SIZE_PX: Record<IconButtonSize, number> = {
  sm: 28,
  md: 36,
  lg: 44,
}

const VARIANT_STYLES: Record<IconButtonVariant, React.CSSProperties> = {
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-muted)',
    border: 'none',
  },
  subtle: {
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)',
  },
  accent: {
    background: 'var(--color-accent)',
    color: 'var(--color-accent-contrast)',
    border: 'none',
  },
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    'aria-label': ariaLabel,
    icon,
    variant = 'ghost',
    size = 'md',
    round = true,
    disabled,
    style,
    'data-testid': testId,
    ...rest
  },
  ref,
) {
  const dim = SIZE_PX[size]

  return (
    <button
      ref={ref}
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      aria-disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${dim}px`,
        height: `${dim}px`,
        flexShrink: 0,
        borderRadius: round ? 'var(--radius-full)' : 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition:
          'background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
        ...VARIANT_STYLES[variant],
        ...style,
      }}
      {...rest}
    >
      {icon}
    </button>
  )
})
