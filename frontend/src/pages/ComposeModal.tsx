// ============================================================
// ComposeModal — /compose modal route
//
// Query params:
//   ?replyTo=<postId>   — open in reply mode
//   ?quoteOf=<postId>   — open in quote mode
//
// Uses the location.state.background pattern: renders as an
// overlay on top of the background route.
// ============================================================

import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { PostComposer } from '@/features/composer/PostComposer'
import type { PostDto } from '@/types/api'

export default function ComposeModal() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const replyToId = searchParams.get('replyTo') ?? undefined
  const quoteOfId = searchParams.get('quoteOf') ?? undefined

  const mode =
    replyToId ? 'reply'
    : quoteOfId ? 'quote'
    : 'new'

  const handleClose = useCallback(() => navigate(-1), [navigate])

  const handleSuccess = useCallback(
    (post: PostDto) => {
      // Navigate to the new post's thread, replacing the modal history entry
      navigate(`/@${post.author.handle}/status/${post.id}`, { replace: true })
    },
    [navigate],
  )

  return (
    <Modal
      isOpen
      onClose={handleClose}
      ariaLabel={
        mode === 'reply' ? 'Reply to post' : mode === 'quote' ? 'Quote post' : 'Compose new post'
      }
      testId="compose-modal"
      maxWidth="560px"
    >
      {/* Close button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <h2
          id="compose-modal-title"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text)',
          }}
        >
          {mode === 'reply' ? 'Reply' : mode === 'quote' ? 'Quote' : 'New post'}
        </h2>

        <button
          data-testid="close-compose-modal"
          aria-label="Close"
          onClick={handleClose}
          style={{
            width: '32px',
            height: '32px',
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
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <PostComposer
        mode={mode}
        replyToId={replyToId}
        quoteOfId={quoteOfId}
        onSuccess={handleSuccess}
        autoFocus
      />
    </Modal>
  )
}
