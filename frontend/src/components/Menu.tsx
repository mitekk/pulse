// ============================================================
// Menu / Dropdown — accessible popover menu
// ============================================================

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  testId?: string
}

interface MenuProps {
  items: MenuItem[]
  onClose: () => void
  /** Position offset from trigger */
  align?: 'left' | 'right'
  style?: CSSProperties
}

export function Menu({ items, onClose, align = 'right', style }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="menu"
      style={{
        position: 'absolute',
        [align === 'right' ? 'right' : 'left']: 0,
        top: 'calc(100% + 4px)',
        minWidth: '180px',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 'var(--z-dropdown)',
        padding: '0.375rem',
        ...style,
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          data-testid={item.testId ?? `menu-item-${i}`}
          disabled={item.disabled}
          onClick={() => {
            item.onClick()
            onClose()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            width: '100%',
            padding: '0.625rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-body)',
            color: item.danger ? 'var(--color-danger)' : 'var(--color-text)',
            textAlign: 'left',
            opacity: item.disabled ? 0.5 : 1,
            cursor: item.disabled ? 'default' : 'pointer',
            transition: 'background var(--duration-fast)',
          }}
          onMouseEnter={(e) => {
            if (!item.disabled)
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-overlay)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          {item.icon && <span style={{ flexShrink: 0, display: 'flex' }}>{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
