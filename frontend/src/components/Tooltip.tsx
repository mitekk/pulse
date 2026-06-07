// ============================================================
// Tooltip — accessible, CSS-driven tooltip
//
// Uses aria-describedby pattern (content described, not labeled)
// Appears on hover + focus; dismisses on Escape; respects
// prefers-reduced-motion (no animation)
// ============================================================

import { useRef, useState, useId, type ReactNode } from 'react'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: string
  children: ReactNode
  placement?: TooltipPlacement
  delay?: number
  'data-testid'?: string
}

const OFFSET = 8

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 300,
  'data-testid': testId,
}: TooltipProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(true), delay)
  }

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  const placementStyle: React.CSSProperties =
    placement === 'top'
      ? { bottom: `calc(100% + ${OFFSET}px)`, left: '50%', transform: 'translateX(-50%)' }
      : placement === 'bottom'
        ? { top: `calc(100% + ${OFFSET}px)`, left: '50%', transform: 'translateX(-50%)' }
        : placement === 'left'
          ? { right: `calc(100% + ${OFFSET}px)`, top: '50%', transform: 'translateY(-50%)' }
          : { left: `calc(100% + ${OFFSET}px)`, top: '50%', transform: 'translateY(-50%)' }

  return (
    <>
      <style>{`
        .pulse-tooltip {
          position: absolute;
          z-index: var(--z-tooltip);
          background: var(--color-surface-overlay);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: var(--font-weight-medium);
          padding: 0.3125rem 0.625rem;
          border-radius: var(--radius-md);
          white-space: nowrap;
          pointer-events: none;
          box-shadow: var(--shadow-md);
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-standard);
        }
        .pulse-tooltip.visible {
          opacity: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .pulse-tooltip {
            transition: none;
          }
        }
        .pulse-tooltip-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
      <span
        className="pulse-tooltip-wrap"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => { if (e.key === 'Escape') hide() }}
      >
        {/* Clone child and inject aria-describedby */}
        <span aria-describedby={visible ? id : undefined}>{children}</span>
        <span
          role="tooltip"
          id={id}
          data-testid={testId}
          className={`pulse-tooltip${visible ? ' visible' : ''}`}
          aria-hidden={!visible}
          style={placementStyle}
        >
          {content}
        </span>
      </span>
    </>
  )
}
