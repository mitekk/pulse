// ============================================================
// ProfilePage — /:handle (posts/replies/media/likes/followers/following)
// Fetches the profile, renders ProfileHeader + ProfileTabs + feed
// Private-account lock: shows header + lock notice if viewer not following
// ============================================================

import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usersApi } from '@/lib/api/users'
import { queryKeys } from '@/lib/cache/queryKeys'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import { useInfiniteList } from '@/hooks/useInfiniteList'
import { ProfileHeader } from '@/features/profile/ProfileHeader'
import { ProfileTabs } from '@/features/profile/ProfileTabs'
import { ProfileMediaGrid } from '@/features/profile/ProfileMediaGrid'
import { PostCard } from '@/components/PostCard'
import { PostCardSkeleton, Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ScrollSentinel } from '@/components/ScrollSentinel'
import { UserRow } from '@/components/UserCard'
import { Seo } from '@/components/Seo'
import { truncate } from '@/lib/seo'
import type { PostDto, UserCardDto } from '@/types/api'

interface ProfilePageProps {
  tab: 'posts' | 'replies' | 'media' | 'likes' | 'followers' | 'following'
}

function ProfileHeaderSkeleton() {
  return (
    <div data-testid="profile-header-skeleton">
      {/* Banner */}
      <Skeleton height={200} radius="0" />
      {/* Avatar + actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 1rem',
          marginTop: '-48px',
        }}
      >
        <Skeleton width={96} height={96} radius="var(--radius-full)" />
        <div style={{ marginTop: '3.25rem' }}>
          <Skeleton width={96} height={34} radius="var(--radius-full)" />
        </div>
      </div>
      {/* Info */}
      <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Skeleton width={150} height={24} />
        <Skeleton width={100} height={16} />
        <Skeleton width="90%" height={16} />
        <Skeleton width="75%" height={16} />
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <Skeleton width={80} height={16} />
          <Skeleton width={80} height={16} />
        </div>
      </div>
    </div>
  )
}

// ── Private account lock ─────────────────────────────────────
function PrivateLockState({ handle }: { handle: string }) {
  return (
    <div
      data-testid="private-lock-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        gap: '0.75rem',
      }}
    >
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 400,
          color: 'var(--color-text)',
          margin: 0,
        }}
      >
        These posts are protected
      </h2>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          maxWidth: '32ch',
          lineHeight: 'var(--leading-relaxed)',
          margin: 0,
        }}
      >
        Only approved followers can see @{handle}&apos;s posts. Follow to send a request.
      </p>
    </div>
  )
}

// ── Post feed tab ─────────────────────────────────────────────
type FeedFetcher = (cursor?: string) => Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }>

function PostFeedTab({
  handle: _handle,
  queryKey,
  fetchFn,
  emptyTitle,
  emptyDescription,
}: {
  handle: string
  queryKey: readonly string[]
  fetchFn: FeedFetcher
  emptyTitle: string
  emptyDescription: string
}) {
  const { items, sentinelRef, status, isFetchingNextPage } = useInfiniteList<PostDto>({
    queryKey: queryKey as unknown[],
    queryFn: ({ pageParam }) => fetchFn(pageParam as string | undefined),
    staleTime: 30_000,
  })

  if (status === 'pending') {
    return (
      <>
        {[1, 2, 3].map((i) => (
          <PostCardSkeleton key={i} />
        ))}
      </>
    )
  }

  if (status === 'error') {
    return (
      <EmptyState
        title="Something went wrong"
        description="Could not load posts. Please try again."
      />
    )
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <>
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      <ScrollSentinel sentinelRef={sentinelRef} isFetchingNextPage={isFetchingNextPage} />
    </>
  )
}

// ── Media tab ─────────────────────────────────────────────────
function MediaTab({ handle }: { handle: string }) {
  const { items, sentinelRef, status, isFetchingNextPage } = useInfiniteList<PostDto>({
    queryKey: [...queryKeys.users.media(handle)] as unknown[],
    queryFn: ({ pageParam }) => usersApi.getMedia(handle, pageParam as string | undefined),
    staleTime: 30_000,
  })

  if (status === 'pending') {
    return (
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', padding: '2px' }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} height={0} style={{ aspectRatio: '1/1', paddingBottom: '100%' }} />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return <EmptyState title="Something went wrong" description="Could not load media." />
  }

  if (items.length === 0 || items.every((p) => p.media.length === 0)) {
    return <EmptyState title="No media yet" description="Photos and videos will appear here." />
  }

  return (
    <>
      <ProfileMediaGrid posts={items} />
      <ScrollSentinel sentinelRef={sentinelRef} isFetchingNextPage={isFetchingNextPage} />
    </>
  )
}

// ── User list tab ─────────────────────────────────────────────
type UserListFetcher = (cursor?: string) => Promise<{ items: UserCardDto[]; cursor: string | null; hasMore: boolean }>

function UserListTab({
  queryKey,
  fetchFn,
  emptyTitle,
  emptyDescription,
}: {
  queryKey: readonly string[]
  fetchFn: UserListFetcher
  emptyTitle: string
  emptyDescription: string
}) {
  const { items, sentinelRef, status, isFetchingNextPage } = useInfiniteList<UserCardDto>({
    queryKey: queryKey as unknown[],
    queryFn: ({ pageParam }) => fetchFn(pageParam as string | undefined),
    staleTime: 60_000,
  })

  if (status === 'pending') {
    return (
      <>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', gap: '0.875rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
            <Skeleton width={40} height={40} radius="var(--radius-full)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <Skeleton width={130} height={14} />
              <Skeleton width={90} height={12} />
            </div>
          </div>
        ))}
      </>
    )
  }

  if (status === 'error') {
    return <EmptyState title="Something went wrong" description="Could not load users." />
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <>
      {items.map((user) => (
        <UserRow key={user.id} user={user} />
      ))}
      <ScrollSentinel sentinelRef={sentinelRef} isFetchingNextPage={isFetchingNextPage} />
    </>
  )
}

// ── Main ProfilePage ──────────────────────────────────────────
export default function ProfilePage({ tab }: ProfilePageProps) {
  const { handle: rawHandle } = useParams<{ handle: string }>()
  const currentUser = useCurrentUser()

  const handle = rawHandle?.startsWith('@') ? rawHandle.slice(1) : (rawHandle ?? '')

  const { data, status, error } = useQuery({
    queryKey: queryKeys.users.profile(handle),
    queryFn: () => usersApi.getProfile(handle),
    staleTime: 30_000,
    enabled: !!handle,
  })

  const profile = data?.user

  // ── Loading ────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <div data-testid="profile-page-loading">
        <ProfileHeaderSkeleton />
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {['Posts', 'Replies', 'Media', 'Likes'].map((label) => (
            <div
              key={label}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '1rem 0.5rem',
              }}
            >
              <Skeleton width={50} height={14} style={{ margin: '0 auto' }} />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  // ── Error / not found ──────────────────────────────────────
  if (status === 'error' || !profile) {
    const is404 = error && 'status' in error && (error as { status: number }).status === 404
    return (
      <EmptyState
        data-testid="profile-not-found"
        title={is404 ? 'Account not found' : 'Something went wrong'}
        description={
          is404
            ? `@${handle} doesn't exist.`
            : 'Could not load this profile. Please try again.'
        }
      />
    )
  }

  // ── Private account logic ─────────────────────────────────
  const isSelf = currentUser?.id === profile.id || currentUser?.handle === profile.handle
  const viewerIsFollowing = profile.viewer?.following ?? false
  const isLocked = profile.isPrivate && !isSelf && !viewerIsFollowing

  const isFollowerOrFollowingTab = tab === 'followers' || tab === 'following'

  // ── Render ─────────────────────────────────────────────────
  const seoDescription = profile.bio
    ? truncate(profile.bio)
    : `The latest posts from ${profile.displayName} (@${profile.handle}) on PULSE.`

  return (
    <div data-testid={`profile-page-${handle}`}>
      <Seo
        title={`${profile.displayName} (@${profile.handle})`}
        description={seoDescription}
        path={`/@${profile.handle}`}
        image={profile.avatarUrl}
        type="profile"
        card="summary"
        noindex={profile.isPrivate}
      />
      <ProfileHeader profile={profile} />

      {/* Show tabs only for content tabs (not followers/following) */}
      {!isFollowerOrFollowingTab && (
        <ProfileTabs
          handle={handle}
          activeTab={tab as 'posts' | 'replies' | 'media' | 'likes'}
          profile={profile}
        />
      )}

      {/* Followers / Following tabs have their own heading */}
      {isFollowerOrFollowingTab && (
        <div
          style={{
            padding: '0.875rem 1rem',
            borderBottom: '1px solid var(--color-border)',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-base)',
            color: 'var(--color-text)',
          }}
        >
          {tab === 'followers' ? 'Followers' : 'Following'}
        </div>
      )}

      {/* Private lock state — shown for all content tabs */}
      {isLocked && !isFollowerOrFollowingTab ? (
        <PrivateLockState handle={handle} />
      ) : (
        <>
          {/* Posts tab */}
          {tab === 'posts' && (
            <PostFeedTab
              handle={handle}
              queryKey={queryKeys.users.posts(handle)}
              fetchFn={(cursor) => usersApi.getPosts(handle, cursor)}
              emptyTitle="No posts yet"
              emptyDescription={`@${handle} hasn't posted anything yet.`}
            />
          )}

          {/* Replies tab */}
          {tab === 'replies' && (
            <PostFeedTab
              handle={handle}
              queryKey={queryKeys.users.replies(handle)}
              fetchFn={(cursor) => usersApi.getReplies(handle, cursor)}
              emptyTitle="No replies yet"
              emptyDescription={`@${handle} hasn't replied to any posts yet.`}
            />
          )}

          {/* Media tab */}
          {tab === 'media' && <MediaTab handle={handle} />}

          {/* Likes tab */}
          {tab === 'likes' && (
            <PostFeedTab
              handle={handle}
              queryKey={queryKeys.users.likes(handle)}
              fetchFn={(cursor) => usersApi.getLikes(handle, cursor)}
              emptyTitle="No liked posts"
              emptyDescription={
                isSelf
                  ? "You haven't liked any posts yet."
                  : `@${handle}'s liked posts are private.`
              }
            />
          )}

          {/* Followers tab */}
          {tab === 'followers' && (
            <UserListTab
              queryKey={queryKeys.users.followers(handle)}
              fetchFn={(cursor) => usersApi.getFollowers(handle, cursor)}
              emptyTitle="No followers yet"
              emptyDescription={`@${handle} doesn't have any followers yet.`}
            />
          )}

          {/* Following tab */}
          {tab === 'following' && (
            <UserListTab
              queryKey={queryKeys.users.following(handle)}
              fetchFn={(cursor) => usersApi.getFollowing(handle, cursor)}
              emptyTitle="Not following anyone"
              emptyDescription={`@${handle} isn't following anyone yet.`}
            />
          )}
        </>
      )}
    </div>
  )
}
