// ============================================================
// NotificationsPage — /notifications + /notifications/mentions
// Infinite aggregated list; mark-all-read on mount.
// Tabs: All | Mentions
// ============================================================

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { notificationsApi } from '@/lib/api/notifications'
import { queryKeys } from '@/lib/cache/queryKeys'
import { useUnreadStore } from '@/lib/stores/unreadStore'
import { NotificationItem } from '@/features/notifications/NotificationItem'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ScrollSentinel } from '@/components/ScrollSentinel'
import type { NotificationDto, CursorPage } from '@/types/api'

// ── Tabs ──────────────────────────────────────────────────

type NotifTab = 'all' | 'mentions'

function NotifTabBar({ active, onChange }: { active: NotifTab; onChange: (t: NotifTab) => void }) {
  const tabs: { key: NotifTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mentions', label: 'Mentions' },
  ]

  return (
    <div
      data-testid="notifications-tabs"
      role="tablist"
      aria-label="Notifications filter"
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        background: 'var(--color-bg)',
        zIndex: 10,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          data-testid={`notifications-tab-${tab.key}`}
          onClick={() => onChange(tab.key)}
          style={{
            flex: 1,
            padding: '1rem',
            fontFamily: 'var(--font-body)',
            fontWeight: active === tab.key ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
            fontSize: 'var(--text-sm)',
            color: active === tab.key ? 'var(--color-text)' : 'var(--color-text-muted)',
            borderBottom: active === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
            transition: 'color var(--duration-fast), border-color var(--duration-fast)',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Skeletons ──────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid var(--color-border)',
        alignItems: 'flex-start',
      }}
    >
      <Skeleton width={26} height={26} radius="full" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <Skeleton width={32} height={32} radius="full" />
          <Skeleton width={32} height={32} radius="full" />
        </div>
        <Skeleton width={240} height={14} radius="sm" />
        <Skeleton width={160} height={12} radius="sm" />
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────

export default function NotificationsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clearNotifications = useUnreadStore((s) => s.clearNotifications)

  // Tab from URL path: /notifications/mentions → 'mentions'
  const isMentionsPath = location.pathname.endsWith('/mentions')
  const activeTab: NotifTab = isMentionsPath ? 'mentions' : 'all'

  const handleTabChange = (tab: NotifTab) => {
    if (tab === 'mentions') {
      navigate('/notifications/mentions')
    } else {
      navigate('/notifications')
    }
  }

  // ── Infinite list ────────────────────────────────────────
  const {
    items: allNotifications,
    status,
    error,
    sentinelRef,
    isFetchingNextPage,
  } = useInfiniteList<NotificationDto>({
    queryKey: queryKeys.notifications.list(),
    queryFn: ({ pageParam }) =>
      notificationsApi.getNotifications((pageParam as string | null) ?? undefined),
    staleTime: 0, // Always fresh — real-time driven
  })

  // Filter to mentions only for that tab
  const notifications =
    activeTab === 'mentions'
      ? allNotifications.filter((n) => n.type === 'mention' || n.type === 'reply')
      : allNotifications

  // ── Mark-all-read on page open ────────────────────────────
  const markReadMutation = useMutation({
    mutationFn: () => notificationsApi.markRead(), // no ids = mark all
    onSuccess: () => {
      clearNotifications()
      // Patch notifications list to set readAt on all items
      queryClient.setQueryData<{ pages: CursorPage<NotificationDto>[]; pageParams: unknown[] }>(
        queryKeys.notifications.list(),
        (prev) => {
          if (!prev) return prev
          const now = new Date().toISOString()
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.map((n) => (n.readAt ? n : { ...n, readAt: now })),
            })),
          }
        },
      )
      queryClient.setQueryData(queryKeys.notifications.unreadCount(), { count: 0 })
    },
  })

  // Mark all read when page mounts (or tab switches back to "all")
  useEffect(() => {
    if (status === 'success') {
      markReadMutation.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Per-item read handler (for future per-item read)
  const handleItemRead = (_id: string) => {
    // Already handled by mark-all on mount; no-op for now
  }

  return (
    <div data-testid="notifications-page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          padding: '1rem',
          zIndex: 11,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-text)',
          }}
        >
          Notifications
        </h1>
      </header>

      {/* Tab bar */}
      <NotifTabBar active={activeTab} onChange={handleTabChange} />

      {/* Content */}
      {status === 'pending' && (
        <div data-testid="notifications-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <NotificationSkeleton key={i} />
          ))}
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          title="Couldn't load notifications"
          description={(error as Error)?.message ?? 'Something went wrong.'}
        />
      )}

      {status === 'success' && notifications.length === 0 && (
        <EmptyState
          title={activeTab === 'mentions' ? 'No mentions yet' : 'No notifications yet'}
          description={
            activeTab === 'mentions'
              ? 'When someone mentions you, it will appear here.'
              : 'Likes, replies, follows, and more will appear here.'
          }
        />
      )}

      {status === 'success' && notifications.length > 0 && (
        <div role="feed" aria-label="Notifications list">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={handleItemRead}
            />
          ))}
          <ScrollSentinel
            sentinelRef={sentinelRef}
            isFetchingNextPage={isFetchingNextPage}
          />
        </div>
      )}
    </div>
  )
}
