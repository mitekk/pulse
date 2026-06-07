// ============================================================
// InfiniteList — wrapper component for infinite-scroll lists
// Renders items, loading states, error, empty, and sentinel.
// ============================================================

import type { ReactNode } from 'react'
import { PostCardSkeleton } from './Skeleton'

interface InfiniteListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  sentinelRef: (node: HTMLElement | null) => void
  status: 'pending' | 'error' | 'success'
  error: Error | null
  isFetchingNextPage: boolean
  hasNextPage: boolean
  emptyState?: ReactNode
  loadingSkeletonCount?: number
  testId?: string
}

export function InfiniteList<T>({
  items,
  renderItem,
  sentinelRef,
  status,
  error,
  isFetchingNextPage,
  hasNextPage,
  emptyState,
  loadingSkeletonCount = 5,
  testId = 'infinite-list',
}: InfiniteListProps<T>) {
  // ── Loading (initial) ─────────────────────────────────────
  if (status === 'pending') {
    return (
      <div data-testid={`${testId}-loading`} aria-busy="true" aria-label="Loading">
        {Array.from({ length: loadingSkeletonCount }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div
        data-testid={`${testId}-error`}
        role="alert"
        style={{
          padding: 'var(--space-8) var(--space-4)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          style={{ margin: '0 auto var(--space-3)' }}
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M12 8v4m0 4h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <p style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-1)' }}>
          Something went wrong
        </p>
        <p style={{ fontSize: 'var(--text-sm)' }}>
          {error?.message ?? 'Failed to load content'}
        </p>
      </div>
    )
  }

  // ── Empty ─────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div data-testid={`${testId}-empty`}>
        {emptyState}
      </div>
    )
  }

  // ── Loaded ────────────────────────────────────────────────
  return (
    <div data-testid={testId}>
      {items.map((item, i) => renderItem(item, i))}

      {/* Sentinel for IntersectionObserver */}
      <div
        ref={sentinelRef as (node: HTMLDivElement | null) => void}
        data-testid={`${testId}-sentinel`}
        aria-hidden="true"
        style={{ height: '1px' }}
      />

      {/* Fetching next page */}
      {isFetchingNextPage && (
        <div data-testid={`${testId}-fetching`} aria-busy="true">
          <PostCardSkeleton />
        </div>
      )}

      {/* End of list */}
      {!hasNextPage && items.length > 0 && (
        <div
          data-testid={`${testId}-end`}
          style={{
            padding: 'var(--space-6)',
            textAlign: 'center',
            color: 'var(--color-text-dimmed)',
            fontSize: 'var(--text-sm)',
          }}
        >
          You've reached the end
        </div>
      )}
    </div>
  )
}
