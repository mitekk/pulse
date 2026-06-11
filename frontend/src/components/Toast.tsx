// ============================================================
// Toast — notification toaster system
//
// - aria-live="polite" region for a11y announcements
// - Success / error / info / warning variants
// - Auto-dismiss with configurable duration
// - useToast() hook for firing toasts from anywhere
// - ToastProvider wraps the app root (or AppShell)
// ============================================================

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// ── Types ──────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastMessage {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  /** Auto-dismiss after this many ms; 0 = persist until dismissed */
  duration?: number
}

interface ToastContextValue {
  toast: (msg: Omit<ToastMessage, 'id'>) => string
  dismiss: (id: string) => void
  dismissAll: () => void
}

// ── Context ────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

// ── Icons ──────────────────────────────────────────────────────

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M7.5 12l3 3 6-6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (variant === 'error') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 7v6M12 16.5v.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (variant === 'warning') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path d="M12 9v4M12 17v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  // info
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 11v5M12 7.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const VARIANT_STYLE: Record<ToastVariant, { color: string; border: string; bg: string }> = {
  success: {
    color: 'var(--color-success)',
    border: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
    bg: 'color-mix(in srgb, var(--color-success) 8%, var(--color-surface))',
  },
  error: {
    color: 'var(--color-danger)',
    border: 'color-mix(in srgb, var(--color-danger) 30%, transparent)',
    bg: 'color-mix(in srgb, var(--color-danger) 8%, var(--color-surface))',
  },
  warning: {
    color: 'var(--color-warning)',
    border: 'color-mix(in srgb, var(--color-warning) 30%, transparent)',
    bg: 'color-mix(in srgb, var(--color-warning) 8%, var(--color-surface))',
  },
  info: {
    color: 'var(--color-accent)',
    border: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
    bg: 'color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))',
  },
}

// ── Single toast item ──────────────────────────────────────────

function ToastItem({
  message,
  onDismiss,
}: {
  message: ToastMessage
  onDismiss: (id: string) => void
}) {
  const [exiting, setExiting] = useState(false)
  const duration = message.duration ?? 4500
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(message.id), 250)
  }, [message.id, onDismiss])

  useEffect(() => {
    if (duration <= 0) return
    timerRef.current = setTimeout(dismiss, duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [duration, dismiss])

  const { color, border, bg } = VARIANT_STYLE[message.variant]

  return (
    <div
      data-testid={`toast-${message.id}`}
      role="status"
      aria-atomic="true"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        minWidth: '280px',
        maxWidth: '360px',
        color,
        animation: exiting
          ? 'toast-out var(--duration-base) var(--ease-accelerate) forwards'
          : 'toast-in var(--duration-slow) var(--ease-spring)',
        pointerEvents: 'auto',
      }}
    >
      <span style={{ color, flexShrink: 0, marginTop: '1px' }}>
        <ToastIcon variant={message.variant} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text)',
            margin: 0,
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {message.title}
        </p>
        {message.description && (
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              margin: '0.25rem 0 0',
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {message.description}
          </p>
        )}
      </div>

      <button
        aria-label="Dismiss notification"
        onClick={dismiss}
        data-testid={`toast-dismiss-${message.id}`}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-muted)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          borderRadius: 'var(--radius-sm)',
          transition: 'color var(--duration-fast)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

// ── ToastProvider ──────────────────────────────────────────────

let _idCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const toast = useCallback((msg: Omit<ToastMessage, 'id'>): string => {
    const id = `toast-${++_idCounter}`
    setMessages((prev) => [...prev, { ...msg, id }])
    return id
  }, [])

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const dismissAll = useCallback(() => {
    setMessages([])
  }, [])

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes toast-out {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(8px) scale(0.96);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes toast-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes toast-out { from { opacity: 1; } to { opacity: 0; } }
        }
      `}</style>
      <ToastContext.Provider value={{ toast, dismiss, dismissAll }}>
        {children}
        {createPortal(
          <div
            role="region"
            aria-live="polite"
            aria-atomic="false"
            aria-label="Notifications"
            data-testid="toast-region"
            style={{
              position: 'fixed',
              bottom: '1.5rem',
              right: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.625rem',
              zIndex: 'var(--z-toast)',
              pointerEvents: 'none',
              alignItems: 'flex-end',
            }}
          >
            {messages.map((msg) => (
              <ToastItem key={msg.id} message={msg} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
      </ToastContext.Provider>
    </>
  )
}

// ── useToast hook ──────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return ctx
}

// ── Convenience methods ────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useSuccessToast() {
  const { toast } = useToast()
  return (title: string, description?: string) =>
    toast({ variant: 'success', title, description })
}

// eslint-disable-next-line react-refresh/only-export-components
export function useErrorToast() {
  const { toast } = useToast()
  return (title: string, description?: string) =>
    toast({ variant: 'error', title, description })
}
