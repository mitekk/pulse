// ============================================================
// ConversationPage — /messages/:id
// Full DM thread: header, infinite message history (reverse-paginated),
// typing indicator, composer with optimistic send + read receipts.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from '@/components/Avatar'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { MessageBubble } from '@/features/messaging/MessageBubble'
import { TypingIndicator } from '@/features/messaging/TypingIndicator'
import { DmComposer } from '@/features/messaging/DmComposer'
import { useMessages } from '@/features/messaging/useMessages'
import { useDmComposer, isOptimistic } from '@/features/messaging/useDmComposer'
import { useReadOnView } from '@/features/messaging/useReadOnView'
import { getDmPermission } from '@/features/messaging/dmPermission'
import { getOtherParticipant } from '@/features/messaging/ConversationRow'
import { messagingApi } from '@/lib/api/messaging'
import { usersApi } from '@/lib/api/users'
import { queryKeys } from '@/lib/cache/queryKeys'
import { openConversation, closeConversation } from '@/lib/realtime/roomManager'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import type { ConversationDto } from '@/types/api'
import type { OptimisticMessage } from '@/features/messaging/useDmComposer'

type MessageEntry = Parameters<typeof MessageBubble>[0]['message']

// Detect whether consecutive messages should be grouped
// (same sender, within 2 minutes)
function shouldGroup(a: MessageEntry, b: MessageEntry): boolean {
  if (a.senderId !== b.senderId) return false
  const diff = Math.abs(
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  return diff < 2 * 60 * 1000
}

function MessageListSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading messages"
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {[80, 60, 90, 55, 70].map((w, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end',
          }}
        >
          <Skeleton width={`${w}%`} height={36} radius="var(--radius-xl)" />
        </div>
      ))}
    </div>
  )
}

export default function ConversationPage() {
  const { id: conversationId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [otherLastReadId, setOtherLastReadId] = useState<string | null>(null)

  // Fetch conversation metadata — first from list cache, then fallback REST
  const { data: conversation, status: convStatus } = useQuery<ConversationDto | null>({
    queryKey: queryKeys.conversations.detail(conversationId ?? ''),
    queryFn: async () => {
      if (!conversationId) return null
      // Try list cache first
      const cached = queryClient.getQueryData<{
        pages: Array<{ items: ConversationDto[] }>
      }>(queryKeys.conversations.list())
      if (cached) {
        const found = cached.pages.flatMap((p) => p.items).find((c) => c.id === conversationId)
        if (found) return found
      }
      // Fallback: fetch the list and pick the conversation
      const page = await messagingApi.getConversations()
      return page.items.find((c) => c.id === conversationId) ?? null
    },
    staleTime: 30_000,
    enabled: !!conversationId,
  })

  const otherParticipant = conversation
    ? getOtherParticipant(conversation.participants, user?.id ?? '')
    : null

  // Fetch recipient profile for DM permission check
  const { data: recipientProfileData } = useQuery({
    queryKey: queryKeys.users.profile(otherParticipant?.handle ?? '_'),
    queryFn: () => usersApi.getProfile(otherParticipant!.handle),
    staleTime: 60_000,
    enabled: !!otherParticipant?.handle,
  })

  const permission = getDmPermission(recipientProfileData?.user)

  // Messages infinite list
  const { messages, topSentinelRef, status, error, isFetchingNextPage } = useMessages(
    conversationId ?? '',
  )

  // Optimistic send
  const { send, retry, isSending } = useDmComposer({
    conversationId: conversationId ?? '',
    currentUserId: user?.id ?? '',
  })

  // Latest real (non-optimistic) message id for mark-read
  const latestRealMessage = [...messages].reverse().find((m) => !isOptimistic(m as OptimisticMessage))
  const latestMessageId = latestRealMessage?.id ?? null

  // Read-on-view
  const bottomRef = useReadOnView({
    conversationId: conversationId ?? '',
    latestMessageId,
    enabled: isAtBottom,
  })

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const distFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight
    setIsAtBottom(distFromBottom < 100)
  }, [])

  // Auto-scroll to bottom on new messages when already at bottom
  useEffect(() => {
    if (isAtBottom && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages.length, isAtBottom])

  // Initial scroll to bottom after messages load
  useEffect(() => {
    if (status === 'success' && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [status])

  // Room lifecycle: open conversation room on mount, leave on unmount
  useEffect(() => {
    if (!conversationId) return
    openConversation(conversationId)
    return () => closeConversation(conversationId)
  }, [conversationId])

  // Watch conversation list cache for the other participant's read receipt
  // When their unreadCount zeroes out, they've read our latest message.
  useEffect(() => {
    if (!conversationId) return
    const unsub = queryClient.getQueryCache().subscribe(() => {
      const listCache = queryClient.getQueryData<{
        pages: Array<{ items: ConversationDto[] }>
      }>(queryKeys.conversations.list())
      if (!listCache) return
      for (const page of listCache.pages) {
        const conv = page.items.find((c) => c.id === conversationId)
        if (conv?.unreadCount === 0 && conv.lastMessage) {
          setOtherLastReadId(conv.lastMessage.id)
        }
      }
    })
    return () => unsub()
  }, [conversationId, queryClient])

  if (!conversationId || !user) {
    return <EmptyState title="Conversation not found" description="Invalid conversation." />
  }

  if (convStatus === 'pending') {
    return <div data-testid="conversation-page-loading"><MessageListSkeleton /></div>
  }

  return (
    <div
      data-testid="conversation-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        maxHeight: '100dvh',
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-sticky)',
          flexShrink: 0,
        }}
      >
        <button
          data-testid="conversation-back-button"
          onClick={() => navigate('/messages')}
          aria-label="Back to messages"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M19 12H5M12 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {otherParticipant ? (
          <Link
            to={`/${otherParticipant.handle}`}
            data-testid="conversation-participant-link"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flex: 1,
              minWidth: 0,
            }}
          >
            <Avatar
              src={otherParticipant.avatarUrl}
              displayName={otherParticipant.displayName}
              handle={otherParticipant.handle}
              size="sm"
              isVerified={otherParticipant.isVerified}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {otherParticipant.displayName}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                @{otherParticipant.handle}
              </div>
            </div>
          </Link>
        ) : (
          <div style={{ flex: 1 }} />
        )}
      </header>

      {/* ── Message thread ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        data-testid="message-thread"
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--space-4)',
        }}
      >
        {/* Top sentinel: triggers loading older messages on scroll-up */}
        <div ref={topSentinelRef} aria-hidden="true" style={{ height: '1px' }} />

        {isFetchingNextPage && (
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-2)' }}
          >
            <span
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                border: '2px solid var(--color-border)',
                borderTopColor: 'var(--color-accent)',
                animation: 'spin 0.7s linear infinite',
                display: 'inline-block',
              }}
              aria-label="Loading older messages"
            />
          </div>
        )}

        {status === 'pending' && <MessageListSkeleton />}

        {status === 'error' && (
          <EmptyState
            title="Couldn't load messages"
            description={error?.message ?? 'Please try again.'}
          />
        )}

        {status === 'success' && messages.length === 0 && (
          <EmptyState
            title="No messages yet"
            description={`Say hi to ${otherParticipant?.displayName ?? 'them'}!`}
          />
        )}

        {/* Message bubbles */}
        {status === 'success' &&
          messages.map((message, idx) => {
            const prev = messages[idx - 1]
            const grouped = prev ? shouldGroup(prev as MessageEntry, message as MessageEntry) : false
            const isMine = message.senderId === user.id
            const key = isOptimistic(message as OptimisticMessage)
              ? `opt-${(message as OptimisticMessage)._localNonce}`
              : message.id

            return (
              <MessageBubble
                key={key}
                message={message as MessageEntry}
                isMine={isMine}
                isGrouped={grouped}
                otherLastReadMessageId={otherLastReadId}
                onRetry={retry}
              />
            )
          })}

        {/* Typing indicator */}
        {conversation && (
          <TypingIndicator
            conversationId={conversationId}
            currentUserId={user.id}
            participants={conversation.participants}
          />
        )}

        {/* Bottom sentinel: read-on-view trigger */}
        <div
          ref={bottomRef}
          data-testid="thread-bottom-sentinel"
          aria-hidden="true"
          style={{ height: '1px' }}
        />
      </div>

      {/* ── Composer ── */}
      <DmComposer
        conversationId={conversationId}
        permissionStatus={permission.status}
        permissionExplanation={permission.explanation}
        onSend={send}
        isSending={isSending}
      />
    </div>
  )
}
