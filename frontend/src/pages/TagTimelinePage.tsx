// ============================================================
// TagTimelinePage — /tag/:tag
// Shows posts with a given hashtag using /timeline/hashtag/:tag
// Reachable from: Explore trends, RichText hashtag links
// ============================================================

import { useParams, Link } from 'react-router-dom'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { timelineApi } from '@/lib/api/timeline'
import { queryKeys } from '@/lib/cache/queryKeys'
import { PostCard } from '@/components/PostCard'
import { ScrollSentinel } from '@/components/ScrollSentinel'
import { PostCardSkeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import type { PostDto } from '@/types/api'

export default function TagTimelinePage() {
  const { tag } = useParams<{ tag: string }>()
  const normalizedTag = (tag ?? '').toLowerCase().replace(/^#/, '')

  const { items, status, error, sentinelRef, isFetchingNextPage } = useInfiniteList<PostDto>({
    queryKey: queryKeys.timeline.hashtag(normalizedTag),
    queryFn: ({ pageParam }) =>
      timelineApi.getHashtag(normalizedTag, (pageParam as string | null) ?? undefined),
    staleTime: 60_000,
    enabled: normalizedTag.length > 0,
  })

  return (
    <div data-testid={`tag-timeline-page-${normalizedTag}`} style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          padding: '0.875rem 1rem',
          zIndex: 11,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <Link
          to="/explore"
          data-testid="tag-timeline-back"
          aria-label="Back to Explore"
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--color-text-muted)',
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
              lineHeight: 1,
            }}
          >
            #{normalizedTag}
          </h1>
          {status === 'success' && (
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-muted)',
                marginTop: '2px',
              }}
            >
              {items.length > 0 ? `${items.length}+ posts` : 'Tag timeline'}
            </p>
          )}
        </div>
      </header>

      {/* Posts */}
      {status === 'pending' && (
        <div data-testid="tag-timeline-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          title="Couldn't load posts"
          description={(error as Error)?.message ?? 'Something went wrong.'}
        />
      )}

      {status === 'success' && items.length === 0 && (
        <EmptyState
          title={`No posts for #${normalizedTag}`}
          description="Be the first to use this hashtag."
        />
      )}

      {status === 'success' && items.length > 0 && (
        <div>
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          <ScrollSentinel sentinelRef={sentinelRef} isFetchingNextPage={isFetchingNextPage} />
        </div>
      )}
    </div>
  )
}
