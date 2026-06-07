// ============================================================
// RegisterPage — email, handle (live-availability check), password, displayName
// Client validation mirrors spec §15 limits
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '@/lib/api/auth'
import { apiClient, ApiError } from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth/store'
import { PasswordStrengthMeter } from '@/components/PasswordStrengthMeter'
import type { UserCardDto } from '@/types/api'

// ── Validation schema ──────────────────────────────────────
const registerSchema = z.object({
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be 50 characters or fewer'),
  email: z.string().email('Please enter a valid email address'),
  handle: z
    .string()
    .min(1, 'Handle is required')
    .max(15, 'Handle must be 15 characters or fewer')
    .regex(/^[A-Za-z0-9_]+$/, 'Handle may only contain letters, numbers, and underscores')
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or fewer'),
})

type RegisterForm = z.infer<typeof registerSchema>

// ── Handle availability check ──────────────────────────────
type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error'

function useHandleAvailability(handle: string, isValidFormat: boolean) {
  const [status, setStatus] = useState<HandleStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!handle || !isValidFormat) {
      setStatus('idle')
      return
    }

    setStatus('checking')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      try {
        await apiClient.get<{ user: UserCardDto }>(`/users/${handle}`)
        setStatus('taken')
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setStatus('available')
        } else {
          setStatus('error')
        }
      }
    }, 500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [handle, isValidFormat])

  return status
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setInitialized = useAuthStore((s) => s.setInitialized)
  const [serverError, setServerError] = useState<string | null>(null)
  const [passwordValue, setPasswordValue] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  })

  const handleValue = watch('handle', '')
  const handleFormatValid =
    handleValue.length > 0 &&
    handleValue.length <= 15 &&
    /^[A-Za-z0-9_]+$/.test(handleValue)

  const handleStatus = useHandleAvailability(handleValue, handleFormatValid)

  const onSubmit = async (data: RegisterForm) => {
    setServerError(null)
    try {
      const res = await authApi.register(data)
      setAuth(res.accessToken, res.user)
      setInitialized()
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details && err.details.length > 0) {
          setServerError(err.details.map((d) => d.message).join(' '))
        } else if (err.status === 409) {
          setServerError('An account with this email or handle already exists.')
        } else {
          setServerError(err.message)
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.')
      }
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100dvh',
        background: 'var(--color-bg)',
      }}
    >
      {/* Brand panel */}
      <div
        aria-hidden="true"
        className="auth-brand-panel"
        style={{
          display: 'none',
          flex: '0 0 420px',
          background: 'var(--color-accent)',
          padding: '3rem',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <style>{`
          @media (min-width: 900px) { .auth-brand-panel { display: flex !important; } }
        `}</style>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 20px,
              rgba(0,0,0,0.06) 20px,
              rgba(0,0,0,0.06) 21px
            )`,
          }}
        />
        <div style={{ position: 'relative' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '5rem',
              color: 'var(--color-accent-contrast)',
              lineHeight: 0.9,
              letterSpacing: '-0.03em',
              margin: 0,
            }}
          >
            pulse
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'rgba(255,255,255,0.75)',
              marginTop: '1rem',
              lineHeight: 'var(--leading-relaxed)',
            }}
          >
            Join the conversation.
            <br />
            Build your audience.
          </p>
        </div>
      </div>

      {/* Form */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1.5rem',
          overflowY: 'auto',
        }}
      >
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Mobile wordmark */}
          <div className="auth-mobile-wordmark" style={{ marginBottom: '2rem' }}>
            <style>{`@media (min-width: 900px) { .auth-mobile-wordmark { display: none !important; } }`}</style>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                color: 'var(--color-accent)',
                letterSpacing: '-0.02em',
              }}
            >
              pulse
            </span>
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-2xl)',
              color: 'var(--color-text)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              marginBottom: '1.75rem',
              lineHeight: 'var(--leading-tight)',
            }}
          >
            Create your account
          </h2>

          {serverError && (
            <div
              role="alert"
              style={{
                background: 'rgba(232, 64, 42, 0.1)',
                border: '1px solid var(--color-danger)',
                borderRadius: 'var(--radius-md)',
                padding: '0.875rem 1rem',
                marginBottom: '1.25rem',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-danger)',
              }}
            >
              {serverError}
            </div>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            noValidate
            style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}
          >
            {/* Display name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                htmlFor="displayName"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}
              >
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                autoComplete="name"
                data-testid="input-display-name"
                aria-invalid={!!errors.displayName}
                aria-describedby={errors.displayName ? 'displayName-error' : undefined}
                {...register('displayName')}
                style={inputStyle(!!errors.displayName)}
              />
              {errors.displayName && (
                <FieldError id="displayName-error" message={errors.displayName.message} />
              )}
            </div>

            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                htmlFor="email"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                data-testid="input-email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
                style={inputStyle(!!errors.email)}
              />
              {errors.email && <FieldError id="email-error" message={errors.email.message} />}
            </div>

            {/* Handle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                htmlFor="handle"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}
              >
                Handle
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '0.875rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)',
                    fontSize: 'var(--text-base)',
                    fontFamily: 'var(--font-mono)',
                    pointerEvents: 'none',
                  }}
                >
                  @
                </span>
                <input
                  id="handle"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={15}
                  data-testid="input-handle"
                  aria-invalid={!!errors.handle || handleStatus === 'taken'}
                  aria-describedby="handle-hint"
                  {...register('handle')}
                  style={{
                    ...inputStyle(!!errors.handle || handleStatus === 'taken'),
                    paddingLeft: '1.75rem',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>
              <div id="handle-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Availability indicator */}
                {handleStatus === 'checking' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    checking…
                  </span>
                )}
                {handleStatus === 'available' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontFamily: 'var(--font-mono)' }}>
                    ✓ available
                  </span>
                )}
                {handleStatus === 'taken' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}>
                    already taken
                  </span>
                )}
                {errors.handle && <FieldError id="handle-error" message={errors.handle.message} />}
                {!errors.handle && handleStatus === 'idle' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dimmed)' }}>
                    1–15 characters, letters, numbers, underscores
                  </span>
                )}
              </div>
            </div>

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                htmlFor="password"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                data-testid="input-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    setPasswordValue(e.target.value)
                  },
                })}
                style={inputStyle(!!errors.password)}
              />
              <PasswordStrengthMeter password={passwordValue} />
              {errors.password && <FieldError id="password-error" message={errors.password.message} />}
            </div>

            {/* Submit */}
            <button
              type="submit"
              data-testid="submit-register-form"
              disabled={isSubmitting || handleStatus === 'taken'}
              style={{
                marginTop: '0.5rem',
                padding: '0.875rem',
                borderRadius: 'var(--radius-md)',
                background:
                  isSubmitting || handleStatus === 'taken'
                    ? 'var(--color-border)'
                    : 'var(--color-accent)',
                color:
                  isSubmitting || handleStatus === 'taken'
                    ? 'var(--color-text-muted)'
                    : 'var(--color-accent-contrast)',
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--text-base)',
                cursor: isSubmitting || handleStatus === 'taken' ? 'not-allowed' : 'pointer',
                transition: 'background var(--duration-base)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {isSubmitting && (
                <span
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    animation: 'pulse-spin 0.7s linear infinite',
                    display: 'inline-block',
                  }}
                />
              )}
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p
            style={{
              marginTop: '1.5rem',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
            }}
          >
            Already have an account?{' '}
            <Link
              to="/login"
              data-testid="link-login"
              style={{ color: 'var(--color-accent)', fontWeight: 500 }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────
function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    padding: '0.75rem 0.875rem',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${hasError ? 'var(--color-danger)' : 'var(--color-border)'}`,
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    fontSize: 'var(--text-base)',
    outline: 'none',
    transition: 'border-color var(--duration-fast)',
    width: '100%',
  }
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <span
      id={id}
      role="alert"
      style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-danger)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {message}
    </span>
  )
}
