// ============================================================
// useReadOnView — emits dm.markRead when the bottom of the thread
// is visible; clears the unread badge for this conversation.
// ============================================================

import { useEffect, useRef, useCallback } from 'react'
import { emitMarkRead } from '@/lib/realtime/roomManager'
import { messagingApi } from '@/lib/api/messaging'
import { useUnreadStore } from '@/lib/stores/unreadStore'

interface UseReadOnViewOptions {
  conversationId: string
  /** Latest message id visible in the thread */
  latestMessageId: string | null
  /** Element to observe — when visible, we emit markRead */
  enabled?: boolean
}

export function useReadOnView({
  conversationId,
  latestMessageId,
  enabled = true,
}: UseReadOnViewOptions): (node: HTMLElement | null) => void {
  const clearConversation = useUnreadStore((s) => s.clearConversation)
  const lastMarkedRef = useRef<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const nodeRef = useRef<HTMLElement | null>(null)

  const markRead = useCallback(() => {
    if (!latestMessageId) return
    if (lastMarkedRef.current === latestMessageId) return

    lastMarkedRef.current = latestMessageId

    // Emit WS event (fast path)
    emitMarkRead(conversationId, latestMessageId)

    // REST backup — fire-and-forget
    messagingApi.markRead(conversationId, latestMessageId).catch(() => {
      // non-critical: WS emit already sent
    })

    // Clear unread badge immediately
    clearConversation(conversationId)
  }, [conversationId, latestMessageId, clearConversation])

  // Re-run when latestMessageId changes (new WS message arrived)
  useEffect(() => {
    if (!enabled) return
    // If already observing and bottom is visible, mark read immediately
    const node = nodeRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          markRead()
        }
      },
      { threshold: 0 },
    )
    observer.observe(node)
    observerRef.current = observer
    return () => observer.disconnect()
  }, [markRead, enabled])

  const bottomRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
    if (observerRef.current) {
      observerRef.current.disconnect()
      if (node) observerRef.current.observe(node)
    }
  }, [])

  return bottomRef
}
