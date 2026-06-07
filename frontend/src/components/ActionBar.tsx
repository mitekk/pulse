// ============================================================
// ActionBar — post engagement actions
// Reply | Repost (menu: Repost | Quote) | Like | Bookmark | Share | Views
// ============================================================

import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { PostDto } from '@/types/api'

interface ActionBarProps {
  post: PostDto
  onReply?: () => void
  onLike?: () => void
  onUnlike?: () => void
  onRepost?: () => void
  onUnrepost?: () => void
  onBookmark?: () => void
  onUnbookmark?: () => void
}

// ── Icon components ────────────────────────────────────────

function ReplyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RepostIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 16V8m0 0L4 11m3-3l3 3M17 8v8m0 0l3-3m-3 3l-3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
        stroke={filled ? 'none' : 'currentColor'}
        fill={filled ? 'var(--color-accent)' : 'none'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 3a2 2 0 012-2h10a2 2 0 012 2v18l-7-3-7 3V3z"
        stroke={filled ? 'none' : 'currentColor'}
        fill={filled ? 'var(--color-accent)' : 'none'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ViewsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function QuoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zm12 0c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"
        fill="currentColor"
      />
    </svg>
  )
}

// ── Count formatting ───────────────────────────────────────

function formatCount(n: number): string {
  if (n === 0) return ''
  if (n < 1000) return String(n)
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n < 1_000_000) return Math.floor(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm'
}

// ── Action button ──────────────────────────────────────────

interface ActionButtonProps {
  label: string
  count?: number
  active?: boolean
  activeColor?: string
  onClick?: () => void
  testId: string
  children: React.ReactNode
}

function ActionButton({ label, count, active, activeColor = 'var(--color-accent)', onClick, testId, children }: ActionButtonProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      data-testid={testId}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 6px',
        borderRadius: 'var(--radius-full)',
        color: active ? activeColor : hovered ? activeColor : 'var(--color-text-muted)',
        fontSize: 'var(--text-sm)',
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'var(--font-body)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        transition: 'color var(--duration-fast)',
        userSelect: 'none',
      }}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)' }}>
          {formatCount(count)}
        </span>
      )}
    </button>
  )
}

// ── Repost menu ────────────────────────────────────────────

function RepostMenu({
  post,
  isReposted,
  onRepost,
  onUnrepost,
  onClose,
}: {
  post: PostDto
  isReposted: boolean
  onRepost: () => void
  onUnrepost: () => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div
      data-testid="repost-menu"
      role="menu"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 4px)',
        left: '-8px',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 'var(--z-dropdown)',
        padding: '0.375rem',
        minWidth: '160px',
      }}
    >
      <button
        role="menuitem"
        data-testid="repost-toggle"
        onClick={() => {
          if (isReposted) onUnrepost()
          else onRepost()
          onClose()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          width: '100%',
          padding: '0.625rem 0.875rem',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          color: isReposted ? 'var(--color-success)' : 'var(--color-text)',
          textAlign: 'left',
          fontFamily: 'var(--font-body)',
        }}
      >
        <RepostIcon filled={isReposted} />
        {isReposted ? 'Undo repost' : 'Repost'}
      </button>

      <button
        role="menuitem"
        data-testid="quote-post"
        onClick={() => {
          navigate(`/compose?quoteOf=${post.id}`, { state: { background: location } })
          onClose()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          width: '100%',
          padding: '0.625rem 0.875rem',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text)',
          textAlign: 'left',
          fontFamily: 'var(--font-body)',
        }}
      >
        <QuoteIcon />
        Quote
      </button>
    </div>
  )
}

// ── ActionBar ──────────────────────────────────────────────

export function ActionBar({
  post,
  onReply,
  onLike,
  onUnlike,
  onRepost,
  onUnrepost,
  onBookmark,
  onUnbookmark,
}: ActionBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [repostMenuOpen, setRepostMenuOpen] = useState(false)
  const repostRef = useRef<HTMLDivElement>(null)

  const isLiked = post.viewer?.liked ?? false
  const isReposted = post.viewer?.reposted ?? false
  const isBookmarked = post.viewer?.bookmarked ?? false

  const handleReplyClick = () => {
    if (onReply) {
      onReply()
    } else {
      navigate(`/@${post.author.handle}/status/${post.id}`, { state: { background: location } })
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/@${post.author.handle}/status/${post.id}`
    if (navigator.share) {
      try {
        await navigator.share({ url })
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <div
      data-testid="action-bar"
      role="group"
      aria-label="Post actions"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        marginTop: 'var(--space-2)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Reply */}
      <ActionButton
        testId="action-reply"
        label={`Reply (${post.counts.replies})`}
        count={post.counts.replies}
        onClick={handleReplyClick}
      >
        <ReplyIcon />
      </ActionButton>

      {/* Repost menu */}
      <div ref={repostRef} style={{ position: 'relative' }}>
        <ActionButton
          testId="action-repost"
          label={isReposted ? 'Undo repost' : 'Repost'}
          count={post.counts.reposts}
          active={isReposted}
          activeColor="var(--color-success)"
          onClick={() => setRepostMenuOpen((v) => !v)}
        >
          <RepostIcon filled={isReposted} />
        </ActionButton>

        {repostMenuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' }}
              onClick={() => setRepostMenuOpen(false)}
            />
            <RepostMenu
              post={post}
              isReposted={isReposted}
              onRepost={onRepost ?? (() => {})}
              onUnrepost={onUnrepost ?? (() => {})}
              onClose={() => setRepostMenuOpen(false)}
            />
          </>
        )}
      </div>

      {/* Like */}
      <ActionButton
        testId="action-like"
        label={isLiked ? 'Unlike' : 'Like'}
        count={post.counts.likes}
        active={isLiked}
        onClick={isLiked ? onUnlike : onLike}
      >
        <HeartIcon filled={isLiked} />
      </ActionButton>

      {/* Bookmark */}
      <ActionButton
        testId="action-bookmark"
        label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
        active={isBookmarked}
        onClick={isBookmarked ? onUnbookmark : onBookmark}
      >
        <BookmarkIcon filled={isBookmarked} />
      </ActionButton>

      {/* Views — decorative, no action */}
      {post.counts.replies !== undefined && (
        <ActionButton
          testId="action-views"
          label="Views"
          count={
            post.counts.replies + post.counts.reposts + post.counts.likes
          }
        >
          <ViewsIcon />
        </ActionButton>
      )}

      {/* Share */}
      <ActionButton
        testId="action-share"
        label="Share post"
        onClick={() => void handleShare()}
      >
        <ShareIcon />
      </ActionButton>
    </div>
  )
}
