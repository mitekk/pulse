// ============================================================
// Tabs — accessible tab list with keyboard navigation
//
// Follows ARIA tablist pattern:
//   - Arrow keys navigate between tabs
//   - Home/End jump to first/last
//   - Enter/Space select
//   - Panels use role="tabpanel"
// ============================================================

import { useRef, type ReactNode, type KeyboardEvent } from 'react'

export interface Tab {
  key: string
  label: string
  /** Short accessible label if label text is too long */
  ariaLabel?: string
  disabled?: boolean
  count?: number
}

export interface TabsProps {
  tabs: Tab[]
  activeKey: string
  onChange: (key: string) => void
  children?: ReactNode
  /** Extra style for the tab list container */
  listStyle?: React.CSSProperties
  'data-testid'?: string
  /** Variant for styling */
  variant?: 'underline' | 'pill'
}

export function Tabs({
  tabs,
  activeKey,
  onChange,
  children,
  listStyle,
  'data-testid': testId = 'tabs',
  variant = 'underline',
}: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabledTabs = tabs.map((t, i) => ({ t, i })).filter(({ t }) => !t.disabled)
    const currentEnabledIndex = enabledTabs.findIndex(({ i }) => i === index)

    let nextIndex: number | null = null

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = enabledTabs[(currentEnabledIndex + 1) % enabledTabs.length]
      nextIndex = next.i
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev =
        enabledTabs[(currentEnabledIndex - 1 + enabledTabs.length) % enabledTabs.length]
      nextIndex = prev.i
    } else if (e.key === 'Home') {
      e.preventDefault()
      nextIndex = enabledTabs[0].i
    } else if (e.key === 'End') {
      e.preventDefault()
      nextIndex = enabledTabs[enabledTabs.length - 1].i
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange(tabs[index].key)
      return
    }

    if (nextIndex !== null) {
      tabRefs.current[nextIndex]?.focus()
      onChange(tabs[nextIndex].key)
    }
  }

  const underlineStyles = {
    list: {
      borderBottom: '1px solid var(--color-border)',
      gap: '0',
    } as React.CSSProperties,
    tab: (isActive: boolean): React.CSSProperties => ({
      padding: '0.75rem 1rem',
      borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
      marginBottom: '-1px',
      color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
      fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
    }),
  }

  const pillStyles = {
    list: {
      gap: '0.25rem',
      padding: '0.25rem',
      background: 'var(--color-surface-raised)',
      borderRadius: 'var(--radius-lg)',
    } as React.CSSProperties,
    tab: (isActive: boolean): React.CSSProperties => ({
      padding: '0.5rem 1rem',
      borderRadius: 'var(--radius-md)',
      background: isActive ? 'var(--color-surface-overlay)' : 'transparent',
      color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
      fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
    }),
  }

  const styles = variant === 'pill' ? pillStyles : underlineStyles

  return (
    <>
      <style>{`
        .pulse-tab {
          background: none;
          border: none;
          cursor: pointer;
          font-family: var(--font-body);
          font-size: var(--text-sm);
          transition: color var(--duration-fast) var(--ease-standard),
                      background var(--duration-fast) var(--ease-standard);
          white-space: nowrap;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }
        .pulse-tab:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .pulse-tab:not(:disabled):hover {
          color: var(--color-text) !important;
        }
      `}</style>
      <div>
        <div
          role="tablist"
          data-testid={testId}
          style={{
            display: 'flex',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            ...styles.list,
            ...listStyle,
          }}
        >
          {tabs.map((tab, index) => {
            const isActive = tab.key === activeKey

            return (
              <button
                key={tab.key}
                ref={(el) => { tabRefs.current[index] = el }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.key}`}
                aria-label={tab.ariaLabel ?? tab.label}
                id={`tab-${tab.key}`}
                disabled={tab.disabled}
                tabIndex={isActive ? 0 : -1}
                data-testid={`tab-${tab.key}`}
                className="pulse-tab"
                onClick={() => !tab.disabled && onChange(tab.key)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                style={styles.tab(isActive)}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      background: isActive ? 'var(--color-accent-strong)' : 'var(--color-surface-overlay)',
                      color: isActive ? 'var(--color-accent-contrast)' : 'var(--color-text-muted)',
                      borderRadius: 'var(--radius-full)',
                      padding: '1px 5px',
                      lineHeight: 1.5,
                      minWidth: '18px',
                      textAlign: 'center',
                    }}
                  >
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {children}
      </div>
    </>
  )
}

// ── TabPanel — companion panel component ──────────────────────

interface TabPanelProps {
  tabKey: string
  activeKey: string
  children: ReactNode
  lazy?: boolean
}

export function TabPanel({ tabKey, activeKey, children, lazy = true }: TabPanelProps) {
  const isActive = tabKey === activeKey

  if (lazy && !isActive) return null

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabKey}`}
      aria-labelledby={`tab-${tabKey}`}
      hidden={!isActive}
      tabIndex={0}
    >
      {children}
    </div>
  )
}
