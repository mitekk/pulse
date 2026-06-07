// ============================================================
// Hook: useCurrentUser — returns the authenticated user or null
// ============================================================

import { useAuthStore, selectUser, selectIsAuthenticated } from './store'
import type { UserDto } from '@/types/api'

export function useCurrentUser(): UserDto | null {
  return useAuthStore(selectUser)
}

export function useIsAuthenticated(): boolean {
  return useAuthStore(selectIsAuthenticated)
}
