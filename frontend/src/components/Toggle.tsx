// ============================================================
// Toggle / Switch — accessible toggle primitive
//
// Uses role="switch" + aria-checked per ARIA spec
// Requires a visible label (use labelId or aria-label)
// ============================================================


export interface ToggleProps {
  /** Controlled checked state */
  checked: boolean
  /** Change handler */
  onChange: (checked: boolean) => void
  /** Accessible label text */
  'aria-label'?: string
  /** ID of labelling element */
  'aria-labelledby'?: string
  disabled?: boolean
  'data-testid'?: string
  size?: 'sm' | 'md'
  id?: string
}

export function Toggle({
  checked,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  disabled = false,
  'data-testid': testId,
  size = 'md',
  id,
}: ToggleProps) {
  const width = size === 'sm' ? 32 : 40
  const height = size === 'sm' ? 18 : 22
  const knob = size === 'sm' ? 14 : 18
  const travel = width - height  // how far the knob moves

  return (
    <>
      <style>{`
        .pulse-toggle {
          position: relative;
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .pulse-toggle:focus-visible {
          outline: none;
          box-shadow: var(--shadow-focus);
          border-radius: var(--radius-full);
        }
        .pulse-toggle-track {
          transition: background var(--duration-base) var(--ease-standard);
          border-radius: var(--radius-full);
        }
        .pulse-toggle-knob {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          border-radius: var(--radius-full);
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          transition: left var(--duration-base) var(--ease-spring);
        }
        @media (prefers-reduced-motion: reduce) {
          .pulse-toggle-knob,
          .pulse-toggle-track {
            transition: none;
          }
        }
      `}</style>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        data-testid={testId}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="pulse-toggle"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: 'none',
          border: 'none',
          padding: 0,
        }}
        type="button"
      >
        <span
          className="pulse-toggle-track"
          style={{
            width: '100%',
            height: '100%',
            background: checked ? 'var(--color-accent)' : 'var(--color-surface-overlay)',
            border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-full)',
            display: 'block',
          }}
        />
        <span
          className="pulse-toggle-knob"
          style={{
            width: `${knob}px`,
            height: `${knob}px`,
            left: checked ? `${travel - 2}px` : '2px',
          }}
        />
      </button>
    </>
  )
}

// ── ToggleField — labeled toggle row ─────────────────────────

interface ToggleFieldProps extends ToggleProps {
  label: string
  description?: string
}

export function ToggleField({
  label,
  description,
  checked,
  onChange,
  disabled,
  'data-testid': testId,
  size,
  id,
}: ToggleFieldProps) {
  const fieldId = id ?? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <div>
        <label
          htmlFor={fieldId}
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text)',
            display: 'block',
            cursor: 'pointer',
          }}
        >
          {label}
        </label>
        {description && (
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              margin: '0.25rem 0 0',
            }}
          >
            {description}
          </p>
        )}
      </div>
      <Toggle
        id={fieldId}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        data-testid={testId}
        size={size}
        aria-label={label}
      />
    </div>
  )
}

// Re-export for backward compat name
export { Toggle as Switch }
