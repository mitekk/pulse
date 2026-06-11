// ============================================================
// HomePage — home timeline with "N new posts" pill
//
// - WS-driven newCount via timelineBufferStore
// - NEVER auto-injects new posts
// - Clicking pill: flush store → invalidate timeline → scroll top
// - Pull-to-refresh via "refresh" button on mobile
// - "Back to top" button when scrolled down
// ============================================================

import { useRef, useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTimelineBufferStore } from '@/lib/stores/timelineBufferStore'
import { queryKeys } from '@/lib/cache/queryKeys'
import { useHomeTimeline } from '@/features/timeline/useHomeTimeline'
import { PostCard } from '@/components/PostCard'
import { PostComposer } from '@/features/composer/PostComposer'
import { InfiniteList } from '@/components/InfiniteList'
import { EmptyState } from '@/components/EmptyState'
import type { PostDto } from '@/types/api'

// ── "N new posts" pill ─────────────────────────────────────

function NewPostsPill({
  count,
  onFlush,
}: {
  count: number
  onFlush: () => void
}) {
  return (
    <button
      data-testid="new-posts-pill"
      onClick={onFlush}
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'sticky',
        top: 'calc(var(--shell-header-height) + var(--space-3))',
        zIndex: 'var(--z-sticky)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        margin: '0 auto var(--space-3)',
        padding: 'var(--space-2) var(--space-4)',
        background: 'var(--color-accent-strong)',
        color: 'var(--color-accent-contrast)',
        borderRadius: 'var(--radius-full)',
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--font-weight-semibold)',
        fontSize: 'var(--text-sm)',
        boxShadow: 'var(--shadow-md)',
        border: 'none',
        cursor: 'pointer',
        width: 'fit-content',
        transition: 'background var(--duration-base) var(--ease-spring)',
        animation: 'pill-pop 0.3s var(--ease-spring)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {count} new {count === 1 ? 'post' : 'posts'}
    </button>
  )
}

// ── Back-to-top button ────────────────────────────────────

function BackToTop() {
  return (
    <button
      data-testid="back-to-top"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        bottom: 'calc(var(--shell-bottom-tab-height, 0px) + var(--space-6))',
        right: 'var(--space-4)',
        width: '42px',
        height: '42px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
        cursor: 'pointer',
        zIndex: 'var(--z-sticky)',
        transition: 'opacity var(--duration-base)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

// ── HomeHeader ─────────────────────────────────────────────

function HomeHeader({ onRefresh }: { onRefresh: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        height: 'var(--shell-header-height)',
        background: 'rgba(14,14,15,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-4)',
        zIndex: 'var(--z-sticky)',
        flexShrink: 0,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-md)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text)',
        }}
      >
        Home
      </h1>

      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        {/* Refresh button */}
        <button
          data-testid="timeline-refresh"
          aria-label="Refresh timeline"
          onClick={onRefresh}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-full)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Compose */}
        <button
          data-testid="compose-button-home"
          aria-label="Compose new post"
          onClick={() => navigate('/compose', { state: { background: location } })}
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-accent-strong)',
            color: 'var(--color-accent-contrast)',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-semibold)',
            fontSize: 'var(--text-sm)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Post
        </button>
      </div>
    </header>
  )
}

// ── HomePage ───────────────────────────────────────────────

export default function HomePage() {
  const qc = useQueryClient()
  const newCount = useTimelineBufferStore((s) => s.newCount)
  const flush = useTimelineBufferStore((s) => s.flush)
  const feedRef = useRef<HTMLDivElement>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const {
    items,
    sentinelRef,
    status,
    error,
    isFetchingNextPage,
    hasNextPage,
    refetch,
  } = useHomeTimeline()

  // Back-to-top visibility
  const handleScroll = useCallback(() => {
    setShowBackToTop(window.scrollY > 600)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleFlushNewPosts = useCallback(() => {
    flush()
    // Invalidate + refetch home timeline (not refetchType: none — we DO want fresh data)
    void qc.invalidateQueries({ queryKey: queryKeys.timeline.home() })
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [flush, qc])

  const handleRefresh = useCallback(() => {
    flush()
    refetch()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [flush, refetch])

  return (
    <>
      {/* Inject keyframe for pill pop animation */}
      <style>{`
        @keyframes pill-pop {
          0%   { transform: translateY(-8px) scale(0.9); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      <HomeHeader onRefresh={handleRefresh} />

      {/* New-posts pill */}
      {newCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <NewPostsPill count={newCount} onFlush={handleFlushNewPosts} />
        </div>
      )}

      {/* Inline composer */}
      <div
        data-testid="home-composer"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <PostComposer mode="new" />
      </div>

      {/* Timeline feed */}
      <div ref={feedRef}>
        <InfiniteList<PostDto>
          items={items}
          renderItem={(post) => (
            <PostCard key={post.id} post={post} />
          )}
          sentinelRef={sentinelRef}
          status={status}
          error={error}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          emptyState={
            <EmptyState
              title="No posts yet"
              description="Follow some people to see their posts here, or post something yourself."
            />
          }
          testId="home-timeline"
        />
      </div>

      {/* Back to top */}
      {showBackToTop && <BackToTop />}
    </>
  )
}
