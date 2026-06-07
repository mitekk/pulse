// ============================================================
// AppShell — Responsive 3-column layout
//
// Desktop (≥1100px): left nav rail (68px) + center (≤600px) + right sidebar (320px)
// Tablet (700–1099px): icon-only rail + center (no sidebar)
// Mobile (<700px): top bar + bottom tab bar + avatar drawer
// ============================================================

import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import { useThemeStore } from '@/lib/theme'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/lib/auth/store'

// ── Icon components ────────────────────────────────────────
function HomeIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      {filled ? (
        <path
          d="M10.707 2.293a1 1 0 011.586 0l8 9A1 1 0 0119.5 13H17v8a1 1 0 01-1 1h-3v-5H11v5H8a1 1 0 01-1-1v-8H4.5a1 1 0 01-.793-1.607l7-9z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M10.707 2.293a1 1 0 011.586 0l8 9A1 1 0 0119.5 13H17v8a1 1 0 01-1 1h-3v-5H11v5H8a1 1 0 01-1-1v-8H4.5a1 1 0 01-.793-1.607l7-9z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      )}
    </svg>
  )
}

function ExploreIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={filled ? 0 : 1.5} fill={filled ? 'currentColor' : 'none'} />
      {filled ? (
        <path d="M18 18l3 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      ) : (
        <path d="M18 18l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  )
}

function NotifIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2a7 7 0 017 7v4l1.707 1.707A1 1 0 0120 16.414V17H4v-.586a1 1 0 01-.293-.707L5 14V9a7 7 0 017-7z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path d="M10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MsgIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 2H4a2 2 0 00-2 2v13a2 2 0 002 2h3l3 3 3-3h7a2 2 0 002-2V4a2 2 0 00-2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 3a2 2 0 012-2h10a2 2 0 012 2v18l-7-3-7 3V3z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PulseWordmark() {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.5rem',
        color: 'var(--color-accent)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        display: 'block',
      }}
    >
      pulse
    </span>
  )
}

function ComposeButton({ compact }: { compact?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleCompose = () => {
    navigate('/compose', { state: { background: location } })
  }

  if (compact) {
    return (
      <button
        data-testid="compose-button-compact"
        onClick={handleCompose}
        aria-label="Compose new post"
        style={{
          width: '44px',
          height: '44px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-accent)',
          color: 'var(--color-accent-contrast)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background var(--duration-base) var(--ease-standard)',
          flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v16m-8-8h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    )
  }

  return (
    <button
      data-testid="compose-button"
      onClick={handleCompose}
      style={{
        width: '100%',
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-full)',
        background: 'var(--color-accent)',
        color: 'var(--color-accent-contrast)',
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--font-weight-semibold)',
        fontSize: 'var(--text-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        transition: 'background var(--duration-base) var(--ease-standard)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 4v16m-8-8h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      Post
    </button>
  )
}

// ── Nav item ───────────────────────────────────────────────
interface NavItem {
  to: string
  label: string
  icon: (active: boolean) => React.ReactNode
  badge?: number
  testId: string
}

const navItems: NavItem[] = [
  {
    to: '/',
    label: 'Home',
    icon: (a) => <HomeIcon filled={a} />,
    testId: 'nav-home',
  },
  {
    to: '/explore',
    label: 'Explore',
    icon: (a) => <ExploreIcon filled={a} />,
    testId: 'nav-explore',
  },
  {
    to: '/notifications',
    label: 'Alerts',
    icon: (a) => <NotifIcon filled={a} />,
    badge: 0,
    testId: 'nav-notifications',
  },
  {
    to: '/messages',
    label: 'Messages',
    icon: (a) => <MsgIcon filled={a} />,
    badge: 0,
    testId: 'nav-messages',
  },
  {
    to: '/bookmarks',
    label: 'Saved',
    icon: (a) => <BookmarkIcon filled={a} />,
    testId: 'nav-bookmarks',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: () => <SettingsIcon />,
    testId: 'nav-settings',
  },
]

// ── Nav Rail (desktop/tablet) ──────────────────────────────
function NavRail({ compact }: { compact: boolean }) {
  const user = useCurrentUser()
  const { resolvedTheme, toggleTheme } = useThemeStore()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Proceed with local logout even if API fails
    }
    logout()
    navigate('/login')
  }

  return (
    <nav
      aria-label="Main navigation"
      style={{
        width: compact ? 'var(--shell-nav-width)' : 'var(--shell-nav-width-expanded)',
        height: '100dvh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: compact ? 'center' : 'flex-start',
        padding: compact ? '1rem 0' : '1rem 1.25rem',
        gap: '0.25rem',
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
        flexShrink: 0,
        zIndex: 'var(--z-nav)',
        overflowY: 'auto',
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: compact ? '0.5rem' : '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
        {compact ? (
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              color: 'var(--color-accent)',
            }}
          >
            p
          </span>
        ) : (
          <PulseWordmark />
        )}
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            data-testid={item.testId}
            aria-label={compact ? item.label : undefined}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: compact ? 0 : '0.875rem',
              padding: compact ? '0.75rem' : '0.75rem',
              borderRadius: 'var(--radius-lg)',
              color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
              fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
              fontSize: 'var(--text-base)',
              justifyContent: compact ? 'center' : 'flex-start',
              position: 'relative',
              transition: 'background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
              background: isActive ? 'var(--color-surface-raised)' : 'transparent',
              width: '100%',
            })}
          >
            {({ isActive }) => (
              <>
                <span style={{ flexShrink: 0, position: 'relative' }}>
                  {item.icon(isActive)}
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        minWidth: '16px',
                        height: '16px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--color-accent)',
                        color: 'var(--color-accent-contrast)',
                        fontSize: '10px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 3px',
                      }}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>
                {!compact && <span>{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Compose button */}
      <div style={{ width: '100%', padding: compact ? '0' : '0', marginBottom: '1rem' }}>
        <ComposeButton compact={compact} />
      </div>

      {/* Theme toggle */}
      <button
        data-testid="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? 0 : '0.875rem',
          padding: '0.75rem',
          borderRadius: 'var(--radius-lg)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--text-sm)',
          width: '100%',
          justifyContent: compact ? 'center' : 'flex-start',
          transition: 'color var(--duration-fast)',
        }}
      >
        {resolvedTheme === 'dark' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        )}
        {!compact && <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
      </button>

      {/* Avatar / user menu */}
      {user && (
        <div style={{ position: 'relative', width: '100%' }}>
          <button
            data-testid="user-menu-trigger"
            onClick={() => setAvatarMenuOpen((v) => !v)}
            aria-label="User menu"
            aria-expanded={avatarMenuOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: compact ? 0 : '0.75rem',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              justifyContent: compact ? 'center' : 'flex-start',
              transition: 'background var(--duration-fast)',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-surface-raised)',
                border: '2px solid var(--color-border)',
                overflow: 'hidden',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
              }}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} width={36} height={36} loading="lazy" />
              ) : (
                user.displayName.charAt(0).toUpperCase()
              )}
            </div>
            {!compact && (
              <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '130px',
                  }}
                >
                  {user.displayName}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-muted)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '130px',
                  }}
                >
                  @{user.handle}
                </div>
              </div>
            )}
          </button>

          {avatarMenuOpen && (
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 'var(--z-dropdown)',
                }}
                onClick={() => setAvatarMenuOpen(false)}
              />
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 0.5rem)',
                  left: compact ? '100%' : 0,
                  minWidth: '180px',
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 'calc(var(--z-dropdown) + 1)',
                  padding: '0.375rem',
                  overflow: 'hidden',
                }}
              >
                <NavLink
                  to={`/@${user.handle}`}
                  role="menuitem"
                  data-testid="menu-profile"
                  onClick={() => setAvatarMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '0.625rem 0.875rem',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  View profile
                </NavLink>
                <button
                  role="menuitem"
                  data-testid="menu-logout"
                  onClick={() => { setAvatarMenuOpen(false); void handleLogout() }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.625rem 0.875rem',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-danger)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  Sign out @{user.handle}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  )
}

// ── Mobile bottom tab bar ──────────────────────────────────
function BottomTabBar() {
  const mobileNavItems = navItems.slice(0, 4)

  return (
    <nav
      aria-label="Mobile navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'var(--shell-bottom-tab-height)',
        background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        zIndex: 'var(--z-nav)',
      }}
    >
      {mobileNavItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          data-testid={`${item.testId}-mobile`}
          aria-label={item.label}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)',
            gap: '2px',
            position: 'relative',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{ position: 'relative' }}>
                {item.icon(isActive)}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--color-accent)',
                    }}
                  />
                )}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

// ── Mobile top bar ─────────────────────────────────────────
function MobileTopBar() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        height: 'var(--shell-header-height)',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1rem',
        zIndex: 'var(--z-sticky)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.25rem',
          color: 'var(--color-accent)',
        }}
      >
        pulse
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          data-testid="compose-button-mobile"
          onClick={() => navigate('/compose', { state: { background: location } })}
          aria-label="Compose new post"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-contrast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 4v16m-8-8h16"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {user && (
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-surface-raised)',
              border: '1.5px solid var(--color-border)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
            }}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.displayName} width={30} height={30} loading="lazy" />
            ) : (
              user.displayName.charAt(0).toUpperCase()
            )}
          </div>
        )}
      </div>
    </header>
  )
}

// ── Right sidebar placeholder ──────────────────────────────
function RightSidebar() {
  return (
    <aside
      aria-label="Trends and suggestions"
      style={{
        width: 'var(--shell-sidebar-width)',
        flexShrink: 0,
        padding: '1rem 1.25rem',
        position: 'sticky',
        top: 0,
        height: '100dvh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          padding: '1rem',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}
        >
          Trends & suggestions coming soon
        </p>
      </div>
    </aside>
  )
}

// ── AppShell ───────────────────────────────────────────────
export function AppShell() {
  return (
    <>
      {/* Desktop & tablet layout */}
      <div
        style={{
          display: 'flex',
          minHeight: '100dvh',
          maxWidth: '1400px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Nav rail — hidden on mobile */}
        <style>{`
          @media (max-width: 699px) {
            .shell-nav-rail { display: none !important; }
            .shell-right-sidebar { display: none !important; }
            .shell-mobile-top { display: flex !important; }
            .shell-mobile-bottom { display: flex !important; }
            .shell-center { padding-bottom: var(--shell-bottom-tab-height) !important; }
          }
          @media (min-width: 700px) and (max-width: 1099px) {
            .shell-right-sidebar { display: none !important; }
            .shell-nav-rail { width: var(--shell-nav-width) !important; }
          }
          @media (min-width: 1100px) {
            .shell-nav-rail { width: var(--shell-nav-width-expanded) !important; }
          }
          @media (min-width: 700px) {
            .shell-mobile-top { display: none !important; }
            .shell-mobile-bottom { display: none !important; }
          }
          .shell-nav-link:hover {
            background: var(--color-surface-raised) !important;
            color: var(--color-text) !important;
          }
        `}</style>

        {/* Nav */}
        <div className="shell-nav-rail" style={{ display: 'flex' }}>
          {/* Compact at 700–1099px */}
          <div className="shell-nav-compact" style={{ display: 'contents' }}>
            <style>{`
              @media (min-width: 700px) and (max-width: 1099px) { .shell-nav-compact-inner { display: block !important; } .shell-nav-full { display: none !important; } }
              @media (min-width: 1100px) { .shell-nav-compact-inner { display: none !important; } .shell-nav-full { display: block !important; } }
            `}</style>
            <div className="shell-nav-compact-inner" style={{ display: 'none' }}>
              <NavRail compact />
            </div>
            <div className="shell-nav-full" style={{ display: 'none' }}>
              <NavRail compact={false} />
            </div>
          </div>
        </div>

        {/* Center feed */}
        <main
          className="shell-center"
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: 'var(--shell-center-max)',
            borderRight: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Mobile top bar */}
          <div className="shell-mobile-top" style={{ display: 'none' }}>
            <MobileTopBar />
          </div>

          <Outlet />
        </main>

        {/* Right sidebar */}
        <div className="shell-right-sidebar" style={{ display: 'flex' }}>
          <RightSidebar />
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="shell-mobile-bottom" style={{ display: 'none' }}>
        <BottomTabBar />
      </div>
    </>
  )
}
