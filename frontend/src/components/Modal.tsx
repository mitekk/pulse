// ============================================================
// Modal / Dialog primitive
//
// - Focus-trapped (first focusable on open; cycles within)
// - Escape key closes
// - Overlay click closes
// - Scroll-lock on body while open
// - Works with React Router location.state.background pattern
// ============================================================

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

// ── Focus trap helpers ─────────────────────────────────────

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (node) => !node.closest('[aria-hidden="true"]'),
  )
}

// ── Modal ──────────────────────────────────────────────────

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Called when user dismisses (Escape or overlay click) */
  onClose: () => void
  /** Modal content */
  children: ReactNode
  /** ARIA role — dialog (default) or alertdialog */
  role?: 'dialog' | 'alertdialog'
  /** Accessible label for the dialog */
  ariaLabel?: string
  /** id of element that labels the dialog */
  ariaLabelledby?: string
  /** id of element that describes the dialog */
  ariaDescribedby?: string
  /** Width of the dialog panel */
  maxWidth?: string
  /** Extra class/style tokens for the panel */
  panelStyle?: React.CSSProperties
  /** data-testid for the overlay */
  testId?: string
}

export function Modal({
  isOpen,
  onClose,
  children,
  role = 'dialog',
  ariaLabel,
  ariaLabelledby,
  ariaDescribedby,
  maxWidth = '560px',
  panelStyle,
  testId = 'modal',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // ── Scroll lock ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // ── Focus management ─────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return

    // Remember what was focused before opening
    previousFocusRef.current = document.activeElement as HTMLElement

    // Focus first focusable element inside panel
    const panel = panelRef.current
    if (panel) {
      const focusable = getFocusable(panel)
      if (focusable.length > 0) {
        focusable[0].focus()
      } else {
        panel.focus()
      }
    }

    return () => {
      // Restore focus when modal closes
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  // ── Keyboard trap ────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const focusable = getFocusable(panel)
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          // Shift+Tab: if at first element, wrap to last
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          // Tab: if at last element, wrap to first
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    },
    [onClose],
  )

  if (!isOpen) return null

  return createPortal(
    <div
      data-testid={`${testId}-overlay`}
      role="presentation"
      aria-hidden="false"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)',
        padding: 'var(--space-4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        data-testid={testId}
        role={role}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          width: '100%',
          maxWidth,
          maxHeight: 'calc(100dvh - var(--space-8))',
          overflowY: 'auto',
          position: 'relative',
          boxShadow: 'var(--shadow-lg)',
          outline: 'none',
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
