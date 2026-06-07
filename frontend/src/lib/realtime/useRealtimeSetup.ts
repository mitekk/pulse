// ============================================================
// useRealtimeSetup
//
// Wires the Socket.IO client to the auth store and query cache.
// Mount once at the app root (inside AuthGuard / after bootstrap).
//
// Responsibilities:
// 1. Connect socket with current access token on mount.
// 2. Register all WS event handlers (event router).
// 3. On reconnect: refetch unread count + invalidate open convs.
// 4. On token rotation: reconnect socket with new token.
//    (The auth store exposes selectAccessToken for this.)
// 5. On logout: disconnect socket.
// ============================================================

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore, selectAccessToken, selectIsAuthenticated } from '@/lib/auth/store'
import { getSocket, connectSocket, disconnectSocket } from './socket'
import { registerEventRouter } from './eventRouter'
import { queryKeys } from '@/lib/cache/queryKeys'

export function useRealtimeSetup(): void {
  const queryClient = useQueryClient()
  const accessToken = useAuthStore(selectAccessToken)
  const isAuthenticated = useAuthStore(selectIsAuthenticated)

  // Track the token we last connected with to detect rotation
  const lastTokenRef = useRef<string | null>(null)
  // Track cleanup fn from event router
  const cleanupRouterRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      // Not authenticated — ensure socket is disconnected
      disconnectSocket()
      lastTokenRef.current = null
      return
    }

    const socket = getSocket()

    // Wire event router once (idempotent via cleanup)
    if (!cleanupRouterRef.current) {
      cleanupRouterRef.current = registerEventRouter(socket, queryClient)
    }

    // Reconnect backfill: on successful reconnect, refetch stale data
    const handleReconnect = () => {
      // Refetch unread counts so badges are accurate after any missed events
      void queryClient.refetchQueries({ queryKey: queryKeys.notifications.unreadCount() })

      // Invalidate conversations list so unread dots are fresh
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.list() })
    }

    socket.on('connect', handleReconnect)

    // Connect (or reconnect with updated token if it rotated)
    if (accessToken !== lastTokenRef.current) {
      lastTokenRef.current = accessToken
      connectSocket(accessToken)
    }

    return () => {
      socket.off('connect', handleReconnect)
    }
  }, [isAuthenticated, accessToken, queryClient])

  // Cleanup event router on unmount (app teardown)
  useEffect(() => {
    return () => {
      cleanupRouterRef.current?.()
      cleanupRouterRef.current = null
    }
  }, [])
}
