// ============================================================
// MessageBubble — single message in a thread
//
// Rendering:
//   - Own messages: right-aligned, accent bubble
//   - Other's messages: left-aligned, surface bubble
//   - Failed optimistic: red border, retry button
//   - Sending optimistic: dimmed, spinner
//   - Read ticks: double-tick when other participant's lastReadMessageId >= this msg id
//
// Grouping hint: `isGrouped` hides the timestamp when true (set by parent
// when consecutive messages from the same sender within 2 minutes).
// ============================================================

import type { CSSProperties } from 'react'
import { isOptimistic } from './useDmComposer'
import type { OptimisticMessage } from './useDmComposer'
import type { MessageDto } from '@/types/api'

type MessageEntry = MessageDto | OptimisticMessage

interface MessageBubbleProps {
  message: MessageEntry
  isMine: boolean
  /** true when consecutive same-sender msg within 2 min */
  isGrouped: boolean
  /** The last message id the other participant has read */
  otherLastReadMessageId: string | null
  onRetry?: (nonce: string) => void
}

/** Compare Snowflake IDs as strings; larger string = more recent */
function isReadByOther(
  messageId: string,
  lastReadId: string | null,
): boolean {
  if (!lastReadId) return false
  // Snowflake IDs are time-ordered; compare lexicographically
  return messageId <= lastReadId
}

export function MessageBubble({
  message,
  isMine,
  isGrouped,
  otherLastReadMessageId,
  onRetry,
}: MessageBubbleProps) {
  const isOpt = isOptimistic(message as MessageEntry)
  const status = isOpt ? (message as OptimisticMessage)._status : 'sent'
  const nonce = isOpt ? (message as OptimisticMessage)._localNonce : null

  const isRead = isMine && !isOpt && isReadByOther(message.id, otherLastReadMessageId)
  const isSending = status === 'sending'
  const isFailed = status === 'failed'

  const bubbleStyle: CSSProperties = {
    maxWidth: '70%',
    padding: '0.5rem 0.875rem',
    borderRadius: isMine
      ? 'var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)'
      : 'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)',
    background: isMine
      ? isFailed
        ? 'color-mix(in srgb, var(--color-danger) 20%, var(--color-surface-raised))'
        : 'var(--color-accent)'
      : 'var(--color-surface-raised)',
    color: isMine ? 'var(--color-accent-contrast)' : 'var(--color-text)',
    border: isFailed ? '1px solid var(--color-danger)' : 'none',
    opacity: isSending ? 0.6 : 1,
    transition: 'opacity var(--duration-fast)',
    wordBreak: 'break-word',
    lineHeight: 'var(--leading-relaxed)',
    fontSize: 'var(--text-sm)',
    position: 'relative',
  }

  return (
    <div
      data-testid={`message-bubble-${message.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMine ? 'flex-end' : 'flex-start',
        marginBottom: isGrouped ? '2px' : 'var(--space-3)',
      }}
    >
      <div style={bubbleStyle}>
        {/* Media attachment */}
        {message.media && message.media.variants.medium && (
          <img
            src={message.media.variants.medium}
            alt={message.media.altText ?? 'Attachment'}
            width={240}
            height={180}
            loading="lazy"
            style={{
              width: '240px',
              height: 'auto',
              borderRadius: 'var(--radius-md)',
              marginBottom: message.text ? 'var(--space-2)' : 0,
              display: 'block',
              objectFit: 'cover',
            }}
          />
        )}

        {/* Text content */}
        {message.text && <span>{message.text}</span>}

        {/* Sending spinner */}
        {isSending && (
          <span
            aria-label="Sending"
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white',
              animation: 'spin 0.7s linear infinite',
              marginLeft: '6px',
              verticalAlign: 'middle',
            }}
          />
        )}
      </div>

      {/* Footer: time + ticks + retry */}
      {!isGrouped && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            marginTop: '2px',
            flexDirection: isMine ? 'row-reverse' : 'row',
          }}
        >
          <time
            dateTime={message.createdAt}
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {new Date(message.createdAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </time>

          {/* Delivery/read ticks (own messages only) */}
          {isMine && !isOpt && (
            <span
              aria-label={isRead ? 'Read' : 'Delivered'}
              data-testid={`message-tick-${message.id}`}
              title={isRead ? 'Read' : 'Delivered'}
              style={{ color: isRead ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
            >
              {isRead ? (
                // Double tick (read)
                <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
                  <path d="M1 5l3 3L10 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6 5l3 3L15 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                // Single tick (delivered)
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1 5l3 3L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          )}

          {/* Retry button for failed messages */}
          {isFailed && nonce && (
            <button
              data-testid={`retry-message-${message.id}`}
              onClick={() => onRetry?.(nonce)}
              aria-label="Retry sending message"
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-danger)',
                fontWeight: 'var(--font-weight-semibold)',
                textDecoration: 'underline',
                cursor: 'pointer',
                marginLeft: isMine ? 0 : 'var(--space-1)',
                marginRight: isMine ? 'var(--space-1)' : 0,
              }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}
