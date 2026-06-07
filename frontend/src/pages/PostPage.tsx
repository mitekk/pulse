// ============================================================
// PostPage — Thread view
// Route: /:handle/status/:postId
//
// Layout:
//   1. Ancestor chain (condensed cards with connector lines)
//   2. Focused post (full: larger text, full timestamp, ActionBar, view count)
//   3. Reply policy note + inline reply composer
//   4. Ranked replies via useInfiniteList
//
// WS: subscribes to post:{id} room for live counter updates.
// Self-threads: connected with vertical lines.
// Deleted nodes: tombstones.
// ============================================================

import { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/cache/queryKeys'
import { postsApi } from '@/lib/api/posts'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { PostCard } from '@/components/PostCard'
import { PostComposer } from '@/features/composer/PostComposer'
import { InfiniteList } from '@/components/InfiniteList'
import { Avatar } from '@/components/Avatar'
import { RichText } from '@/components/RichText'
import { MediaGrid } from '@/components/MediaGrid'
import { ActionBar } from '@/components/ActionBar'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { subscribePost, unsubscribePost } from '@/lib/realtime/roomManager'
import {
  useLike,
  useUnlike,
  useRepost,
  useUnrepost,
  useBookmark,
  useUnbookmark,
} from '@/features/engagement/useEngagement'
import { useAuthStore, selectUser } from '@/lib/auth/store'
import type { PostDto } from '@/types/api'

// ── Helper: format full date ──────────────────────────────

function formatFullDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Connector line between ancestor cards ────────────────

function ConnectorLine() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: '2px',
        flexGrow: 1,
        minHeight: '8px',
        background: 'var(--color-border)',
        margin: '2px auto',
        borderRadius: '1px',
      }}
    />
  )
}

// ── Ancestor card (condensed) ─────────────────────────────

function AncestorCard({ post, isLast }: { post: PostDto; isLast: boolean }) {
  const navigate = useNavigate()

  if (post.deleted) {
    return (
      <div
        data-testid="ancestor-tombstone"
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-sm)',
          fontStyle: 'italic',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '36px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-border)' }} />
          {!isLast && <ConnectorLine />}
        </div>
        <div style={{ paddingTop: '8px' }}>This post was deleted</div>
      </div>
    )
  }

  return (
    <div
      data-testid="ancestor-card"
      style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', cursor: 'pointer' }}
      onClick={() => navigate(`/@${post.author.handle}/status/${post.id}`)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '36px', flexShrink: 0 }}>
        <Avatar
          src={post.author.avatarUrl}
          displayName={post.author.displayName}
          handle={post.author.handle}
          size="sm"
          isVerified={post.author.isVerified}
        />
        {!isLast && <ConnectorLine />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
            {post.author.displayName}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            @{post.author.handle}
          </span>
        </div>
        {post.text && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
            <RichText text={post.text} entities={post.entities} />
          </div>
        )}
        {post.media.length > 0 && (
          <div style={{ marginTop: 'var(--space-2)', maxHeight: '80px', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
            <img
              src={post.media[0].variants.thumb ?? post.media[0].variants.small ?? ''}
              alt={post.media[0].altText ?? ''}
              loading="lazy"
              width={post.media[0].width ?? 80}
              height={post.media[0].height ?? 80}
              style={{ height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Focused post (full-size) ─────────────────────────────

function FocusedPost({ post }: { post: PostDto }) {
  const navigate = useNavigate()
  const like = useLike()
  const unlikeMut = useUnlike()
  const repost = useRepost()
  const unrepost = useUnrepost()
  const bookmark = useBookmark()
  const unbookmark = useUnbookmark()

  const REPLY_POLICY_LABELS: Record<string, string> = {
    everyone: 'Everyone can reply',
    following: 'People you follow can reply',
    mentioned: 'Only mentioned people can reply',
  }

  return (
    <article data-testid="focused-post" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
      {/* Author */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <button
          data-testid={`avatar-link-${post.author.handle}`}
          aria-label={`View ${post.author.displayName}'s profile`}
          onClick={() => navigate(`/@${post.author.handle}`)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <Avatar
            src={post.author.avatarUrl}
            displayName={post.author.displayName}
            handle={post.author.handle}
            size="lg"
            isVerified={post.author.isVerified}
          />
        </button>

        <div>
          <button
            data-testid={`author-name-${post.author.handle}`}
            onClick={() => navigate(`/@${post.author.handle}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontWeight: 'var(--font-weight-semibold)',
              fontSize: 'var(--text-md)',
              color: 'var(--color-text)',
            }}
          >
            {post.author.displayName}
            {post.author.isVerified && (
              <span aria-label="Verified" style={{ color: 'var(--color-accent)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </span>
            )}
          </button>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            @{post.author.handle}
          </div>
        </div>
      </div>

      {/* Text — larger */}
      {post.text && (
        <div
          style={{
            fontSize: 'var(--text-lg)',
            lineHeight: 'var(--leading-relaxed)',
            color: 'var(--color-text)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <RichText text={post.text} entities={post.entities} />
        </div>
      )}

      {/* Media */}
      {post.media.length > 0 && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <MediaGrid
            media={post.media}
            postId={post.id}
            authorHandle={post.author.handle}
          />
        </div>
      )}

      {/* Full timestamp */}
      <time
        data-testid="post-full-time"
        dateTime={post.createdAt}
        style={{
          display: 'block',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--color-border-subtle)',
          paddingBottom: 'var(--space-3)',
        }}
      >
        {formatFullDate(post.createdAt)}
      </time>

      {/* Stats row */}
      <div
        data-testid="post-stats"
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--color-border-subtle)',
          paddingBottom: 'var(--space-3)',
          fontSize: 'var(--text-sm)',
        }}
      >
        {post.counts.reposts > 0 && (
          <button
            data-testid="stat-reposts"
            onClick={() => navigate(`/@${post.author.handle}/status/${post.id}/reposts`)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text)' }}
          >
            <strong>{post.counts.reposts.toLocaleString()}</strong>
            <span style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }}>
              {post.counts.reposts === 1 ? 'Repost' : 'Reposts'}
            </span>
          </button>
        )}
        {post.counts.likes > 0 && (
          <button
            data-testid="stat-likes"
            onClick={() => navigate(`/@${post.author.handle}/status/${post.id}/likes`)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-text)' }}
          >
            <strong>{post.counts.likes.toLocaleString()}</strong>
            <span style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }}>
              {post.counts.likes === 1 ? 'Like' : 'Likes'}
            </span>
          </button>
        )}
        {post.counts.bookmarks > 0 && (
          <span style={{ color: 'var(--color-text-muted)' }}>
            <strong style={{ color: 'var(--color-text)' }}>{post.counts.bookmarks.toLocaleString()}</strong>
            {' '}Bookmarks
          </span>
        )}
      </div>

      {/* Action bar */}
      <ActionBar
        post={post}
        onLike={() => like.mutate(post.id)}
        onUnlike={() => unlikeMut.mutate(post.id)}
        onRepost={() => repost.mutate(post.id)}
        onUnrepost={() => unrepost.mutate(post.id)}
        onBookmark={() => bookmark.mutate(post.id)}
        onUnbookmark={() => unbookmark.mutate(post.id)}
      />

      {/* Reply policy */}
      <div
        data-testid="reply-policy-note"
        style={{
          marginTop: 'var(--space-3)',
          paddingTop: 'var(--space-2)',
          borderTop: '1px solid var(--color-border-subtle)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 2a14.5 14.5 0 010 20M2 12h20" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {REPLY_POLICY_LABELS[post.replyPolicy] ?? 'Everyone can reply'}
      </div>
    </article>
  )
}

// ── Can-reply logic ───────────────────────────────────────

function canViewerReply(
  post: PostDto,
  user: { id: string } | null,
): { allowed: boolean; reason?: string } {
  if (!user) return { allowed: false, reason: 'Sign in to reply' }
  if (post.replyPolicy === 'everyone') return { allowed: true }
  if (post.replyPolicy === 'mentioned') {
    const mentioned = post.entities.mentions.some((m) => m.userId === user.id)
    if (!mentioned) return { allowed: false, reason: 'Only mentioned people can reply to this post' }
  }
  if (post.replyPolicy === 'following') {
    // We don't have direct "following" in PostDto viewer — server enforces; client shows optimistically
    return { allowed: true }
  }
  return { allowed: true }
}

// ── PostPage ───────────────────────────────────────────────

export default function PostPage() {
  const { postId } = useParams<{ handle: string; postId: string }>()
  const user = useAuthStore(selectUser)
  const qc = useQueryClient()

  // ── Thread query ─────────────────────────────────────────
  const { data: threadData, status: threadStatus } = useQuery({
    queryKey: queryKeys.posts.thread(postId!),
    queryFn: () => postsApi.getThread(postId!),
    staleTime: 30_000,
    enabled: !!postId,
  })

  // ── Replies (infinite) ───────────────────────────────────
  const repliesQuery = useInfiniteList<PostDto>({
    queryKey: queryKeys.posts.replies(postId!),
    queryFn: ({ pageParam }) => postsApi.getReplies(postId!, pageParam ?? undefined),
    staleTime: 30_000,
    enabled: !!postId,
  })

  // ── WS room: subscribe to post:{id} for live counters ────
  useEffect(() => {
    if (!postId) return
    subscribePost(postId)
    return () => unsubscribePost(postId)
  }, [postId])

  // ── After reply success: invalidate thread ───────────────
  const handleReplySuccess = useCallback(() => {
    if (!postId) return
    void qc.invalidateQueries({ queryKey: queryKeys.posts.replies(postId) })
    void qc.invalidateQueries({ queryKey: queryKeys.posts.thread(postId) })
  }, [postId, qc])

  if (!postId) return <EmptyState title="Not found" description="Post not found." />

  if (threadStatus === 'pending') {
    return (
      <div data-testid="thread-loading" style={{ padding: 'var(--space-4)' }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height="80px" style={{ marginBottom: 'var(--space-3)' }} />)}
      </div>
    )
  }

  if (threadStatus === 'error' || !threadData) {
    return (
      <EmptyState
        title="Something went wrong"
        description="Could not load this post. It may have been deleted."
      />
    )
  }

  const { ancestors, post, replies: initialReplies } = threadData
  const viewerReply = canViewerReply(post, user)

  return (
    <div data-testid="thread-view">
      {/* Back nav */}
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
          gap: 'var(--space-4)',
          padding: '0 var(--space-4)',
          zIndex: 'var(--z-sticky)',
        }}
      >
        <button
          data-testid="thread-back"
          aria-label="Go back"
          onClick={() => window.history.back()}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text)',
          }}
        >
          Post
        </h1>
      </header>

      {/* Ancestor chain */}
      {ancestors.length > 0 && (
        <section data-testid="ancestor-chain" aria-label="Conversation context">
          {ancestors.map((ancestor, i) => (
            <AncestorCard
              key={ancestor.id}
              post={ancestor}
              isLast={i === ancestors.length - 1}
            />
          ))}
        </section>
      )}

      {/* Focused post */}
      <FocusedPost post={post} />

      {/* Reply composer */}
      <section
        data-testid="reply-composer-section"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {viewerReply.allowed ? (
          <PostComposer
            mode="reply"
            replyToId={post.id}
            replyToPost={post}
            onSuccess={handleReplySuccess}
            compact
          />
        ) : (
          <div
            data-testid="reply-disabled-notice"
            style={{
              padding: 'var(--space-4)',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {viewerReply.reason}
          </div>
        )}
      </section>

      {/* Ranked replies */}
      <section data-testid="replies-section" aria-label="Replies">
        {/* Pre-loaded replies from thread response */}
        {initialReplies.map((reply) => (
          <PostCard key={reply.id} post={reply} />
        ))}

        {/* Infinite replies (additional pages) */}
        <InfiniteList<PostDto>
          items={repliesQuery.items}
          renderItem={(reply) => <PostCard key={reply.id} post={reply} />}
          sentinelRef={repliesQuery.sentinelRef}
          status={repliesQuery.status}
          error={repliesQuery.error}
          isFetchingNextPage={repliesQuery.isFetchingNextPage}
          hasNextPage={repliesQuery.hasNextPage}
          emptyState={null}
          testId="replies-list"
        />
      </section>
    </div>
  )
}
