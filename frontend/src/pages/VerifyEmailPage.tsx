// ============================================================
// VerifyEmailPage — reads token from URL query param, calls API
// Shows success/failure/loading states
// ============================================================

import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { authApi } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'

type VerifyState = 'loading' | 'success' | 'invalid' | 'error'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'invalid')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }

    let cancelled = false

    async function verify() {
      try {
        await authApi.verifyEmail({ token: token! })
        if (!cancelled) setState('success')
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError) {
          if (err.status === 400 || err.status === 404 || err.status === 410) {
            setState('invalid')
          } else {
            setState('error')
            setErrorMessage(err.message)
          }
        } else {
          setState('error')
          setErrorMessage('An unexpected error occurred.')
        }
      }
    }

    void verify()
    return () => { cancelled = true }
  }, [token])

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100dvh',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        padding: '2rem 1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            color: 'var(--color-accent)',
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem',
          }}
        >
          pulse
        </span>

        {state === 'loading' && (
          <>
            <div
              role="status"
              aria-label="Verifying email"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '2.5px solid var(--color-border)',
                borderTopColor: 'var(--color-accent)',
                animation: 'pulse-spin 0.7s linear infinite',
              }}
            />
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-base)' }}>
              Verifying your email address…
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(42, 173, 110, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--color-success)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12l5 5L19 7"
                  stroke="var(--color-success)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: 'var(--color-text)',
                fontWeight: 400,
              }}
            >
              Email verified
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-base)', maxWidth: '32ch' }}>
              Your email address has been confirmed. You can now sign in to your account.
            </p>
            <Link
              to="/login"
              data-testid="verify-email-success-login"
              style={{
                padding: '0.75rem 2rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-accent-strong)',
                color: 'var(--color-accent-contrast)',
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--text-base)',
                display: 'inline-block',
                marginTop: '0.5rem',
              }}
            >
              Sign in
            </Link>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(232, 64, 42, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--color-danger)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="var(--color-danger)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: 'var(--color-text)',
                fontWeight: 400,
              }}
            >
              Invalid or expired link
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-base)', maxWidth: '36ch' }}>
              This verification link has expired or is invalid. Please request a new one by signing in.
            </p>
            <Link
              to="/login"
              data-testid="verify-email-invalid-login"
              style={{
                padding: '0.75rem 2rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                fontWeight: 'var(--font-weight-medium)',
                fontSize: 'var(--text-base)',
                display: 'inline-block',
                marginTop: '0.5rem',
              }}
            >
              Back to sign in
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(232, 64, 42, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--color-danger)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4m0 4h.01" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="10" stroke="var(--color-danger)" strokeWidth="1.5" />
              </svg>
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                color: 'var(--color-text)',
                fontWeight: 400,
              }}
            >
              Something went wrong
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-base)', maxWidth: '36ch' }}>
              {errorMessage ?? 'Could not verify your email. Please try again.'}
            </p>
            <Link
              to="/login"
              data-testid="verify-email-error-login"
              style={{
                padding: '0.75rem 2rem',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                fontWeight: 'var(--font-weight-medium)',
                fontSize: 'var(--text-base)',
                display: 'inline-block',
                marginTop: '0.5rem',
              }}
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
