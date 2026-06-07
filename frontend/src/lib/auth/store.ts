// ============================================================
// Auth store (Zustand)
// Access token in memory ONLY — never persisted to localStorage
// Aligned to ADR-0003: short-lived JWT in memory + rotating refresh in httpOnly cookie
// ============================================================

import { create } from 'zustand'
import type { UserDto } from '@/types/api'
import { registerTokenStore } from '@/lib/api/client'

interface AuthState {
  accessToken: string | null
  user: UserDto | null
  isInitialized: boolean

  // Actions
  setAuth: (token: string, user: UserDto) => void
  setAccessToken: (token: string | null) => void
  logout: () => void
  setInitialized: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isInitialized: false,

  setAuth: (token, user) => set({ accessToken: token, user }),

  setAccessToken: (token) => set({ accessToken: token }),

  logout: () => set({ accessToken: null, user: null }),

  setInitialized: () => set({ isInitialized: true }),
}))

// Register the token store with the API client so the 401 interceptor
// can access and update the token without circular imports
registerTokenStore({
  getAccessToken: () => useAuthStore.getState().accessToken,
  setAccessToken: (token) => useAuthStore.getState().setAccessToken(token),
  logout: () => useAuthStore.getState().logout(),
})

// Convenience selectors
export const selectUser = (s: AuthState) => s.user
export const selectIsAuthenticated = (s: AuthState) => s.accessToken !== null && s.user !== null
export const selectIsInitialized = (s: AuthState) => s.isInitialized
export const selectAccessToken = (s: AuthState) => s.accessToken
