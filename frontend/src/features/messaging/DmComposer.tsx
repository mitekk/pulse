// ============================================================
// DmComposer — text input + send button for DM thread
// Features:
//   - Emits dm.typing (debounced) on keypress
//   - Send on Enter (Shift+Enter = newline)
//   - Media attachment via useMediaUpload
//   - Permission gate: disabled with explanation when not allowed
//   - Submit disabled while media is processing
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react'
import { emitTyping } from '@/lib/realtime/roomManager'
import { useMediaUpload } from '@/hooks/useMediaUpload'
import type { DmPermissionStatus } from './dmPermission'

interface DmComposerProps {
  conversationId: string
  permissionStatus: DmPermissionStatus
  permissionExplanation: string | null
  onSend: (text: string, mediaId?: string) => Promise<void>
  isSending: boolean
}

const TYPING_DEBOUNCE_MS = 1500

export function DmComposer({
  conversationId,
  permissionStatus,
  permissionExplanation,
  onSend,
  isSending,
}: DmComposerProps) {
  const [text, setText] = useState('')
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { attachments, uploadFile, removeAttachment, isProcessing, readyMediaIds } =
    useMediaUpload()

  const isDisabled = permissionStatus === 'blocked' || permissionStatus === 'not_following'
  const hasContent = text.trim().length > 0 || readyMediaIds.length > 0
  const canSubmit = hasContent && !isSending && !isProcessing && !isDisabled

  // Debounced typing emit
  const handleTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    emitTyping(conversationId)
    typingTimerRef.current = setTimeout(() => {
      typingTimerRef.current = null
    }, TYPING_DEBOUNCE_MS)
  }, [conversationId])

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [])

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    resizeTextarea()
    if (!isDisabled) handleTyping()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSubmit) handleSend()
    }
  }

  const handleSend = async () => {
    if (!canSubmit) return
    const mediaId = readyMediaIds[0] // DMs support 1 media attachment
    await onSend(text.trim(), mediaId)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = '' // reset so same file can be re-selected
  }

  if (isDisabled) {
    return (
      <div
        data-testid="dm-composer-disabled"
        role="alert"
        style={{
          padding: 'var(--space-4)',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          textAlign: 'center',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{ margin: '0 auto var(--space-2)', display: 'block' }}
        >
          <path
            d="M12 1C8.676 1 6 3.676 6 7v1H4a1 1 0 00-1 1v12a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v1H8V7c0-2.276 1.724-4 4-4zm0 9a2 2 0 110 4 2 2 0 010-4z"
            fill="currentColor"
          />
        </svg>
        <p>{permissionExplanation ?? 'You cannot send messages to this person.'}</p>
      </div>
    )
  }

  return (
    <div
      data-testid="dm-composer"
      style={{
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        padding: 'var(--space-3) var(--space-4)',
      }}
    >
      {/* Media preview */}
      {attachments.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-2)',
            flexWrap: 'wrap',
          }}
        >
          {attachments.map((att) => (
            <div
              key={att.localId}
              data-testid={`dm-attachment-${att.localId}`}
              style={{
                position: 'relative',
                width: '80px',
                height: '80px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--color-border)',
              }}
            >
              <img
                src={att.previewUrl}
                alt="Attachment preview"
                width={80}
                height={80}
                loading="eager"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {att.status === 'uploading' && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: 'var(--color-border)',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${att.progress}%`,
                      background: 'var(--color-accent)',
                      transition: 'width var(--duration-fast)',
                    }}
                  />
                </div>
              )}
              <button
                data-testid={`remove-dm-attachment-${att.localId}`}
                onClick={() => removeAttachment(att.localId)}
                aria-label="Remove attachment"
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '20px',
                  height: '20px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'var(--space-2)',
        }}
      >
        {/* Media attach button */}
        <label
          htmlFor="dm-media-input"
          data-testid="dm-attach-media"
          aria-label="Attach media"
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-full)',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            transition: 'color var(--duration-fast)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLLabelElement).style.color = 'var(--color-accent)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLLabelElement).style.color = 'var(--color-text-muted)'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
            <path d="M3 16l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            id="dm-media-input"
            type="file"
            accept="image/*,image/gif,video/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            disabled={attachments.length >= 1}
          />
        </label>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          data-testid="dm-text-input"
          placeholder="Start a message…"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="Message text"
          rows={1}
          style={{
            flex: 1,
            minHeight: '36px',
            maxHeight: '120px',
            resize: 'none',
            background: 'var(--color-surface-raised)',
            border: '1.5px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            padding: '0.5rem 0.875rem',
            fontSize: 'var(--text-sm)',
            lineHeight: 'var(--leading-normal)',
            outline: 'none',
            overflowY: 'auto',
            transition: 'border-color var(--duration-fast)',
          }}
          onFocus={(e) => {
            ;(e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-accent)'
          }}
          onBlur={(e) => {
            ;(e.target as HTMLTextAreaElement).style.borderColor = 'var(--color-border)'
          }}
        />

        {/* Send button */}
        <button
          data-testid="dm-send-button"
          onClick={handleSend}
          disabled={!canSubmit}
          aria-label="Send message"
          aria-disabled={!canSubmit}
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full)',
            background: canSubmit ? 'var(--color-accent)' : 'var(--color-surface-raised)',
            color: canSubmit ? 'var(--color-accent-contrast)' : 'var(--color-text-dimmed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background var(--duration-fast), color var(--duration-fast)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {isSending ? (
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: 'white',
                animation: 'spin 0.7s linear infinite',
                display: 'inline-block',
              }}
              aria-hidden="true"
            />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 12l9-9 9 9M12 3v18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="rotate(90 12 12)"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
