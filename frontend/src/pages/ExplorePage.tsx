// ============================================================
// ExplorePage — /explore
// Trending hashtags list + search entry point.
// Each trend links to /tag/:tag.
// ============================================================

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/lib/api/search'
import { queryKeys } from '@/lib/cache/queryKeys'
import { SearchTypeahead } from '@/features/search/SearchTypeahead'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import type { TrendDto } from '@/types/api'
import { useNavigate } from 'react-router-dom'

// ── Trend item ────────────────────────────────────────────

function TrendItem({ trend, rank }: { trend: TrendDto; rank: number }) {
  return (
    <Link
      to={`/tag/${trend.tag}`}
      data-testid={`trend-item-${trend.tag}`}
      aria-label={`#${trend.tag} — ${trend.postCount.toLocaleString()} posts`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid var(--color-border)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background var(--duration-fast)',
      }}
    >
      {/* Rank */}
      <span
        style={{
          fontSize: 'var(--text-lg)',
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--font-weight-bold)',
          color: 'var(--color-text-muted)',
          minWidth: '1.5rem',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {rank}
      </span>

      {/* Tag info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-semibold)',
            fontSize: 'var(--text-base)',
            color: 'var(--color-text)',
            margin: 0,
          }}
        >
          #{trend.tag}
        </p>
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            margin: '2px 0 0',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
          }}
        >
          <span>{trend.postCount.toLocaleString()} posts</span>
          {trend.postsInWindow > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span
                style={{
                  color: trend.postsInWindow > 100 ? 'var(--color-like)' : 'var(--color-repost)',
                  fontWeight: 'var(--font-weight-semibold)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2L2 22l10-5 10 5L12 2z" />
                </svg>
                {trend.postsInWindow.toLocaleString()} trending
              </span>
            </>
          )}
        </p>
      </div>

      {/* Arrow */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
      >
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

// ── Skeleton ──────────────────────────────────────────────

function TrendSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <Skeleton width={24} height={24} radius="sm" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <Skeleton width={160} height={16} radius="sm" />
        <Skeleton width={100} height={12} radius="sm" />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function ExplorePage() {
  const navigate = useNavigate()
  const { data, status, error } = useQuery({
    queryKey: queryKeys.search.trends(),
    queryFn: () => searchApi.getTrends(),
    staleTime: 5 * 60_000, // Trends cached 5min
    gcTime: 10 * 60_000,
  })

  const handleSearch = (q: string) => {
    if (q.startsWith('#')) {
      navigate(`/tag/${q.slice(1)}`)
    } else if (q.startsWith('@')) {
      navigate(`/@${q.slice(1)}`)
    } else {
      navigate(`/search?q=${encodeURIComponent(q)}&type=top`)
    }
  }

  return (
    <div data-testid="explore-page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-border)',
          padding: '0.75rem 1rem',
          zIndex: 11,
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-text)',
            marginBottom: '0.75rem',
          }}
        >
          Explore
        </h1>
        <SearchTypeahead onSearch={handleSearch} placeholder="Search posts, people, tags…" />
      </header>

      {/* Trending section */}
      <section aria-label="Trending topics">
        <div
          style={{
            padding: '0.875rem 1rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
            }}
          >
            Trending now
          </h2>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
            }}
          >
            Updated every 5 min
          </span>
        </div>

        {status === 'pending' && (
          <div data-testid="trends-loading">
            {Array.from({ length: 8 }).map((_, i) => (
              <TrendSkeleton key={i} />
            ))}
          </div>
        )}

        {status === 'error' && (
          <EmptyState
            title="Couldn't load trends"
            description={(error as Error)?.message ?? 'Check your connection.'}
          />
        )}

        {status === 'success' && data.trends.length === 0 && (
          <EmptyState
            title="No trending topics"
            description="Check back later for what's trending."
          />
        )}

        {status === 'success' && data.trends.length > 0 && (
          <div data-testid="trends-list">
            {data.trends.map((trend, idx) => (
              <TrendItem key={trend.tag} trend={trend} rank={idx + 1} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
