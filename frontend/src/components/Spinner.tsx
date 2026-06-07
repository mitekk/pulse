// ============================================================
// Spinner — accessible loading indicator
// ============================================================

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg'

interface SpinnerProps {
  size?: SpinnerSize
  label?: string
  color?: string
}

const SIZE_PX: Record<SpinnerSize, number> = {
  xs: 14,
  sm: 20,
  md: 28,
  lg: 40,
}

const STROKE: Record<SpinnerSize, number> = {
  xs: 2,
  sm: 2,
  md: 2.5,
  lg: 3,
}

export function Spinner({ size = 'md', label = 'Loading…', color }: SpinnerProps) {
  const dim = SIZE_PX[size]
  const sw = STROKE[size]

  return (
    <>
      <style>{`
        @keyframes pulse-spinner-spin {
          to { transform: rotate(360deg); }
        }
        .pulse-spinner {
          animation: pulse-spinner-spin 0.7s linear infinite;
          transform-origin: center;
        }
      `}</style>
      <svg
        className="pulse-spinner"
        role="status"
        aria-label={label}
        width={dim}
        height={dim}
        viewBox="0 0 24 24"
        fill="none"
        style={{ color: color ?? 'var(--color-accent)', display: 'block', flexShrink: 0 }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray="31.4"
          strokeDashoffset="10"
          opacity="0.25"
        />
        <path
          d="M12 2a10 10 0 0110 10"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
        />
      </svg>
    </>
  )
}
