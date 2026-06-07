// ============================================================
// Per-route error boundary — catches render errors
// ============================================================

import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'

export function RouteErrorBoundary() {
  const error = useRouteError()

  let heading = 'Something went wrong'
  let message = 'An unexpected error occurred.'

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      heading = '404 — Not found'
      message = "This page doesn't exist."
    } else {
      heading = `${error.status} — ${error.statusText}`
      message = error.data as string
    }
  } else if (error instanceof Error) {
    message = error.message
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-3xl)',
          color: 'var(--color-accent)',
        }}
      >
        {heading}
      </h1>
      <p style={{ color: 'var(--color-text-muted)', maxWidth: '40ch' }}>{message}</p>
      <Link
        to="/"
        style={{
          color: 'var(--color-accent)',
          textDecoration: 'underline',
          fontSize: 'var(--text-sm)',
        }}
      >
        Back to home
      </Link>
    </div>
  )
}
