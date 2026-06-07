// ============================================================
// Bootstrap hook — silent refresh on app mount
// Attempts POST /auth/refresh using the httpOnly refresh cookie.
// Sets auth state if successful, marks initialized either way.
// ============================================================

import { useEffect } from 'react'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from './store'

export function useBootstrap(): boolean {
  const isInitialized = useAuthStore((s) => s.isInitialized)
  const setInitialized = useAuthStore((s) => s.setInitialized)
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const { accessToken } = await authApi.refresh()
        if (!cancelled) {
          const { user } = await authApi.me()
          if (!cancelled) {
            setAuth(accessToken, user)
          }
        }
      } catch {
        // Refresh cookie absent or expired — user is logged out, this is expected
      } finally {
        if (!cancelled) {
          setInitialized()
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [setAuth, setInitialized])

  return isInitialized
}
