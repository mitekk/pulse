// ============================================================
// Auth store unit tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './store'
import type { UserDto } from '@/types/api'

const mockUser: UserDto = {
  id: 'uuid-1234',
  handle: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  isVerified: false,
  isPrivate: false,
  dmPrivacy: 'following',
  createdAt: '2026-06-07T00:00:00Z',
}

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null, user: null, isInitialized: false })
  })

  it('starts with no auth state', () => {
    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.user).toBeNull()
    expect(state.isInitialized).toBe(false)
  })

  it('sets auth correctly', () => {
    useAuthStore.getState().setAuth('test-token', mockUser)
    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('test-token')
    expect(state.user).toEqual(mockUser)
  })

  it('updates access token', () => {
    useAuthStore.getState().setAuth('old-token', mockUser)
    useAuthStore.getState().setAccessToken('new-token')
    expect(useAuthStore.getState().accessToken).toBe('new-token')
  })

  it('clears auth on logout', () => {
    useAuthStore.getState().setAuth('test-token', mockUser)
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.user).toBeNull()
  })

  it('marks as initialized', () => {
    useAuthStore.getState().setInitialized()
    expect(useAuthStore.getState().isInitialized).toBe(true)
  })
})
