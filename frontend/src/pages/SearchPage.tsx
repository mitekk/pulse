// ============================================================
// SearchPage — /search?q=&type=
// Tabs: Top | Latest | People | Media
// Each tab is its own infinite list with independent query key.
// URL params: q (query), type (tab)
// Short-circuits: #tag → /tag/:tag, @handle → /@handle
// ============================================================

import { useNavigate, useSearchParams } from 'react-router-dom'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { searchApi } from '@/lib/api/search'
import type { SearchType } from '@/lib/api/search'
import { queryKeys } from '@/lib/cache/queryKeys'
import { PostCard } from '@/components/PostCard'
import { UserRow } from '@/components/UserCard'
import { SearchTypeahead } from '@/features/search/SearchTypeahead'
import { ScrollSentinel } from '@/components/ScrollSentinel'
import { PostCardSkeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import type { PostDto, UserCardDto } from '@/types/api'

// ── Tab config ────────────────────────────────────────────

const TABS: { key: SearchType; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'latest', label: 'Latest' },
  { key: 'people', label: 'People' },
  { key: 'media', label: 'Media' },
]

function SearchTabBar({
  active,
  onChange,
}: {
  active: SearchType
  onChange: (t: SearchType) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Search result type"
      data-testid="search-tabs"
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          data-testid={`search-tab-${tab.key}`}
          onClick={() => onChange(tab.key)}
          style={{
            flex: 1,
            minWidth: '64px',
            padding: '0.875rem 0.5rem',
            fontFamily: 'var(--font-body)',
            fontWeight: active === tab.key ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
            fontSize: 'var(--text-sm)',
            color: active === tab.key ? 'var(--color-text)' : 'var(--color-text-muted)',
            borderBottom: active === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
            transition: 'color var(--duration-fast), border-color var(--duration-fast)',
            whiteSpace: 'nowrap',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Results per tab ────────────────────────────────────────

function SearchResults({ q, type }: { q: string; type: SearchType }) {
  const { items, status, error, sentinelRef, isFetchingNextPage } = useInfiniteList<
    PostDto | UserCardDto
  >({
    queryKey: queryKeys.search.results(q, type),
    queryFn: ({ pageParam }) =>
      searchApi.search(q, type, (pageParam as string | null) ?? undefined),
    staleTime: 60_000,
    enabled: q.length > 0,
  })

  if (status === 'pending') {
    return (
      <div data-testid={`search-results-loading-${type}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <EmptyState
        title="Search failed"
        description={(error as Error)?.message ?? 'Something went wrong.'}
      />
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={`No ${type === 'people' ? 'people' : 'posts'} found`}
        description={`No results for "${q}". Try different keywords.`}
      />
    )
  }

  if (type === 'people') {
    return (
      <div data-testid="search-results-people">
        {(items as UserCardDto[]).map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
        <ScrollSentinel sentinelRef={sentinelRef} isFetchingNextPage={isFetchingNextPage} />
      </div>
    )
  }

  return (
    <div data-testid={`search-results-${type}`}>
      {(items as PostDto[]).map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      <ScrollSentinel sentinelRef={sentinelRef} isFetchingNextPage={isFetchingNextPage} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') ?? ''
  const rawType = searchParams.get('type') ?? 'top'
  const type: SearchType = ['top', 'latest', 'people', 'media'].includes(rawType)
    ? (rawType as SearchType)
    : 'top'

  const handleSearch = (newQ: string) => {
    // Short-circuit routing
    if (newQ.startsWith('#')) {
      navigate(`/tag/${newQ.slice(1)}`)
      return
    }
    if (newQ.startsWith('@')) {
      navigate(`/@${newQ.slice(1)}`)
      return
    }
    setSearchParams({ q: newQ, type })
  }

  const handleTabChange = (newType: SearchType) => {
    setSearchParams({ q, type: newType })
  }

  return (
    <div data-testid="search-page" style={{ display: 'flex', flexDirection: 'column' }}>
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
        <SearchTypeahead
          onSearch={handleSearch}
          placeholder="Search posts and people…"
          defaultValue={q}
        />
      </header>

      {/* Show tabs only when there's a query */}
      {q && (
        <>
          <SearchTabBar active={type} onChange={handleTabChange} />
          <SearchResults key={`${q}:${type}`} q={q} type={type} />
        </>
      )}

      {!q && (
        <EmptyState
          title="Search PULSE"
          description="Find posts, people, and trending topics."
        />
      )}
    </div>
  )
}
