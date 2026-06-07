// ============================================================
// MediaGrid — renders PostDto.media in 1/2/3/4 image layouts
// Click opens lightbox route (3b); inline video/GIF player.
// ============================================================

import { useNavigate, useLocation } from 'react-router-dom'
import type { PostMediaDto } from '@/types/api'

interface MediaGridProps {
  media: PostMediaDto[]
  postId: string
  authorHandle: string
}

// Aspect ratio tokens per layout slot (width / height)
const LAYOUT_STYLES: Record<number, React.CSSProperties[]> = {
  1: [{ gridColumn: '1 / 3', gridRow: '1 / 3', aspectRatio: '16/9' }],
  2: [
    { gridColumn: '1', gridRow: '1 / 3', aspectRatio: '1/1' },
    { gridColumn: '2', gridRow: '1 / 3', aspectRatio: '1/1' },
  ],
  3: [
    { gridColumn: '1', gridRow: '1 / 3', aspectRatio: '1/1' },
    { gridColumn: '2', gridRow: '1', aspectRatio: '1/1' },
    { gridColumn: '2', gridRow: '2', aspectRatio: '1/1' },
  ],
  4: [
    { gridColumn: '1', gridRow: '1', aspectRatio: '1/1' },
    { gridColumn: '2', gridRow: '1', aspectRatio: '1/1' },
    { gridColumn: '1', gridRow: '2', aspectRatio: '1/1' },
    { gridColumn: '2', gridRow: '2', aspectRatio: '1/1' },
  ],
}

function MediaItem({
  item,
  slotStyle,
  index,
  postId,
  authorHandle,
  total,
}: {
  item: PostMediaDto
  slotStyle: React.CSSProperties
  index: number
  postId: string
  authorHandle: string
  total: number
}) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleImageClick = () => {
    navigate(`/@${authorHandle}/status/${postId}/photo/${index}`, {
      state: { background: location },
    })
  }

  const srcSmall = item.variants.small ?? item.variants.medium ?? item.variants.large
  const srcMedium = item.variants.medium ?? item.variants.large
  const altText = item.altText ?? ''

  // ── Video / GIF ───────────────────────────────────────────
  if (item.type === 'video') {
    const mp4 = item.variants.mp4
    const poster = item.variants.poster

    return (
      <div
        data-testid={`media-item-${index}`}
        style={{ ...slotStyle, position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}
      >
        {mp4 ? (
          <video
            src={mp4}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            aria-label={altText || `Video ${index + 1} of ${total}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--color-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Video unavailable
          </div>
        )}
      </div>
    )
  }

  if (item.type === 'gif') {
    const mp4 = item.variants.mp4
    const thumb = item.variants.thumb ?? item.variants.small

    return (
      <div
        data-testid={`media-item-${index}`}
        style={{ ...slotStyle, position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}
      >
        {mp4 ? (
          <video
            src={mp4}
            autoPlay
            loop
            muted
            playsInline
            poster={thumb}
            aria-label={altText || `GIF ${index + 1} of ${total}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : thumb ? (
          <img
            src={thumb}
            alt={altText || `GIF ${index + 1} of ${total}`}
            loading="lazy"
            width={item.width ?? undefined}
            height={item.height ?? undefined}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        {/* GIF badge */}
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            left: '6px',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            padding: '2px 5px',
            borderRadius: 'var(--radius-sm)',
            letterSpacing: '0.05em',
          }}
        >
          GIF
        </div>
      </div>
    )
  }

  // ── Image ─────────────────────────────────────────────────
  const displaySrc = total === 1 ? (srcMedium ?? srcSmall) : srcSmall

  return (
    <button
      data-testid={`media-item-${index}`}
      onClick={handleImageClick}
      aria-label={altText || `Image ${index + 1} of ${total}`}
      style={{
        ...slotStyle,
        padding: 0,
        border: 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        borderRadius: 'var(--radius-md)',
        position: 'relative',
        display: 'block',
      }}
    >
      <img
        src={displaySrc}
        alt={altText}
        loading="lazy"
        width={item.width ?? undefined}
        height={item.height ?? undefined}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </button>
  )
}

export function MediaGrid({ media, postId, authorHandle }: MediaGridProps) {
  if (!media || media.length === 0) return null

  const count = Math.min(media.length, 4)
  const visible = media.slice(0, count)
  const layoutStyles = LAYOUT_STYLES[count]

  return (
    <div
      data-testid="media-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: 'auto',
        gap: '2px',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        marginTop: 'var(--space-3)',
        maxHeight: '400px',
      }}
    >
      {visible.map((item, i) => (
        <MediaItem
          key={item.id}
          item={item}
          slotStyle={{ ...layoutStyles[i], minHeight: '140px' }}
          index={i}
          postId={postId}
          authorHandle={authorHandle}
          total={count}
        />
      ))}
    </div>
  )
}
