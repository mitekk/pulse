// ============================================================
// PostComposer — new post / reply / quote modes
//
// Props:
//   mode        'new' | 'reply' | 'quote'
//   replyToId   — set when mode='reply'
//   quoteOfId   — set when mode='quote'
//   replyToPost — shallow PostDto shown as reply context header
//   quotePost   — shallow PostDto shown as embedded quote preview
//   onSuccess   — called after successful submit (with new PostDto)
//   compact     — smaller inline variant (no reply-policy selector)
// ============================================================

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '@/lib/api/posts'
import { queryKeys } from '@/lib/cache/queryKeys'
import { useComposerStore } from '@/lib/stores/composerStore'
import { useTimelineBufferStore } from '@/lib/stores/timelineBufferStore'
import { countChars, CHAR_LIMIT } from '@/lib/composer/charCounter'
import { useMediaUpload, MAX_FILES_PER_POST } from '@/hooks/useMediaUpload'
import { useMentionAutocomplete } from './useMentionAutocomplete'
import { Avatar } from '@/components/Avatar'
import { useAuthStore, selectUser } from '@/lib/auth/store'
import type { PostDto, ReplyPolicy } from '@/types/api'

// ── Icons ──────────────────────────────────────────────────

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2a14.5 14.5 0 010 20M2 12h20" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// ── Char counter ring ──────────────────────────────────────

function CharRing({ count, limit }: { count: number; limit: number }) {
  const radius = 9
  const circumference = 2 * Math.PI * radius
  const ratio = Math.min(count / limit, 1.15)  // slightly overshoot for "over" visual
  const offset = circumference * (1 - ratio)
  const remaining = limit - count
  const isOver = remaining < 0
  const isNear = !isOver && remaining <= 20

  const color = isOver
    ? 'var(--color-danger)'
    : isNear
    ? 'var(--color-warning)'
    : 'var(--color-accent)'

  return (
    <span
      data-testid="char-ring"
      aria-label={`${remaining >= 0 ? remaining : `${Math.abs(remaining)} over limit`} characters remaining`}
      style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}
    >
      <svg width="24" height="24" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="2"
        />
        {/* Fill */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      {isNear && !isOver && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '7px',
            color: 'var(--color-warning)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          {remaining}
        </span>
      )}
      {isOver && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '7px',
            color: 'var(--color-danger)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          {remaining}
        </span>
      )}
    </span>
  )
}


// ── Reply policy selector ─────────────────────────────────

const REPLY_POLICY_LABELS: Record<ReplyPolicy, string> = {
  everyone: 'Everyone can reply',
  following: 'People you follow',
  mentioned: 'Only mentioned people',
}

function ReplyPolicySelector({
  value,
  onChange,
}: {
  value: ReplyPolicy
  onChange: (v: ReplyPolicy) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        data-testid="reply-policy-trigger"
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-1)',
          padding: '3px 8px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--color-accent)',
          color: 'var(--color-accent)',
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <GlobeIcon />
        {REPLY_POLICY_LABELS[value]}
      </button>

      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' }}
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 'calc(var(--z-dropdown) + 1)',
              minWidth: '220px',
              padding: '0.375rem',
            }}
          >
            {(['everyone', 'following', 'mentioned'] as ReplyPolicy[]).map((policy) => (
              <button
                key={policy}
                role="menuitem"
                data-testid={`reply-policy-${policy}`}
                type="button"
                onClick={() => {
                  onChange(policy)
                  setOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'left',
                  fontSize: 'var(--text-sm)',
                  color: value === policy ? 'var(--color-accent)' : 'var(--color-text)',
                  fontWeight: value === policy ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                  background: 'transparent',
                }}
              >
                {REPLY_POLICY_LABELS[policy]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Media attachment thumbnail ─────────────────────────────

interface MediaThumbnailProps {
  previewUrl: string
  altText: string
  status: string
  progress: number
  error: string | null
  onRemove: () => void
  onAltTextChange: (v: string) => void
}

function MediaThumbnail({
  previewUrl,
  altText,
  status,
  progress,
  error,
  onRemove,
  onAltTextChange,
}: MediaThumbnailProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '80px',
        height: '80px',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: error ? '2px solid var(--color-danger)' : '1px solid var(--color-border)',
      }}
    >
      <img
        src={previewUrl}
        alt={altText || 'Attachment preview'}
        loading="lazy"
        width={80}
        height={80}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Progress overlay */}
      {(status === 'uploading' || status === 'processing') && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '3px',
              background: 'rgba(255,255,255,0.3)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'white',
                borderRadius: '2px',
                transition: 'width 0.2s',
              }}
            />
          </div>
          <span style={{ color: 'white', fontSize: '10px' }}>
            {status === 'processing' ? 'Processing…' : `${progress}%`}
          </span>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(232,64,42,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: 'white', fontSize: '10px', textAlign: 'center', padding: '4px' }}>
            Failed
          </span>
        </div>
      )}

      {/* Remove button */}
      <button
        type="button"
        data-testid="remove-attachment"
        aria-label="Remove attachment"
        onClick={onRemove}
        style={{
          position: 'absolute',
          top: '3px',
          right: '3px',
          width: '18px',
          height: '18px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <XIcon />
      </button>

      {/* Alt text input (positioned below, shown for images) */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0,0,0,0.5)',
          padding: '2px 4px',
        }}
      >
        <input
          data-testid="alt-text-input"
          type="text"
          value={altText}
          placeholder="Alt text"
          maxLength={500}
          onChange={(e) => onAltTextChange(e.target.value)}
          style={{
            width: '100%',
            fontSize: '9px',
            background: 'transparent',
            border: 'none',
            color: 'white',
            outline: 'none',
          }}
          aria-label="Image alt text"
        />
      </div>
    </div>
  )
}

// ── Autocomplete dropdown ──────────────────────────────────

import type { AutocompleteSuggestion } from './useMentionAutocomplete'

function AutocompleteDropdown({
  suggestions,
  activeIndex,
  onSelect,
  onMouseEnter,
}: {
  suggestions: AutocompleteSuggestion[]
  activeIndex: number
  onSelect: (s: AutocompleteSuggestion) => void
  onMouseEnter: (i: number) => void
}) {
  return (
    <div
      role="listbox"
      data-testid="autocomplete-dropdown"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 'calc(var(--z-dropdown) + 2)',
        overflow: 'hidden',
        maxHeight: '220px',
        overflowY: 'auto',
      }}
    >
      {suggestions.map((s, i) => (
        <div
          key={s.kind === 'user' ? s.user.id : s.tag.tag}
          role="option"
          aria-selected={i === activeIndex}
          data-testid={`autocomplete-item-${i}`}
          onMouseDown={(e) => {
            e.preventDefault()  // Don't blur textarea
            onSelect(s)
          }}
          onMouseEnter={() => onMouseEnter(i)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '0.5rem 0.875rem',
            cursor: 'pointer',
            background: i === activeIndex ? 'var(--color-surface-overlay)' : 'transparent',
            transition: 'background var(--duration-fast)',
          }}
        >
          {s.kind === 'user' ? (
            <>
              <img
                src={s.user.avatarUrl ?? ''}
                alt=""
                loading="lazy"
                width={28}
                height={28}
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', background: 'var(--color-border)' }}
              />
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)' }}>
                  {s.user.displayName}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  @{s.user.handle}
                </div>
              </div>
            </>
          ) : (
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)' }}>
                #{s.tag.tag}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {s.tag.postCount.toLocaleString()} posts
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main PostComposer ──────────────────────────────────────

export interface PostComposerProps {
  mode?: 'new' | 'reply' | 'quote'
  replyToId?: string
  quoteOfId?: string
  replyToPost?: PostDto | null
  quotePost?: PostDto | null
  onSuccess?: (post: PostDto) => void
  compact?: boolean
  autoFocus?: boolean
}

export function PostComposer({
  mode = 'new',
  replyToId,
  quoteOfId,
  replyToPost,
  quotePost,
  onSuccess,
  compact = false,
  autoFocus = false,
}: PostComposerProps) {
  const qc = useQueryClient()
  const user = useAuthStore(selectUser)
  const flush = useTimelineBufferStore((s) => s.flush)

  // Draft key
  const draftKey =
    mode === 'reply' && replyToId
      ? `reply:${replyToId}`
      : mode === 'quote' && quoteOfId
      ? `quote:${quoteOfId}`
      : 'new'

  const getDraft = useComposerStore((s) => s.getDraft)
  const setDraft = useComposerStore((s) => s.setDraft)
  const clearDraft = useComposerStore((s) => s.clearDraft)

  const [text, setText] = useState(() => getDraft(draftKey))
  const [replyPolicy, setReplyPolicy] = useState<ReplyPolicy>('everyone')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const charCount = countChars(text)
  const {
    attachments,
    uploadFile,
    removeAttachment,
    setAltText,
    isProcessing,
    readyMediaIds,
    validateFile,
  } = useMediaUpload()

  // ── Submission validation ────────────────────────────────
  const hasContent = text.trim().length > 0 || readyMediaIds.length > 0
  const canSubmit =
    hasContent && !charCount.isOverLimit && !isProcessing

  // ── Auto-resize textarea ─────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [text])

  // ── Auto-focus ───────────────────────────────────────────
  useEffect(() => {
    if (autoFocus) {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        // Move cursor to end
        const len = ta.value.length
        ta.setSelectionRange(len, len)
      }
    }
  }, [autoFocus])

  // ── Autocomplete ─────────────────────────────────────────
  const handleInsert = useCallback(
    (insertion: string, replaceFrom: number, replaceTo: number) => {
      const ta = textareaRef.current
      if (!ta) return
      const newText =
        text.slice(0, replaceFrom) + insertion + text.slice(replaceTo)
      setText(newText)
      setDraft(draftKey, newText)
      // Move cursor after insertion
      const newPos = replaceFrom + insertion.length
      requestAnimationFrame(() => {
        ta.setSelectionRange(newPos, newPos)
        ta.focus()
      })
    },
    [text, draftKey, setDraft],
  )

  const autocomplete = useMentionAutocomplete(handleInsert)

  // ── Text change handler ──────────────────────────────────
  const handleTextChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value
      setText(val)
      setDraft(draftKey, val)
      autocomplete.onTextChange(val, e.target.selectionStart ?? val.length)
    },
    [draftKey, setDraft, autocomplete],
  )

  // ── Keyboard nav in autocomplete ─────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!autocomplete.isOpen) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        autocomplete.setActiveIndex(
          (autocomplete.activeIndex + 1) % autocomplete.suggestions.length,
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        autocomplete.setActiveIndex(
          (autocomplete.activeIndex - 1 + autocomplete.suggestions.length) %
            autocomplete.suggestions.length,
        )
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const s = autocomplete.suggestions[autocomplete.activeIndex]
        if (s) autocomplete.selectSuggestion(s)
      } else if (e.key === 'Escape') {
        autocomplete.dismiss()
      }
    },
    [autocomplete],
  )

  // ── Submit mutation ──────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: () =>
      postsApi.create({
        text: text.trim() || undefined,
        mediaIds: readyMediaIds.length > 0 ? readyMediaIds : undefined,
        replyToId,
        quoteOfId,
        replyPolicy: mode === 'new' ? replyPolicy : undefined,
      }),

    onSuccess: ({ post }) => {
      // Clear draft
      clearDraft(draftKey)
      setText('')

      // Optimistic insert: prepend to home timeline and thread replies
      if (mode === 'new') {
        flush()
        void qc.invalidateQueries({ queryKey: queryKeys.timeline.home() })
      } else if (mode === 'reply' && replyToId) {
        void qc.invalidateQueries({ queryKey: queryKeys.posts.replies(replyToId) })
        void qc.invalidateQueries({ queryKey: queryKeys.posts.thread(replyToId) })
      } else if (mode === 'quote' && quoteOfId) {
        void qc.invalidateQueries({ queryKey: queryKeys.timeline.home() })
      }

      onSuccess?.(post)
    },
  })

  // ── File input ───────────────────────────────────────────
  const [fileError, setFileError] = useState<string | null>(null)

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      setFileError(null)

      for (const file of files) {
        const err = validateFile(file)
        if (err) {
          setFileError(err)
          break
        }
        try {
          await uploadFile(file)
        } catch (err2) {
          setFileError(err2 instanceof Error ? err2.message : 'Upload failed')
        }
      }

      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [uploadFile, validateFile],
  )

  if (!user) return null

  return (
    <div
      data-testid="post-composer"
      style={{ display: 'flex', gap: 'var(--space-3)', padding: compact ? 'var(--space-3)' : 'var(--space-4)' }}
    >
      {/* Avatar */}
      <div style={{ flexShrink: 0, paddingTop: '2px' }}>
        <Avatar
          src={user.avatarUrl}
          displayName={user.displayName}
          handle={user.handle}
          size="md"
          isVerified={user.isVerified}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Reply-to context header */}
        {replyToPost && !replyToPost.deleted && (
          <div
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Replying to{' '}
            <span style={{ color: 'var(--color-accent)' }}>@{replyToPost.author.handle}</span>
          </div>
        )}

        {/* Textarea container (relative for autocomplete) */}
        <div ref={containerRef} style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            data-testid="composer-textarea"
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'reply'
                ? 'Post your reply…'
                : mode === 'quote'
                ? 'Add a comment…'
                : "What's happening?"
            }
            rows={compact ? 2 : 3}
            aria-label={
              mode === 'reply'
                ? 'Write your reply'
                : mode === 'quote'
                ? 'Add a comment to this post'
                : 'Compose a new post'
            }
            style={{
              width: '100%',
              minHeight: compact ? '56px' : '80px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: compact ? 'var(--text-base)' : 'var(--text-md)',
              color: 'var(--color-text)',
              fontFamily: 'var(--font-body)',
              lineHeight: 'var(--leading-relaxed)',
              overflowY: 'hidden',
            }}
          />

          {/* Autocomplete dropdown */}
          {autocomplete.isOpen && autocomplete.suggestions.length > 0 && (
            <AutocompleteDropdown
              suggestions={autocomplete.suggestions}
              activeIndex={autocomplete.activeIndex}
              onSelect={autocomplete.selectSuggestion}
              onMouseEnter={autocomplete.setActiveIndex}
            />
          )}
        </div>

        {/* Quote preview */}
        {quotePost && !quotePost.deleted && (
          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-3)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <img
                src={quotePost.author.avatarUrl ?? ''}
                alt=""
                loading="lazy"
                width={16}
                height={16}
                style={{ width: '16px', height: '16px', borderRadius: '50%' }}
              />
              <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text)' }}>
                {quotePost.author.displayName}
              </span>
              <span>@{quotePost.author.handle}</span>
            </div>
            {quotePost.text && (
              <div style={{ color: 'var(--color-text)', fontSize: 'var(--text-sm)' }}>
                {quotePost.text.slice(0, 200)}{quotePost.text.length > 200 ? '…' : ''}
              </div>
            )}
          </div>
        )}

        {/* Media attachments */}
        {attachments.length > 0 && (
          <div
            data-testid="media-attachments"
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-3)',
            }}
          >
            {attachments.map((att) => (
              <MediaThumbnail
                key={att.localId}
                previewUrl={att.previewUrl}
                altText={att.altText}
                status={att.status}
                progress={att.progress}
                error={att.error}
                onRemove={() => removeAttachment(att.localId)}
                onAltTextChange={(v) => setAltText(att.localId, v)}
              />
            ))}
          </div>
        )}

        {/* File error */}
        {fileError && (
          <div
            role="alert"
            data-testid="file-error"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-danger)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {fileError}
          </div>
        )}

        {/* Submit error */}
        {submitMutation.isError && (
          <div
            role="alert"
            data-testid="submit-error"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-danger)',
              marginBottom: 'var(--space-2)',
            }}
          >
            Failed to post. Please try again.
          </div>
        )}

        {/* Toolbar row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: 'var(--space-3)',
            gap: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            {/* Media attach button */}
            <button
              type="button"
              data-testid="attach-media-button"
              aria-label="Attach media"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_FILES_PER_POST}
              style={{
                padding: '6px',
                borderRadius: 'var(--radius-full)',
                color:
                  attachments.length >= MAX_FILES_PER_POST
                    ? 'var(--color-text-dimmed)'
                    : 'var(--color-accent)',
                background: 'transparent',
                border: 'none',
                cursor: attachments.length >= MAX_FILES_PER_POST ? 'not-allowed' : 'pointer',
              }}
            >
              <ImageIcon />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              style={{ display: 'none' }}
              aria-hidden="true"
              onChange={handleFileChange}
            />

            {/* Reply policy (new posts only, not compact) */}
            {mode === 'new' && !compact && (
              <ReplyPolicySelector
                value={replyPolicy}
                onChange={setReplyPolicy}
              />
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {/* Char ring — only show when text present or near limit */}
            {(charCount.count > 0 || charCount.isNearLimit || charCount.isOverLimit) && (
              <CharRing count={charCount.count} limit={CHAR_LIMIT} />
            )}

            {/* Submit button */}
            <button
              type="submit"
              data-testid="composer-submit"
              disabled={!canSubmit || submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              style={{
                padding: '0.4rem 1.1rem',
                borderRadius: 'var(--radius-full)',
                background: canSubmit && !submitMutation.isPending ? 'var(--color-accent)' : 'var(--color-border)',
                color: canSubmit && !submitMutation.isPending ? 'var(--color-accent-contrast)' : 'var(--color-text-dimmed)',
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--text-sm)',
                border: 'none',
                cursor: canSubmit && !submitMutation.isPending ? 'pointer' : 'not-allowed',
                transition: 'background var(--duration-fast)',
              }}
              aria-disabled={!canSubmit || submitMutation.isPending}
            >
              {submitMutation.isPending
                ? 'Posting…'
                : mode === 'reply'
                ? 'Reply'
                : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
