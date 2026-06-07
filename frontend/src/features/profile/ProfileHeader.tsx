// ============================================================
// ProfileHeader — banner + overlapping avatar, name, bio,
// follow stats, FollowButton, and overflow menu (mute/block/report)
// ============================================================

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Avatar } from '@/components/Avatar'
import { FollowButton } from '@/components/FollowButton'
import { Menu } from '@/components/Menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { followApi } from '@/lib/api/follow'
import { queryKeys } from '@/lib/cache/queryKeys'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import type { ProfileDto } from '@/types/api'

interface ProfileHeaderProps {
  profile: ProfileDto
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function JoinDate({ createdAt }: { createdAt: string }) {
  const date = new Date(createdAt)
  const formatted = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: 'var(--text-sm)',
        color: 'var(--color-text-muted)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Joined {formatted}
    </span>
  )
}

function VerifiedMark() {
  return (
    <span
      aria-label="Verified account"
      data-testid="verified-mark"
      style={{ color: 'var(--color-accent)', display: 'inline-flex', alignItems: 'center' }}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1l1.6 2.3 2.7-.8-.4 2.8 2.1 1.9-2.1 1.9.4 2.8-2.7-.8L8 15l-1.6-2.3-2.7.8.4-2.8L2 8.8l2.1-1.9-.4-2.8 2.7.8z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}

function PrivateLock() {
  return (
    <span
      aria-label="Private account"
      data-testid="private-lock"
      style={{ color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center' }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path
          d="M7 11V7a5 5 0 0110 0v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const [showMuteConfirm, setShowMuteConfirm] = useState(false)

  const isSelf = currentUser?.id === profile.id || currentUser?.handle === profile.handle
  const viewer = profile.viewer
  const isMuted = viewer?.muted ?? false
  const isBlocked = viewer?.blocked ?? false

  // ── Block mutation ─────────────────────────────────────
  const blockMutation = useMutation({
    mutationFn: (): Promise<void> =>
      isBlocked
        ? followApi.unblock(profile.handle)
        : followApi.block(profile.handle).then(() => undefined),
    onSettled: () => {
      setShowBlockConfirm(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(profile.handle) })
    },
  })

  // ── Mute mutation ──────────────────────────────────────
  const muteMutation = useMutation({
    mutationFn: (): Promise<void> =>
      isMuted
        ? followApi.unmute(profile.handle)
        : followApi.mute(profile.handle).then(() => undefined),
    onSettled: () => {
      setShowMuteConfirm(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(profile.handle) })
    },
  })

  const menuItems = isSelf
    ? []
    : [
        {
          label: isMuted ? 'Unmute @' + profile.handle : 'Mute @' + profile.handle,
          onClick: () => setShowMuteConfirm(true),
          testId: 'profile-menu-mute',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M5.586 15H4a2 2 0 01-2-2v-2a2 2 0 012-2h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M17 9l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ),
        },
        {
          label: isBlocked ? 'Unblock @' + profile.handle : 'Block @' + profile.handle,
          onClick: () => setShowBlockConfirm(true),
          danger: true,
          testId: 'profile-menu-block',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.636 5.636l12.728 12.728" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ),
        },
        {
          label: 'Report @' + profile.handle,
          onClick: () => navigate(`/report?targetType=user&targetId=${profile.id}`),
          danger: true,
          testId: 'profile-menu-report',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M4 22v-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ),
        },
        {
          label: 'Copy link to profile',
          onClick: () => void navigator.clipboard.writeText(window.location.origin + '/@' + profile.handle),
          testId: 'profile-menu-copy-link',
          icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M10 14a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 10a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ),
        },
      ]

  return (
    <>
      {/* ── Banner ──────────────────────────────────────────── */}
      <div
        data-testid="profile-banner"
        style={{
          width: '100%',
          height: '200px',
          background: profile.bannerUrl
            ? `url(${profile.bannerUrl}) center/cover no-repeat`
            : 'linear-gradient(135deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
          position: 'relative',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        {profile.bannerUrl && (
          <img
            src={profile.bannerUrl}
            alt=""
            loading="lazy"
            width={600}
            height={200}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        )}
      </div>

      {/* ── Avatar row ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          padding: '0 1rem',
          marginTop: '-48px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Avatar overlapping banner */}
        <div
          data-testid="profile-avatar-wrapper"
          style={{
            borderRadius: 'var(--radius-full)',
            border: '4px solid var(--color-bg)',
            background: 'var(--color-bg)',
            flexShrink: 0,
          }}
        >
          <Avatar
            src={profile.avatarUrl}
            displayName={profile.displayName}
            handle={profile.handle}
            size="xl"
            isVerified={profile.isVerified}
          />
        </div>

        {/* Actions row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '3.25rem', // push down from banner
          }}
        >
          {/* Overflow menu — not for self */}
          {!isSelf && menuItems.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                data-testid="profile-menu-trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More options"
                aria-expanded={menuOpen}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                </svg>
              </button>

              {menuOpen && (
                <Menu items={menuItems} onClose={() => setMenuOpen(false)} align="right" />
              )}
            </div>
          )}

          <FollowButton
            handle={profile.handle}
            userId={profile.id}
            isPrivate={profile.isPrivate}
            viewerFlags={viewer ?? undefined}
            testId="profile-follow-button"
          />
        </div>
      </div>

      {/* ── Profile info ────────────────────────────────────── */}
      <div
        data-testid="profile-info"
        style={{
          padding: '0.75rem 1rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {/* Name + verified */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          <h1
            data-testid="profile-display-name"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 400,
              color: 'var(--color-text)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {profile.displayName}
          </h1>
          {profile.isVerified && <VerifiedMark />}
          {profile.isPrivate && <PrivateLock />}
        </div>

        {/* Handle */}
        <p
          data-testid="profile-handle"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
            margin: 0,
          }}
        >
          @{profile.handle}
        </p>

        {/* Bio */}
        {profile.bio && (
          <p
            data-testid="profile-bio"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--color-text)',
              lineHeight: 'var(--leading-relaxed)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {profile.bio}
          </p>
        )}

        {/* Location / website / join date */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem 1.25rem',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {profile.location && (
            <span
              data-testid="profile-location"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
                <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {profile.location}
            </span>
          )}
          {profile.website && (
            <a
              data-testid="profile-website"
              href={
                profile.website.startsWith('http')
                  ? profile.website
                  : `https://${profile.website}`
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                color: 'var(--color-accent)',
                textDecoration: 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M12 3c-2.5 3-2.5 9 0 18M12 3c2.5 3 2.5 9 0 18M3 12h18"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              {profile.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          <JoinDate createdAt={profile.createdAt} />
        </div>

        {/* Follower/Following counts */}
        <div
          style={{ display: 'flex', gap: '1.25rem', marginTop: '0.125rem', flexWrap: 'wrap' }}
        >
          <Link
            to={`/@${profile.handle}/following`}
            data-testid="profile-following-count"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: '0.25rem',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span
              style={{
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text)',
              }}
            >
              {formatCount(profile.counts.following)}
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>Following</span>
          </Link>
          <Link
            to={`/@${profile.handle}/followers`}
            data-testid="profile-followers-count"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: '0.25rem',
              fontSize: 'var(--text-sm)',
            }}
          >
            <span
              style={{
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text)',
              }}
            >
              {formatCount(profile.counts.followers)}
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>Followers</span>
          </Link>
        </div>
      </div>

      {/* ── Confirm dialogs ──────────────────────────────────── */}
      <ConfirmDialog
        isOpen={showBlockConfirm}
        onClose={() => setShowBlockConfirm(false)}
        onConfirm={() => blockMutation.mutate()}
        title={isBlocked ? `Unblock @${profile.handle}?` : `Block @${profile.handle}?`}
        description={
          isBlocked
            ? `@${profile.handle} will be able to follow you and view your posts again.`
            : `@${profile.handle} will no longer be able to interact with your account.`
        }
        confirmLabel={isBlocked ? 'Unblock' : 'Block'}
        danger={!isBlocked}
        isLoading={blockMutation.isPending}
      />
      <ConfirmDialog
        isOpen={showMuteConfirm}
        onClose={() => setShowMuteConfirm(false)}
        onConfirm={() => muteMutation.mutate()}
        title={isMuted ? `Unmute @${profile.handle}?` : `Mute @${profile.handle}?`}
        description={
          isMuted
            ? `You will start seeing posts from @${profile.handle} again.`
            : `You won't see posts from @${profile.handle} in your timeline.`
        }
        confirmLabel={isMuted ? 'Unmute' : 'Mute'}
        isLoading={muteMutation.isPending}
      />
    </>
  )
}
