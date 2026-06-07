// ============================================================
// Drawer — slide-in panel for mobile nav and panels
//
// - Side: left (mobile nav) | right (panels/sheets)
// - Focus-trapped when open
// - Escape key + overlay click closes
// - Scroll-lock while open
// - prefers-reduced-motion: no slide animation
// ============================================================

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'

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

export interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  side?: 'left' | 'right'
  width?: string
  ariaLabel?: string
  'data-testid'?: string
}

export function Drawer({
  isOpen,
  onClose,
  children,
  side = 'left',
  width = '280px',
  ariaLabel = 'Navigation',
  'data-testid': testId = 'drawer',
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  // Focus management
  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement
    const panel = panelRef.current
    if (panel) {
      const focusable = getFocusable(panel)
      if (focusable.length > 0) {
        focusable[0].focus()
      } else {
        panel.focus()
      }
    }
    return () => { previousFocusRef.current?.focus() }
  }, [isOpen])

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
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
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

  const slideIn = side === 'left'
    ? { transform: 'translateX(0)' }
    : { transform: 'translateX(0)' }
  const startPosition = side === 'left'
    ? { left: 0, top: 0, bottom: 0 }
    : { right: 0, top: 0, bottom: 0 }

  return createPortal(
    <>
      <style>{`
        @keyframes drawer-slide-left {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes drawer-slide-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pulse-drawer-panel {
            animation: none !important;
          }
        }
      `}</style>
      <div
        data-testid={`${testId}-overlay`}
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--color-overlay)',
          zIndex: 'var(--z-drawer)',
        }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid={testId}
        tabIndex={-1}
        className="pulse-drawer-panel"
        onKeyDown={handleKeyDown}
        style={{
          position: 'fixed',
          ...startPosition,
          width,
          maxWidth: '90vw',
          background: 'var(--color-bg)',
          borderRight: side === 'left' ? '1px solid var(--color-border)' : 'none',
          borderLeft: side === 'right' ? '1px solid var(--color-border)' : 'none',
          zIndex: 'calc(var(--z-drawer) + 1)',
          overflowY: 'auto',
          animation: `drawer-slide-${side} var(--duration-slow) var(--ease-decelerate)`,
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          ...slideIn,
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
