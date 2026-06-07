// ============================================================
// ConversationRow — single row in the conversation list
// Shows: participant avatar+name, last-message preview, relative time,
// unread dot/count
// ============================================================

import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { RelativeTime } from '@/components/RelativeTime'
import type { ConversationDto, UserCardDto } from '@/types/api'

interface ConversationRowProps {
  conversation: ConversationDto
  currentUserId: string
  hasUnread: boolean
}

function getOtherParticipant(
  participants: UserCardDto[],
  currentUserId: string,
): UserCardDto | null {
  return participants.find((p) => p.id !== currentUserId) ?? participants[0] ?? null
}

export function ConversationRow({
  conversation,
  currentUserId,
  hasUnread,
}: ConversationRowProps) {
  const navigate = useNavigate()
  const other = getOtherParticipant(conversation.participants, currentUserId)
  const lastMsg = conversation.lastMessage

  const preview = lastMsg
    ? lastMsg.media
      ? lastMsg.senderId === currentUserId
        ? 'You sent a photo'
        : 'Sent you a photo'
      : (lastMsg.text ?? '').length > 60
        ? (lastMsg.text ?? '').slice(0, 57) + '...'
        : (lastMsg.text ?? '')
    : 'No messages yet'

  return (
    <button
      data-testid={`conversation-row-${conversation.id}`}
      onClick={() => navigate(`/messages/${conversation.id}`)}
      aria-label={`Open conversation with ${other?.displayName ?? 'Unknown'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--color-border-subtle)',
        transition: 'background var(--duration-fast)',
        textAlign: 'left',
        cursor: 'pointer',
        background: hasUnread
          ? 'color-mix(in srgb, var(--color-accent) 4%, transparent)'
          : 'transparent',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background =
          'var(--color-surface-raised)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.background = hasUnread
          ? 'color-mix(in srgb, var(--color-accent) 4%, transparent)'
          : 'transparent'
      }}
    >
      {/* Avatar with unread dot indicator */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar
          src={other?.avatarUrl}
          displayName={other?.displayName ?? '?'}
          handle={other?.handle}
          size="md"
          isVerified={other?.isVerified}
        />
        {hasUnread && (
          <span
            aria-label="Unread"
            data-testid={`unread-dot-${conversation.id}`}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '10px',
              height: '10px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-accent)',
              border: '2px solid var(--color-bg)',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
            marginBottom: '2px',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: hasUnread
                ? 'var(--font-weight-semibold)'
                : 'var(--font-weight-medium)',
              color: 'var(--color-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {other?.displayName ?? 'Unknown'}
          </span>
          {lastMsg && (
            <span style={{ flexShrink: 0 }}>
              <RelativeTime date={lastMsg.createdAt} />
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <p
            data-testid={`conversation-preview-${conversation.id}`}
            style={{
              flex: 1,
              fontSize: 'var(--text-sm)',
              color: hasUnread ? 'var(--color-text)' : 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: hasUnread ? 'var(--font-weight-medium)' : undefined,
            }}
          >
            {preview}
          </p>

          {conversation.unreadCount > 0 && (
            <span
              data-testid={`unread-count-badge-${conversation.id}`}
              style={{
                flexShrink: 0,
                minWidth: '18px',
                height: '18px',
                padding: '0 5px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-accent)',
                color: 'var(--color-accent-contrast)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-weight-bold)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// getOtherParticipant is also used in ConversationPage
/* eslint-disable react-refresh/only-export-components */
export { getOtherParticipant }
