// ============================================================
// Room Manager
// Manages Socket.IO room subscriptions for the client.
//
// Rooms:
//   user:{me}         — joined on connect, left on disconnect
//   conversation:{id} — joined when DM thread opens, left on close
//   post:{id}         — joined when thread view activates, left on leave
//
// The server controls actual room membership; these emit the
// corresponding client→server events that trigger server-side
// socket.join(room).
// ============================================================

import { getSocket } from './socket'

// ── Post rooms ────────────────────────────────────────────

/**
 * Subscribe to live counter updates for a post.
 * Call when a thread view mounts.
 */
export function subscribePost(postId: string): void {
  const socket = getSocket()
  if (socket.connected) {
    socket.emit('subscribe.post', { postId })
  }
}

/**
 * Unsubscribe from post counter updates.
 * Call when a thread view unmounts.
 */
export function unsubscribePost(postId: string): void {
  const socket = getSocket()
  if (socket.connected) {
    socket.emit('unsubscribe.post', { postId })
  }
}

// ── Conversation rooms ────────────────────────────────────
// The server joins the socket to conversation:{id} automatically
// when a message is sent or the user opens the thread.
// The client emits dm.typing / dm.markRead events to signal
// activity in a specific conversation; the server handles
// room routing. No explicit join/leave events are needed
// per the spec — the server tracks open conversations via
// presence signals (typing, markRead).
//
// If the backend exposes explicit join/leave events in future,
// add them here.

/**
 * Signal that the user is viewing a conversation.
 * This is a no-op if the socket is disconnected; the server
 * will rejoin on reconnect via the reconnect backfill path.
 */
export function openConversation(conversationId: string): void {
  // conversationId reserved for future explicit join event
  void conversationId
  // No explicit join event in current spec.
  // The server joins user to conversation room on first dm.typing
  // or dm.markRead emit. Just ensure socket is connected.
}

/**
 * Signal that the user has left a conversation view.
 * Currently a no-op — the server manages room membership.
 */
export function closeConversation(conversationId: string): void {
  // conversationId reserved for future explicit leave event
  void conversationId
}

// ── DM client→server helpers ──────────────────────────────

export function emitTyping(conversationId: string): void {
  const socket = getSocket()
  if (socket.connected) {
    socket.emit('dm.typing', { conversationId })
  }
}

export function emitMarkRead(conversationId: string, lastReadMessageId: string): void {
  const socket = getSocket()
  if (socket.connected) {
    socket.emit('dm.markRead', { conversationId, lastReadMessageId })
  }
}

export function emitSendMessage(payload: {
  conversationId: string
  text?: string
  mediaId?: string
  clientNonce: string
}): void {
  const socket = getSocket()
  if (socket.connected) {
    socket.emit('dm.send', payload)
  }
}
