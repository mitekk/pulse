// ============================================================
// TextInput / TextArea — design-system form inputs
//
// - Consistent focus ring (via :focus-visible global in tokens.css)
// - Optional character counter
// - Error state
// - Start/end adornments (icon prefix, etc.)
// - Labeled via htmlFor/id pattern
// ============================================================

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react'

// ── Base input styles ──────────────────────────────────────────

const BASE_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.875rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-normal)',
  outline: 'none',
  transition: 'border-color var(--duration-fast) var(--ease-standard)',
  boxSizing: 'border-box',
}

// ── CharCounter ────────────────────────────────────────────────

interface CharCounterProps {
  current: number
  max: number
}

function CharCounter({ current, max }: CharCounterProps) {
  const remaining = max - current
  const isNear = remaining <= 10
  const isOver = remaining < 0

  return (
    <span
      aria-live="polite"
      role="status"
      style={{
        fontSize: 'var(--text-xs)',
        color: isOver
          ? 'var(--color-danger)'
          : isNear
            ? 'var(--color-warning)'
            : 'var(--color-text-dimmed)',
        flexShrink: 0,
      }}
    >
      {remaining}
    </span>
  )
}

// ── FieldError ─────────────────────────────────────────────────

interface FieldErrorProps {
  message?: string
  id?: string
}

export function FieldError({ message, id }: FieldErrorProps) {
  if (!message) return null
  return (
    <span
      id={id}
      role="alert"
      style={{
        display: 'block',
        fontSize: 'var(--text-xs)',
        color: 'var(--color-danger)',
        marginTop: '0.25rem',
      }}
    >
      {message}
    </span>
  )
}

// ── FieldLabel ─────────────────────────────────────────────────

export function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-weight-medium)',
        color: 'var(--color-text-muted)',
        marginBottom: '0.375rem',
      }}
    >
      {children}
      {required && (
        <span aria-hidden="true" style={{ color: 'var(--color-danger)', marginLeft: '2px' }}>
          *
        </span>
      )}
    </label>
  )
}

// ── TextInput ──────────────────────────────────────────────────

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  maxLength?: number
  showCounter?: boolean
  startAdornment?: React.ReactNode
  endAdornment?: React.ReactNode
  containerStyle?: React.CSSProperties
  'data-testid'?: string
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    label,
    error,
    hint,
    maxLength,
    showCounter = false,
    startAdornment,
    endAdornment,
    containerStyle,
    id: providedId,
    value,
    style,
    'data-testid': testId,
    ...rest
  },
  ref,
) {
  const autoId = useId()
  const id = providedId ?? autoId
  const errorId = `${id}-error`
  const currentLength = typeof value === 'string' ? value.length : 0
  const hasError = !!error

  return (
    <div style={containerStyle}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}

      <div style={{ position: 'relative' }}>
        {startAdornment && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            {startAdornment}
          </div>
        )}

        <input
          ref={ref}
          id={id}
          data-testid={testId}
          value={value}
          maxLength={maxLength}
          aria-invalid={hasError}
          aria-describedby={error ? errorId : undefined}
          style={{
            ...BASE_INPUT_STYLE,
            borderColor: hasError ? 'var(--color-danger)' : 'var(--color-border)',
            paddingLeft: startAdornment ? '2.25rem' : undefined,
            paddingRight: endAdornment ? '2.25rem' : undefined,
            ...style,
          }}
          onFocus={(e) => {
            if (!hasError) e.currentTarget.style.borderColor = 'var(--color-accent)'
            rest.onFocus?.(e)
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = hasError
              ? 'var(--color-danger)'
              : 'var(--color-border)'
            rest.onBlur?.(e)
          }}
          {...rest}
        />

        {endAdornment && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            {endAdornment}
          </div>
        )}
      </div>

      {(showCounter && maxLength) || hint || error ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}
        >
          <div>
            {hint && !error && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dimmed)' }}>
                {hint}
              </span>
            )}
            <FieldError message={error} id={errorId} />
          </div>
          {showCounter && maxLength && (
            <CharCounter current={currentLength} max={maxLength} />
          )}
        </div>
      ) : null}
    </div>
  )
})

// ── TextArea ───────────────────────────────────────────────────

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  maxLength?: number
  showCounter?: boolean
  containerStyle?: React.CSSProperties
  'data-testid'?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  {
    label,
    error,
    hint,
    maxLength,
    showCounter = false,
    containerStyle,
    id: providedId,
    value,
    rows = 3,
    style,
    'data-testid': testId,
    ...rest
  },
  ref,
) {
  const autoId = useId()
  const id = providedId ?? autoId
  const errorId = `${id}-error`
  const currentLength = typeof value === 'string' ? value.length : 0
  const hasError = !!error

  return (
    <div style={containerStyle}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}

      <textarea
        ref={ref}
        id={id}
        data-testid={testId}
        value={value}
        maxLength={maxLength}
        rows={rows}
        aria-invalid={hasError}
        aria-describedby={error ? errorId : undefined}
        style={{
          ...BASE_INPUT_STYLE,
          resize: 'vertical',
          minHeight: `${rows * 1.5 + 1.25}rem`,
          borderColor: hasError ? 'var(--color-danger)' : 'var(--color-border)',
          ...style,
        }}
        onFocus={(e) => {
          if (!hasError) e.currentTarget.style.borderColor = 'var(--color-accent)'
          rest.onFocus?.(e)
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = hasError
            ? 'var(--color-danger)'
            : 'var(--color-border)'
          rest.onBlur?.(e)
        }}
        {...rest}
      />

      {(showCounter && maxLength) || hint || error ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}
        >
          <div>
            {hint && !error && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dimmed)' }}>
                {hint}
              </span>
            )}
            <FieldError message={error} id={errorId} />
          </div>
          {showCounter && maxLength && (
            <CharCounter current={currentLength} max={maxLength} />
          )}
        </div>
      ) : null}
    </div>
  )
})
