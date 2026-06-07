// ============================================================
// TypingIndicator — animated dots shown when other participant is typing
// Reads from typingStore; auto-expires (handled by the store)
// ============================================================

import { useTypingStore } from '@/lib/stores/typingStore'
import type { UserCardDto } from '@/types/api'

interface TypingIndicatorProps {
  conversationId: string
  currentUserId: string
  participants: UserCardDto[]
}

// Animated CSS dots injected once
let dotsStyleInjected = false
function injectDotsStyle() {
  if (dotsStyleInjected || typeof document === 'undefined') return
  dotsStyleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes typing-bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }
    .typing-dot { animation: typing-bounce 1.2s infinite; }
    .typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .typing-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `
  document.head.appendChild(style)
}

export function TypingIndicator({
  conversationId,
  currentUserId,
  participants,
}: TypingIndicatorProps) {
  injectDotsStyle()

  // Use a stable string selector (joins active typing userIds as a comma-separated string).
  // Returning a string (primitive) from the Zustand selector avoids the
  // "getSnapshot should be cached" infinite loop that occurs when the selector
  // returns a new array reference on every call.
  // Note: the typingStore auto-removes entries after the TTL via setTimeout,
  // so entries present in the map are considered active (no need for Date.now check here).
  const prefix = `${conversationId}:`
  const othersTypingStr = useTypingStore((s) =>
    Object.keys(s.typingUsers)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .filter((uid) => uid !== currentUserId)
      .join(','),
  )
  const othersTyping = othersTypingStr ? othersTypingStr.split(',') : []

  if (othersTyping.length === 0) return null

  const typingName =
    participants.find((p) => p.id === othersTyping[0])?.displayName ?? 'Someone'

  return (
    <div
      data-testid="typing-indicator"
      role="status"
      aria-live="polite"
      aria-label={`${typingName} is typing`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '0.375rem var(--space-4)',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--text-xs)',
      }}
    >
      {/* Animated dots bubble */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          background: 'var(--color-surface-raised)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot"
            aria-hidden="true"
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--color-text-muted)',
              display: 'inline-block',
            }}
          />
        ))}
      </div>
      <span>{typingName} is typing…</span>
    </div>
  )
}
