// ============================================================
// Password strength meter — visual indicator for registration
// ============================================================

interface PasswordStrengthMeterProps {
  password: string
}

type Strength = 0 | 1 | 2 | 3 | 4

function computeStrength(password: string): Strength {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return Math.min(4, score) as Strength
}

const LABELS: Record<Strength, string> = {
  0: '',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
}

const COLORS: Record<Strength, string> = {
  0: 'transparent',
  1: 'var(--color-danger)',
  2: 'var(--color-warning)',
  3: '#a0c040',
  4: 'var(--color-success)',
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = computeStrength(password)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <div data-testid="strength-bars" style={{ display: 'flex', gap: '4px' }}>
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            data-testid={`strength-bar-${level}`}
            style={{
              flex: 1,
              height: '3px',
              borderRadius: '2px',
              background:
                strength >= level ? COLORS[strength] : 'var(--color-border)',
              transition: 'background 0.25s ease',
            }}
          />
        ))}
      </div>
      {password && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: COLORS[strength],
            fontFamily: 'var(--font-mono)',
            transition: 'color 0.25s ease',
          }}
        >
          {LABELS[strength]}
        </span>
      )}
    </div>
  )
}
