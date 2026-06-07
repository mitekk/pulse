// ============================================================
// GuestGuard — redirects authenticated users away from auth pages
// ============================================================

import { Navigate } from 'react-router-dom'
import { useAuthStore, selectIsAuthenticated, selectIsInitialized } from '@/lib/auth/store'
import { FullPageSpinner } from '@/components/FullPageSpinner'

interface GuestGuardProps {
  children: React.ReactNode
}

export function GuestGuard({ children }: GuestGuardProps) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const isInitialized = useAuthStore(selectIsInitialized)

  if (!isInitialized) {
    return <FullPageSpinner />
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
