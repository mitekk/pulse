// ============================================================
// AuthGuard — redirects unauthenticated users to /login
// Preserves returnTo for post-login redirect
// ============================================================

import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, selectIsAuthenticated, selectIsInitialized } from '@/lib/auth/store'
import { FullPageSpinner } from '@/components/FullPageSpinner'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const isInitialized = useAuthStore(selectIsInitialized)
  const location = useLocation()

  if (!isInitialized) {
    return <FullPageSpinner />
  }

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />
  }

  return <>{children}</>
}
