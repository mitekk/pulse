// ============================================================
// Socket.IO client singleton
//
// - Created once; reused across the app lifetime.
// - Connects with autoConnect: false so we control connect()
//   timing (after auth is confirmed).
// - Access token sent in handshake auth for server-side
//   middleware verification.
// - On reconnect: backfill by refetching unread counts and
//   invalidating any open conversation query (handled by the
//   event router / room manager).
// ============================================================

import { io, type Socket } from 'socket.io-client'

// WS URL: in dev the Vite proxy forwards /socket.io → backend.
// In prod set VITE_WS_URL to the public backend origin.
const WS_URL = import.meta.env.VITE_WS_URL ?? ''

// Typed events — server → client
export interface ServerToClientEvents {
  'notification.new': (payload: import('@/types/api').NotificationDto) => void
  'timeline.newPosts': (payload: { count: number; previewIds: string[] }) => void
  'dm.message': (payload: import('@/types/api').MessageDto) => void
  'dm.typing': (payload: { conversationId: string; userId: string }) => void
  'dm.read': (payload: {
    conversationId: string
    userId: string
    lastReadMessageId: string
  }) => void
  'post.counters': (payload: {
    postId: string
    likes: number
    replies: number
    reposts: number
  }) => void
  'follow.update': (payload: {
    type: 'followed' | 'unfollowed' | 'requested'
    actorId: string
  }) => void
}

// Typed events — client → server
export interface ClientToServerEvents {
  'dm.send': (payload: {
    conversationId: string
    text?: string
    mediaId?: string
    clientNonce: string
  }) => void
  'dm.typing': (payload: { conversationId: string }) => void
  'dm.markRead': (payload: {
    conversationId: string
    lastReadMessageId: string
  }) => void
  'subscribe.post': (payload: { postId: string }) => void
  'unsubscribe.post': (payload: { postId: string }) => void
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Module-level singleton — never re-created, only reconnected.
let _socket: AppSocket | null = null

export function getSocket(): AppSocket {
  if (!_socket) {
    _socket = io(WS_URL, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    })
  }
  return _socket
}

/**
 * Connect the socket with the current access token.
 * Call this after auth is confirmed (useBootstrap success).
 * Also call when the access token rotates (token refresh).
 */
export function connectSocket(accessToken: string): void {
  const socket = getSocket()
  // Update auth before connecting/re-authing
  socket.auth = { token: accessToken }

  if (!socket.connected) {
    socket.connect()
  } else {
    // Token rotated while connected — reconnect to pick up the new
    // token in the Socket.IO handshake auth object.
    socket.disconnect()
    socket.connect()
  }
}

/**
 * Disconnect the socket cleanly (e.g. on logout).
 */
export function disconnectSocket(): void {
  const socket = getSocket()
  if (socket.connected) {
    socket.disconnect()
  }
}
