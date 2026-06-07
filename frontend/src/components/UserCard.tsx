// ============================================================
// UserCard / UserRow — compact user representation
// Used in followers/following lists, search results, etc.
// ============================================================

import { Link } from 'react-router-dom'
import { Avatar } from './Avatar'
import type { UserCardDto } from '@/types/api'
import { FollowButton } from './FollowButton'

interface UserRowProps {
  user: UserCardDto
  /** Optional override to show/hide follow button */
  showFollow?: boolean
  testId?: string
}

export function UserRow({ user, showFollow = true, testId }: UserRowProps) {
  return (
    <div
      data-testid={testId ?? `user-row-${user.handle}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <Link
        to={`/@${user.handle}`}
        aria-label={`View @${user.handle}'s profile`}
        style={{ flexShrink: 0, display: 'block' }}
      >
        <Avatar
          src={user.avatarUrl}
          displayName={user.displayName}
          handle={user.handle}
          size="md"
          isVerified={user.isVerified}
        />
      </Link>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <Link
          to={`/@${user.handle}`}
          data-testid={`user-row-link-${user.handle}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '160px',
            }}
          >
            {user.displayName}
          </span>
          {user.isVerified && (
            <span aria-label="Verified" style={{ color: 'var(--color-accent)', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1l1.6 2.3 2.7-.8-.4 2.8 2.1 1.9-2.1 1.9.4 2.8-2.7-.8L8 15l-1.6-2.3-2.7.8.4-2.8L2 8.8l2.1-1.9-.4-2.8 2.7.8z"
                  fill="currentColor"
                />
              </svg>
            </span>
          )}
          {user.isPrivate && (
            <span aria-label="Private account" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path
                  d="M7 11V7a5 5 0 0110 0v4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          )}
        </Link>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          @{user.handle}
        </span>
      </div>

      {showFollow && (
        <div style={{ flexShrink: 0 }}>
          <FollowButton
            handle={user.handle}
            userId={user.id}
            isPrivate={user.isPrivate}
            compact
          />
        </div>
      )}
    </div>
  )
}
