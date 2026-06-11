// ============================================================
// AdaptiveShell — chooses the layout based on auth + route
//
//   • Authenticated         → AppShell (full nav, compose, realtime)
//   • Guest on public route  → PublicShell (crawlable, sign-in CTAs)
//   • Guest on private route → redirect to /login?returnTo=…
//
// Public routes are marked with `handle: { public: true }` in the
// router. Keeping every route under one layout element means the
// shell does not remount when an authenticated user navigates
// between a profile and a modal route (compose, photo).
// ============================================================

import { Navigate, useLocation, useMatches } from 'react-router-dom'
import { useAuthStore, selectIsAuthenticated, selectIsInitialized } from '@/lib/auth/store'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { AppShell } from './AppShell'
import { PublicShell } from './PublicShell'

interface RouteHandle {
  public?: boolean
}

export function AdaptiveShell() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const isInitialized = useAuthStore(selectIsInitialized)
  const location = useLocation()
  const matches = useMatches()

  if (!isInitialized) {
    return <FullPageSpinner />
  }

  if (isAuthenticated) {
    return <AppShell />
  }

  // Guest: allow only routes explicitly marked public.
  const isPublicRoute = matches.some((m) => (m.handle as RouteHandle | undefined)?.public)
  if (isPublicRoute) {
    return <PublicShell />
  }

  const returnTo = encodeURIComponent(location.pathname + location.search)
  return <Navigate to={`/login?returnTo=${returnTo}`} replace />
}
