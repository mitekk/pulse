// ============================================================
// ProfileMediaGrid — grid layout for media tab
// Renders images from PostDtos as a 3-column grid
// ============================================================

import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import type { PostDto, PostMediaDto } from '@/types/api'
import { MediaProcessing, MediaUnavailable } from '@/components/MediaPlaceholder'

interface ProfileMediaGridProps {
  posts: PostDto[]
}

function MediaThumb({
  media,
  postId,
  authorHandle,
  mediaIndex,
}: {
  media: PostMediaDto
  postId: string
  authorHandle: string
  mediaIndex: number
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [loadFailed, setLoadFailed] = useState(false)
  const thumb = media.variants.thumb ?? media.variants.small ?? media.variants.medium

  const handleClick = () => {
    navigate(`/@${authorHandle}/status/${postId}/photo/${mediaIndex + 1}`, {
      state: { background: location },
    })
  }

  const squareSlot = { aspectRatio: '1/1', borderRadius: 'var(--radius-sm)' }

  // ── Status / load placeholders ────────────────────────────
  if (media.status === 'pending' || media.status === 'processing') {
    return (
      <MediaProcessing
        compact
        testId={`media-thumb-${postId}-${mediaIndex}`}
        style={squareSlot}
      />
    )
  }
  if (media.status === 'failed' || loadFailed) {
    return (
      <MediaUnavailable
        compact
        testId={`media-thumb-${postId}-${mediaIndex}`}
        style={squareSlot}
      />
    )
  }

  if (media.type === 'video') {
    return (
      <div
        data-testid={`media-thumb-${postId}-${mediaIndex}`}
        style={{
          aspectRatio: '1/1',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer',
        }}
        onClick={handleClick}
      >
        {media.variants.poster ? (
          <img
            src={media.variants.poster}
            alt={media.altText ?? ''}
            loading="lazy"
            onError={() => setLoadFailed(true)}
            width={media.width ?? 200}
            height={media.height ?? 200}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="rgba(0,0,0,0.5)" />
            <path d="M10 8l6 4-6 4V8z" fill="white" />
          </svg>
        </div>
      </div>
    )
  }

  if (!thumb) {
    return (
      <MediaUnavailable
        compact
        testId={`media-thumb-${postId}-${mediaIndex}`}
        style={squareSlot}
      />
    )
  }

  return (
    <button
      data-testid={`media-thumb-${postId}-${mediaIndex}`}
      onClick={handleClick}
      aria-label={media.altText ?? `Image from post`}
      style={{
        aspectRatio: '1/1',
        padding: 0,
        border: 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        borderRadius: 'var(--radius-sm)',
        display: 'block',
        position: 'relative',
        background: 'var(--color-surface)',
      }}
    >
      <img
        src={thumb}
        alt={media.altText ?? ''}
        loading="lazy"
        onError={() => setLoadFailed(true)}
        width={media.width ?? 200}
        height={media.height ?? 200}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {media.type === 'gif' && (
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            padding: '1px 4px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          GIF
        </div>
      )}
    </button>
  )
}

export function ProfileMediaGrid({ posts }: ProfileMediaGridProps) {
  // Flatten posts → individual media items
  const mediaItems = posts.flatMap((post) =>
    (post.media ?? []).map((m, idx) => ({
      media: m,
      postId: post.id,
      authorHandle: post.author.handle,
      mediaIndex: idx,
    })),
  )

  if (mediaItems.length === 0) return null

  return (
    <div
      data-testid="profile-media-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '2px',
        padding: '2px',
      }}
    >
      {mediaItems.map(({ media, postId, authorHandle, mediaIndex }) => (
        <MediaThumb
          key={`${postId}-${media.id}`}
          media={media}
          postId={postId}
          authorHandle={authorHandle}
          mediaIndex={mediaIndex}
        />
      ))}
    </div>
  )
}
