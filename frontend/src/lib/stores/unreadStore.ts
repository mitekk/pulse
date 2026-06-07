// ============================================================
// Unread Badge Store
// Tracks notification and message unread counts for nav badges.
// Source of truth is the server; this is a client-side mirror
// updated by WS events and seeded from REST on bootstrap.
// ============================================================

import { create } from 'zustand'

interface UnreadState {
  notificationsCount: number
  conversationsWithUnread: Set<string>

  setNotificationsCount: (count: number) => void
  incrementNotifications: () => void
  clearNotifications: () => void

  addUnreadConversation: (id: string) => void
  clearConversation: (id: string) => void
  getTotalUnreadMessages: () => number
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  notificationsCount: 0,
  conversationsWithUnread: new Set<string>(),

  setNotificationsCount: (count) => set({ notificationsCount: count }),

  incrementNotifications: () =>
    set((s) => ({ notificationsCount: s.notificationsCount + 1 })),

  clearNotifications: () => set({ notificationsCount: 0 }),

  addUnreadConversation: (id) =>
    set((s) => ({
      conversationsWithUnread: new Set([...s.conversationsWithUnread, id]),
    })),

  clearConversation: (id) =>
    set((s) => {
      const next = new Set(s.conversationsWithUnread)
      next.delete(id)
      return { conversationsWithUnread: next }
    }),

  getTotalUnreadMessages: () => get().conversationsWithUnread.size,
}))
