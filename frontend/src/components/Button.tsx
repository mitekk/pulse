// ============================================================
// Button — primary design system button
//
// Variants: primary | secondary | ghost | danger
// Sizes:    sm | md | lg
// States:   loading (shows spinner + disables), disabled
// ============================================================

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  'data-testid'?: string
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-accent)',
    color: 'var(--color-accent-contrast)',
    border: 'none',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text-muted)',
    border: 'none',
  },
  danger: {
    background: 'transparent',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
  },
}

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: '0.375rem 0.875rem',
    fontSize: 'var(--text-xs)',
    height: '30px',
  },
  md: {
    padding: '0.625rem 1.25rem',
    fontSize: 'var(--text-sm)',
    height: '38px',
  },
  lg: {
    padding: '0.75rem 1.75rem',
    fontSize: 'var(--text-base)',
    height: '46px',
  },
}

function Spinner({ size }: { size: ButtonSize }) {
  const dim = size === 'sm' ? 14 : size === 'md' ? 16 : 18
  return (
    <svg
      aria-hidden="true"
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        animation: 'btn-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="31.4"
        strokeDashoffset="10"
        opacity="0.3"
      />
      <path
        d="M12 2a10 10 0 0110 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    children,
    style,
    'data-testid': testId,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading

  return (
    <>
      <style>{`
        @keyframes btn-spin {
          to { transform: rotate(360deg); }
        }
        .pulse-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border-radius: var(--radius-full);
          font-family: var(--font-body);
          font-weight: var(--font-weight-semibold);
          cursor: pointer;
          transition: opacity var(--duration-fast) var(--ease-standard),
                      background var(--duration-fast) var(--ease-standard),
                      color var(--duration-fast) var(--ease-standard),
                      border-color var(--duration-fast) var(--ease-standard);
          white-space: nowrap;
          user-select: none;
          text-decoration: none;
          line-height: 1;
        }
        .pulse-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          pointer-events: none;
        }
        .pulse-btn:not(:disabled):hover.variant-primary {
          background: var(--color-accent-hover);
        }
        .pulse-btn:not(:disabled):hover.variant-secondary {
          background: var(--color-surface-raised);
        }
        .pulse-btn:not(:disabled):hover.variant-ghost {
          background: var(--color-surface-raised);
          color: var(--color-text);
        }
        .pulse-btn:not(:disabled):hover.variant-danger {
          background: color-mix(in srgb, var(--color-danger) 10%, transparent);
        }
      `}</style>
      <button
        ref={ref}
        data-testid={testId}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        className={`pulse-btn variant-${variant}`}
        style={{
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          width: fullWidth ? '100%' : undefined,
          ...style,
        }}
        {...rest}
      >
        {loading ? <Spinner size={size} /> : leftIcon}
        {children && <span>{children}</span>}
        {!loading && rightIcon}
      </button>
    </>
  )
})
