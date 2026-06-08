// ============================================================
// BookmarksPage — the viewer's saved posts.
//
// Bookmarks are private (spec §3.4). Cursor-paginated infinite list of the
// authenticated user's bookmarked posts via GET /api/v1/bookmarks.
// ============================================================

import { useInfiniteList } from '@/hooks/useInfiniteList'
import { engagementApi } from '@/lib/api/engagement'
import { queryKeys } from '@/lib/cache/queryKeys'
import { PostCard } from '@/components/PostCard'
import { InfiniteList } from '@/components/InfiniteList'
import { EmptyState } from '@/components/EmptyState'
import type { PostDto } from '@/types/api'

function BookmarksHeader() {
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
        Bookmarks
      </h1>
    </header>
  )
}

export default function BookmarksPage() {
  const {
    items,
    sentinelRef,
    status,
    error,
    isFetchingNextPage,
    hasNextPage,
  } = useInfiniteList<PostDto>({
    queryKey: queryKeys.timeline.bookmarks(),
    queryFn: ({ pageParam }) =>
      engagementApi.getBookmarks((pageParam as string | null) ?? undefined),
    // Bookmarks change only on explicit user action; keep them fresh-ish.
    staleTime: 30_000,
  })

  return (
    <>
      <BookmarksHeader />

      <InfiniteList<PostDto>
        items={items}
        renderItem={(post) => <PostCard key={post.id} post={post} />}
        sentinelRef={sentinelRef}
        status={status}
        error={error}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        emptyState={
          <EmptyState
            title="No bookmarks yet"
            description="Tap the bookmark icon on any post to save it here for later."
          />
        }
        testId="bookmarks-list"
      />
    </>
  )
}
