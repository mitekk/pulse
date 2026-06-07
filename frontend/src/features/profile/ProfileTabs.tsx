// ============================================================
// ProfileTabs — Posts | Replies | Media | Likes tab strip
// + tab content with useInfiniteList per tab
// ============================================================

import { Link, useLocation } from 'react-router-dom'
import type { ProfileDto } from '@/types/api'

export type ProfileTab = 'posts' | 'replies' | 'media' | 'likes'

interface ProfileTabsProps {
  handle: string
  activeTab: ProfileTab
  profile: ProfileDto
}

interface TabDef {
  id: ProfileTab
  label: string
  href: string
  testId: string
}

export function ProfileTabs({ handle, activeTab, profile: _profile }: ProfileTabsProps) {
  const location = useLocation()
  const h = handle.startsWith('@') ? handle.slice(1) : handle

  const tabs: TabDef[] = [
    { id: 'posts', label: 'Posts', href: `/@${h}`, testId: 'profile-tab-posts' },
    { id: 'replies', label: 'Replies', href: `/@${h}/replies`, testId: 'profile-tab-replies' },
    { id: 'media', label: 'Media', href: `/@${h}/media`, testId: 'profile-tab-media' },
    { id: 'likes', label: 'Likes', href: `/@${h}/likes`, testId: 'profile-tab-likes' },
  ]

  return (
    <nav
      role="tablist"
      aria-label="Profile sections"
      data-testid="profile-tabs"
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        background: 'var(--color-bg)',
        zIndex: 10,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <Link
            key={tab.id}
            to={tab.href}
            state={location.state}
            role="tab"
            aria-selected={isActive}
            data-testid={tab.testId}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '1rem 0.5rem',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
              color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
              textDecoration: 'none',
              borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
              transition: 'color var(--duration-fast), border-color var(--duration-fast)',
              display: 'block',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
