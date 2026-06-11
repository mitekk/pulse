// ============================================================
// LoginPage — email/handle + password
// Surfaces 429 with retry timing
// ============================================================

import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Seo } from '@/components/Seo'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/auth/store'
import { ApiError } from '@/lib/api/client'

const loginSchema = z.object({
  emailOrHandle: z.string().min(1, 'Email or handle is required'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

function parseRetryAfter(err: ApiError): number | null {
  if (err.status === 429) {
    // Try to find retry-after from details or message
    const match = err.message.match(/(\d+)\s*(?:second|minute)/i)
    if (match) return parseInt(match[1], 10)
    return 60
  }
  return null
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/'
  const setAuth = useAuthStore((s) => s.setAuth)
  const setInitialized = useAuthStore((s) => s.setInitialized)

  const [serverError, setServerError] = useState<string | null>(null)
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    setServerError(null)
    setRateLimitSeconds(null)
    try {
      const res = await authApi.login(data)
      setAuth(res.accessToken, res.user)
      setInitialized()
      navigate(decodeURIComponent(returnTo), { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        const retryAfter = parseRetryAfter(err)
        if (retryAfter !== null) {
          setRateLimitSeconds(retryAfter)
        } else if (err.status === 401) {
          setServerError('Invalid credentials. Please check your email/handle and password.')
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
      <Seo
        title="Log in"
        description="Log in to PULSE — the microblogging platform where people are the first to know."
        path="/login"
      />
      {/* Left — brand panel */}
      <div
        aria-hidden="true"
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
        className="auth-brand-panel"
      >
        <style>{`
          @media (min-width: 900px) { .auth-brand-panel { display: flex !important; } }
        `}</style>

        {/* Background texture */}
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
            The feed that matters.
            <br />
            Unfiltered. Alive. Yours.
          </p>
        </div>
      </div>

      {/* Right — form */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1.5rem',
        }}
      >
        <div style={{ width: '100%', maxWidth: '380px' }}>
          {/* Mobile wordmark */}
          <div className="auth-mobile-wordmark" style={{ marginBottom: '2.5rem' }}>
            <style>{`
              @media (min-width: 900px) { .auth-mobile-wordmark { display: none !important; } }
            `}</style>
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
              fontSize: 'var(--text-3xl)',
              color: 'var(--color-text)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
              marginBottom: '2rem',
              lineHeight: 'var(--leading-tight)',
            }}
          >
            Sign in
          </h2>

          {/* Rate limit banner */}
          {rateLimitSeconds !== null && (
            <div
              role="alert"
              style={{
                background: 'rgba(232, 160, 32, 0.12)',
                border: '1px solid var(--color-warning)',
                borderRadius: 'var(--radius-md)',
                padding: '0.875rem 1rem',
                marginBottom: '1.25rem',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-warning)',
                lineHeight: 'var(--leading-normal)',
              }}
            >
              Too many attempts. Please wait {rateLimitSeconds} seconds before trying again.
            </div>
          )}

          {/* Server error */}
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
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            {/* Email or handle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                htmlFor="emailOrHandle"
                style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontWeight: 500 }}
              >
                Email or handle
              </label>
              <input
                id="emailOrHandle"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                data-testid="input-email-or-handle"
                aria-invalid={!!errors.emailOrHandle}
                aria-describedby={errors.emailOrHandle ? 'emailOrHandle-error' : undefined}
                {...register('emailOrHandle')}
                style={{
                  padding: '0.75rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${errors.emailOrHandle ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: 'var(--text-base)',
                  outline: 'none',
                  transition: 'border-color var(--duration-fast)',
                  width: '100%',
                }}
              />
              {errors.emailOrHandle && (
                <span
                  id="emailOrHandle-error"
                  role="alert"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}
                >
                  {errors.emailOrHandle.message}
                </span>
              )}
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
                autoComplete="current-password"
                data-testid="input-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
                style={{
                  padding: '0.75rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${errors.password ? 'var(--color-danger)' : 'var(--color-border)'}`,
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: 'var(--text-base)',
                  outline: 'none',
                  transition: 'border-color var(--duration-fast)',
                  width: '100%',
                }}
              />
              {errors.password && (
                <span
                  id="password-error"
                  role="alert"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', fontFamily: 'var(--font-mono)' }}
                >
                  {errors.password.message}
                </span>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              data-testid="submit-login-form"
              disabled={isSubmitting || rateLimitSeconds !== null}
              style={{
                padding: '0.875rem',
                borderRadius: 'var(--radius-md)',
                background:
                  isSubmitting || rateLimitSeconds !== null
                    ? 'var(--color-border)'
                    : 'var(--color-accent-strong)',
                color:
                  isSubmitting || rateLimitSeconds !== null
                    ? 'var(--color-text-muted)'
                    : 'var(--color-accent-contrast)',
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--text-base)',
                cursor: isSubmitting || rateLimitSeconds !== null ? 'not-allowed' : 'pointer',
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
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Register link */}
          <p
            style={{
              marginTop: '1.5rem',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
            }}
          >
            New to pulse?{' '}
            <Link
              to="/register"
              data-testid="link-register"
              style={{ color: 'var(--color-accent)', fontWeight: 500 }}
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
