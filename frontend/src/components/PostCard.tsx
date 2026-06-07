// ============================================================
// PostCard — all post variants:
//   normal     — regular post
//   reply      — shows "replying to @handle" attribution
//   repost     — "reposted by X" header + inner original post
//   quote      — body + embedded shallow card of quoteOf
//   tombstone  — post.deleted = true → "This post was deleted"
//
// Engagement mutations are wired via useEngagement hooks.
// ============================================================

import { useNavigate } from 'react-router-dom'
import type { PostDto } from '@/types/api'
import { Avatar } from './Avatar'
import { RelativeTime } from './RelativeTime'
import { RichText } from './RichText'
import { MediaGrid } from './MediaGrid'
import { ActionBar } from './ActionBar'
import {
  useLike,
  useUnlike,
  useRepost,
  useUnrepost,
  useBookmark,
  useUnbookmark,
} from '@/features/engagement/useEngagement'

// ── Icon helpers ───────────────────────────────────────────

function RepostIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 16V8m0 0L4 11m3-3l3 3M17 8v8m0 0l3-3m-3 3l-3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// ── Shallow QuoteCard (no recursion) ───────────────────────

function QuoteCard({ post }: { post: PostDto }) {
  const navigate = useNavigate()

  if (post.deleted) {
    return (
      <div
        data-testid="quote-card-tombstone"
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3)',
          marginTop: 'var(--space-3)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-sm)',
          fontStyle: 'italic',
        }}
      >
        This post was deleted
      </div>
    )
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/@${post.author.handle}/status/${post.id}`)
  }

  return (
    <div
      data-testid="quote-card"
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e as unknown as React.MouseEvent)}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-3)',
        marginTop: 'var(--space-3)',
        cursor: 'pointer',
        transition: 'background var(--duration-fast)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-raised)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      {/* Author line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
        <Avatar
          src={post.author.avatarUrl}
          displayName={post.author.displayName}
          handle={post.author.handle}
          size="xs"
          isVerified={post.author.isVerified}
        />
        <span
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
          }}
        >
          {post.author.displayName}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          @{post.author.handle}
        </span>
        <RelativeTime date={post.createdAt} />
      </div>

      {/* Text */}
      {post.text && (
        <RichText text={post.text} entities={post.entities} />
      )}

      {/* First image preview */}
      {(post.media?.length ?? 0) > 0 && post.media[0].variants.thumb && (
        <img
          src={post.media[0].variants.thumb}
          alt={post.media[0].altText ?? ''}
          loading="lazy"
          width={post.media[0].width ?? undefined}
          height={post.media[0].height ?? undefined}
          style={{
            marginTop: 'var(--space-2)',
            borderRadius: 'var(--radius-md)',
            maxHeight: '120px',
            objectFit: 'cover',
            width: '100%',
          }}
        />
      )}
    </div>
  )
}

// ── Main PostCard ──────────────────────────────────────────

interface PostCardProps {
  post: PostDto
  /** Suppress click-to-thread navigation (used in thread views) */
  noNavigate?: boolean
  /** Show as embedded variant (smaller, no bottom border) */
  embedded?: boolean
}

export function PostCard({ post, noNavigate = false, embedded = false }: PostCardProps) {
  const navigate = useNavigate()
  const like = useLike()
  const unlikeMut = useUnlike()
  const repost = useRepost()
  const unrepost = useUnrepost()
  const bookmark = useBookmark()
  const unbookmark = useUnbookmark()

  // ── Tombstone ────────────────────────────────────────────
  if (post.deleted) {
    return (
      <article
        data-testid="post-card-tombstone"
        style={{
          padding: 'var(--space-4)',
          borderBottom: embedded ? 'none' : '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          fontStyle: 'italic',
          fontSize: 'var(--text-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        This post was deleted
      </article>
    )
  }

  // ── Repost wrapper: show "reposted by X" + inner original ─
  if (post.repostOf) {
    return (
      <article
        data-testid="post-card-repost"
        style={{
          borderBottom: embedded ? 'none' : '1px solid var(--color-border)',
        }}
      >
        {/* Repost attribution header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: `var(--space-2) var(--space-4) 0 calc(var(--space-4) + 40px + var(--space-3))`,
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          <RepostIcon />
          {post.author.displayName} reposted
        </div>

        {/* Inner original post */}
        <PostCard post={post.repostOf} noNavigate={noNavigate} embedded />
      </article>
    )
  }

  // ── Reposted-by header (from timeline feed context) ───────
  const repostedByBanner = post.repostedBy && (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        paddingBottom: 'var(--space-1)',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-weight-medium)',
      }}
    >
      <RepostIcon />
      {post.repostedBy.displayName} reposted
    </div>
  )

  // ── Navigate to thread on card click ─────────────────────
  const handleCardClick = () => {
    if (!noNavigate) {
      navigate(`/@${post.author.handle}/status/${post.id}`)
    }
  }

  return (
    <article
      data-testid="post-card"
      onClick={handleCardClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-4)',
        borderBottom: embedded ? 'none' : '1px solid var(--color-border)',
        cursor: noNavigate ? 'default' : 'pointer',
        transition: 'background var(--duration-fast)',
      }}
      onMouseEnter={(e) => {
        if (!noNavigate)
          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)'
      }}
      onMouseLeave={(e) => {
        if (!noNavigate)
          (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {repostedByBanner}

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        {/* Avatar column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button
            data-testid={`avatar-link-${post.author.handle}`}
            aria-label={`View ${post.author.displayName}'s profile`}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/@${post.author.handle}`)
            }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <Avatar
              src={post.author.avatarUrl}
              displayName={post.author.displayName}
              handle={post.author.handle}
              size="md"
              isVerified={post.author.isVerified}
            />
          </button>
        </div>

        {/* Content column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Author line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-1)',
            }}
          >
            <button
              data-testid={`author-name-${post.author.handle}`}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/@${post.author.handle}`)
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--text-base)',
                color: 'var(--color-text)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
              }}
            >
              {post.author.displayName}
              {post.author.isVerified && (
                <span
                  aria-label="Verified account"
                  title="Verified"
                  style={{ color: 'var(--color-accent)', display: 'inline-flex' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </span>
              )}
            </button>

            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-muted)',
              }}
            >
              @{post.author.handle}
            </span>

            {post.author.isVerified && (
              <LockIcon />
            )}

            <span style={{ color: 'var(--color-text-dimmed)', fontSize: 'var(--text-sm)' }}>·</span>

            <button
              data-testid={`post-time-${post.id}`}
              aria-label={`View post from ${new Date(post.createdAt).toLocaleString()}`}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/@${post.author.handle}/status/${post.id}`)
              }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <RelativeTime date={post.createdAt} />
            </button>
          </div>

          {/* Reply context */}
          {post.replyToId && (
            <div
              data-testid="replying-to"
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Replying to a post
            </div>
          )}

          {/* Post text */}
          {post.text && (
            <RichText text={post.text} entities={post.entities} />
          )}

          {/* Media */}
          {(post.media?.length ?? 0) > 0 && (
            <MediaGrid
              media={post.media}
              postId={post.id}
              authorHandle={post.author.handle}
            />
          )}

          {/* Quote embed */}
          {post.quoteOf && (
            <QuoteCard post={post.quoteOf} />
          )}

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
        </div>
      </div>
    </article>
  )
}
