// ============================================================
// MessagesPage — /messages
// Master list of conversations.
// Mobile: full-screen list
// Desktop: left column of master-detail (ConversationPage in right column)
// ============================================================

import { useNavigate, Outlet, useMatch } from 'react-router-dom'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ConversationRow } from '@/features/messaging/ConversationRow'
import { useConversations } from '@/features/messaging/useConversations'
import { useUnreadStore } from '@/lib/stores/unreadStore'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'

function ConversationListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading conversations">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <Skeleton width={40} height={40} radius="var(--radius-full)" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton width={120} height={13} />
              <Skeleton width={40} height={11} />
            </div>
            <Skeleton width="85%" height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MessagesPage() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const { conversations, sentinelRef, status, error, isFetchingNextPage } = useConversations()
  const conversationsWithUnread = useUnreadStore((s) => s.conversationsWithUnread)

  // On desktop, check if a conversation thread is open (Outlet renders)
  const hasActiveConversation = useMatch('/messages/:id')

  if (!user) return null

  return (
    <div
      data-testid="messages-page"
      style={{
        display: 'flex',
        height: '100%',
        minHeight: '100dvh',
      }}
    >
      {/* ── Conversation list column ── */}
      <div
        style={{
          width: hasActiveConversation ? '320px' : '100%',
          flexShrink: 0,
          borderRight: hasActiveConversation ? '1px solid var(--color-border)' : 'none',
          display: hasActiveConversation ? 'flex' : 'block',
          flexDirection: 'column',
          // On mobile, hide the list when a conversation is open
          // (router handles this via separate routes)
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border)',
            position: 'sticky',
            top: 0,
            background: 'var(--color-bg)',
            zIndex: 'var(--z-sticky)',
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 400,
              color: 'var(--color-text)',
            }}
          >
            Messages
          </h1>
          <button
            data-testid="new-dm-button"
            onClick={() => navigate('/compose/dm')}
            aria-label="New message"
            title="New message"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              transition: 'color var(--duration-fast), background var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.color = 'var(--color-accent)'
              el.style.background = 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.color = 'var(--color-text-muted)'
              el.style.background = 'transparent'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M12 8v4M10 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <main data-testid="conversation-list">
          {status === 'pending' && <ConversationListSkeleton />}

          {status === 'error' && (
            <EmptyState
              title="Couldn't load messages"
              description={error?.message ?? 'Please try again.'}
            />
          )}

          {status === 'success' && conversations.length === 0 && (
            <EmptyState
              title="No messages yet"
              description="Start a conversation by tapping the compose button above."
            />
          )}

          {status === 'success' &&
            conversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                currentUserId={user.id}
                hasUnread={conversationsWithUnread.has(conv.id)}
              />
            ))}

          {/* Sentinel for infinite scroll */}
          <div
            ref={sentinelRef}
            aria-hidden="true"
            style={{ height: '1px' }}
          />

          {isFetchingNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
              <span
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: '2px solid var(--color-border)',
                  borderTopColor: 'var(--color-accent)',
                  animation: 'spin 0.7s linear infinite',
                  display: 'inline-block',
                }}
                aria-label="Loading more"
              />
            </div>
          )}
        </main>
      </div>

      {/* ── Conversation thread column (desktop master-detail) ── */}
      {hasActiveConversation && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </div>
      )}
    </div>
  )
}
