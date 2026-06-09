// ============================================================
// PhotoPage — Lightbox for /:handle/status/:postId/photo/:idx
//
// - Fetches the post to get its media array
// - Full-size image with keyboard + swipe navigation
// - Alt text display
// - Pinch-zoom on touch (CSS touch-action: pinch-zoom)
// - Escape / backdrop click → navigate back
// - Works as both a modal-route overlay AND a standalone page
// ============================================================

import { useEffect, useCallback, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/cache/queryKeys'
import { postsApi } from '@/lib/api/posts'
import type { PostMediaDto } from '@/types/api'

// ── Icons ──────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ── Best available variant ─────────────────────────────────

function getBestVariant(media: PostMediaDto): string {
  return (
    media.variants.large ??
    media.variants.medium ??
    media.variants.small ??
    media.variants.thumb ??
    ''
  )
}

// ── Touch swipe detection ─────────────────────────────────

function useSwipe(onLeft: () => void, onRight: () => void) {
  const startX = useRef<number | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
  }, [])

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current === null) return
      const dx = e.changedTouches[0].clientX - startX.current
      if (Math.abs(dx) > 50) {
        if (dx < 0) onLeft()
        else onRight()
      }
      startX.current = null
    },
    [onLeft, onRight],
  )

  return { onTouchStart, onTouchEnd }
}

// ── Lightbox ───────────────────────────────────────────────

export default function PhotoPage() {
  const { postId, idx } = useParams<{ handle: string; postId: string; idx: string }>()
  const navigate = useNavigate()

  const currentIdx = Math.max(0, parseInt(idx ?? '0', 10) - 1)  // 1-based in URL, 0-based internally

  // Fetch post to get media
  const { data, status } = useQuery({
    queryKey: queryKeys.posts.detail(postId!),
    queryFn: () => postsApi.getById(postId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!postId,
  })

  const post = data?.post
  const media = post?.media ?? []
  const safeIdx = Math.min(Math.max(currentIdx, 0), Math.max(media.length - 1, 0))

  const [displayIdx, setDisplayIdx] = useState(safeIdx)
  const handle = post?.author.handle

  // Mirror the committed index into a ref so event handlers (keyboard / swipe) always
  // read the CURRENT index synchronously, rather than a value captured in a closure
  // that can lag a render during the async media-load + route-sync transition. Without
  // this, a keypress fired in that window navigates from a stale index (or no-ops).
  const displayIdxRef = useRef(displayIdx)

  // Keep the ref in sync with the committed index. navigateTo also updates it eagerly,
  // so user-driven navigation never reads a stale value.
  useEffect(() => {
    displayIdxRef.current = displayIdx
  }, [displayIdx])

  // Sync when route param changes
  useEffect(() => {
    setDisplayIdx(safeIdx)
  }, [safeIdx])

  const navigateTo = useCallback(
    (newIdx: number) => {
      const bounded = Math.max(0, Math.min(newIdx, media.length - 1))
      if (bounded === displayIdxRef.current) return
      displayIdxRef.current = bounded
      setDisplayIdx(bounded)
      // Update the URL (1-based)
      if (handle) {
        navigate(`/@${handle}/status/${postId}/photo/${bounded + 1}`, { replace: true })
      }
    },
    [media.length, handle, postId, navigate],
  )

  const goNext = useCallback(() => navigateTo(displayIdxRef.current + 1), [navigateTo])
  const goPrev = useCallback(() => navigateTo(displayIdxRef.current - 1), [navigateTo])
  const goBack = useCallback(() => navigate(-1), [navigate])

  // ── Keyboard navigation ──────────────────────────────────
  // Handlers read the index from the ref, so they never go stale between renders.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'Escape') goBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, goBack])

  // ── Scroll lock ──────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── Swipe ────────────────────────────────────────────────
  const { onTouchStart, onTouchEnd } = useSwipe(goNext, goPrev)

  const currentMedia = media[displayIdx]
  const imgSrc = currentMedia ? getBestVariant(currentMedia) : ''

  return (
    <div
      data-testid="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={currentMedia?.altText ? `Photo: ${currentMedia.altText}` : 'Photo'}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
      onClick={(e) => {
        // Click backdrop to close
        if (e.target === e.currentTarget) goBack()
      }}
    >
      {/* Close button */}
      <button
        data-testid="lightbox-close"
        aria-label="Close lightbox"
        onClick={goBack}
        style={{
          position: 'absolute',
          top: 'var(--space-4)',
          left: 'var(--space-4)',
          zIndex: 1,
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <CloseIcon />
      </button>

      {/* Image counter */}
      {media.length > 1 && (
        <div
          data-testid="lightbox-counter"
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-medium)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {displayIdx + 1} / {media.length}
        </div>
      )}

      {/* Prev button */}
      {displayIdx > 0 && (
        <button
          data-testid="lightbox-prev"
          aria-label="Previous photo"
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          style={{
            position: 'absolute',
            left: 'var(--space-4)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          <ChevronLeft />
        </button>
      )}

      {/* Next button */}
      {displayIdx < media.length - 1 && (
        <button
          data-testid="lightbox-next"
          aria-label="Next photo"
          onClick={(e) => { e.stopPropagation(); goNext() }}
          style={{
            position: 'absolute',
            right: 'var(--space-4)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          <ChevronRight />
        </button>
      )}

      {/* Main image */}
      <div
        style={{
          maxWidth: '90vw',
          maxHeight: '85dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'pinch-zoom',
        }}
      >
        {status === 'pending' && (
          <div
            data-testid="lightbox-loading"
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-full)',
              border: '3px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}

        {status === 'success' && imgSrc && (
          <img
            data-testid="lightbox-image"
            src={imgSrc}
            alt={currentMedia?.altText ?? ''}
            loading="lazy"
            width={currentMedia?.width ?? undefined}
            height={currentMedia?.height ?? undefined}
            style={{
              maxWidth: '90vw',
              maxHeight: '85dvh',
              objectFit: 'contain',
              borderRadius: 'var(--radius-md)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        )}

        {status === 'error' && (
          <div
            data-testid="lightbox-error"
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'var(--text-sm)' }}
          >
            Could not load image
          </div>
        )}
      </div>

      {/* Alt text */}
      {currentMedia?.altText && (
        <div
          data-testid="lightbox-alt-text"
          style={{
            position: 'absolute',
            bottom: 'var(--space-4)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)',
            color: 'rgba(255,255,255,0.9)',
            fontSize: 'var(--text-sm)',
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--radius-full)',
            maxWidth: '80vw',
            textAlign: 'center',
          }}
        >
          {currentMedia.altText}
        </div>
      )}

      {/* Dot indicators */}
      {media.length > 1 && (
        <div
          data-testid="lightbox-dots"
          style={{
            position: 'absolute',
            bottom: currentMedia?.altText ? 'calc(var(--space-4) + 40px)' : 'var(--space-4)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 'var(--space-2)',
          }}
        >
          {media.map((_, i) => (
            <button
              key={i}
              data-testid={`lightbox-dot-${i}`}
              aria-label={`Photo ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); navigateTo(i) }}
              style={{
                width: i === displayIdx ? '20px' : '6px',
                height: '6px',
                borderRadius: 'var(--radius-full)',
                background: i === displayIdx ? 'white' : 'rgba(255,255,255,0.4)',
                border: 'none',
                cursor: 'pointer',
                transition: 'width var(--duration-base), background var(--duration-base)',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
