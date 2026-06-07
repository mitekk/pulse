// ============================================================
// Typing Indicator Store
// Ephemeral UI state for DM typing indicators.
// Each entry auto-expires after TYPING_TTL_MS.
// ============================================================

import { create } from 'zustand'

const TYPING_TTL_MS = 4_000

interface TypingState {
  // key: `${conversationId}:${userId}`, value: expiry timestamp
  typingUsers: Record<string, number>
  setTyping: (conversationId: string, userId: string) => void
  clearExpired: () => void
}

export const useTypingStore = create<TypingState>((set, get) => ({
  typingUsers: {},

  setTyping: (conversationId, userId) => {
    const key = `${conversationId}:${userId}`
    const expiry = Date.now() + TYPING_TTL_MS

    set((s) => ({
      typingUsers: { ...s.typingUsers, [key]: expiry },
    }))

    // Auto-clear after TTL
    setTimeout(() => {
      const current = get().typingUsers[key]
      if (current !== undefined && Date.now() >= current) {
        set((s) => {
          const next = { ...s.typingUsers }
          delete next[key]
          return { typingUsers: next }
        })
      }
    }, TYPING_TTL_MS + 50)
  },

  clearExpired: () => {
    const now = Date.now()
    set((s) => {
      const next: Record<string, number> = {}
      for (const [key, expiry] of Object.entries(s.typingUsers)) {
        if (expiry > now) next[key] = expiry
      }
      return { typingUsers: next }
    })
  },
}))

/**
 * Returns true if the given userId is currently typing in the given conversation.
 */
export function selectIsTyping(
  state: TypingState,
  conversationId: string,
  userId: string,
): boolean {
  const key = `${conversationId}:${userId}`
  const expiry = state.typingUsers[key]
  return expiry !== undefined && expiry > Date.now()
}

/**
 * Returns all userIds currently typing in a given conversation.
 */
export function selectTypingUsers(state: TypingState, conversationId: string): string[] {
  const now = Date.now()
  const prefix = `${conversationId}:`
  return Object.entries(state.typingUsers)
    .filter(([key, expiry]) => key.startsWith(prefix) && expiry > now)
    .map(([key]) => key.slice(prefix.length))
}
