// ============================================================
// PublicShell — lightweight layout for unauthenticated visitors
//
// Rendered by AdaptiveShell when a guest lands on a public route
// (profiles, posts). Crawlable: no auth hooks, no realtime socket.
// Provides a slim header with sign-in CTAs and a centered content
// column matching the authenticated shell's width.
// ============================================================

import { Outlet, Link, useLocation } from 'react-router-dom'

function PulseWordmark() {
  return (
    <Link
      to="/login"
      data-testid="public-wordmark"
      aria-label="PULSE home"
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.5rem',
        color: 'var(--color-accent)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        textDecoration: 'none',
      }}
    >
      pulse
    </Link>
  )
}

export function PublicShell() {
  const location = useLocation()
  const returnTo = encodeURIComponent(location.pathname + location.search)
  const loginHref = `/login?returnTo=${returnTo}`

  return (
    <>
      <a href="#main-content" className="skip-to-content" data-testid="skip-to-content">
        Skip to content
      </a>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100dvh',
          maxWidth: 'var(--shell-center-max)',
          margin: '0 auto',
          width: '100%',
          borderInline: '1px solid var(--color-border)',
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 'var(--z-sticky)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            height: 'var(--shell-header-height)',
            background: 'var(--color-bg)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <PulseWordmark />

          <nav aria-label="Account" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link
              to={loginHref}
              data-testid="public-login-link"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-weight-semibold)',
                textDecoration: 'none',
              }}
            >
              Log in
            </Link>
            <Link
              to="/register"
              data-testid="public-register-link"
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-accent-strong)',
                color: 'var(--color-accent-contrast)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-weight-semibold)',
                textDecoration: 'none',
              }}
            >
              Sign up
            </Link>
          </nav>
        </header>

        <main id="main-content" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </main>

        <aside
          data-testid="public-join-banner"
          aria-label="Join PULSE"
          style={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.875rem 1rem',
            background: 'var(--color-surface-raised)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)' }}>
              Don&apos;t miss what&apos;s happening
            </p>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              People on PULSE are the first to know.
            </p>
          </div>
          <Link
            to="/register"
            data-testid="public-join-cta"
            style={{
              flexShrink: 0,
              padding: '0.5rem 1.25rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-accent-strong)',
              color: 'var(--color-accent-contrast)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              textDecoration: 'none',
            }}
          >
            Sign up
          </Link>
        </aside>
      </div>
    </>
  )
}
