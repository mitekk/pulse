// ============================================================
// NotificationIcon — per-type SVG icon
// ============================================================

import type { NotificationType } from '@/types/api'
import { NOTIFICATION_CONFIG } from './notificationUtils'

interface NotificationIconProps {
  type: NotificationType
  size?: number
}

export function NotificationIcon({ type, size = 18 }: NotificationIconProps) {
  const config = NOTIFICATION_CONFIG[type]
  const color = config.color ?? 'var(--color-accent)'

  return (
    <span
      data-testid={`notif-icon-${type}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size + 8}px`,
        height: `${size + 8}px`,
        borderRadius: 'var(--radius-full)',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {config.icon === 'heart' && (
          <path
            d="M12 21C12 21 3 14.5 3 8.5C3 5.4 5.4 3 8.5 3c1.7 0 3.3.9 4.3 2.3C13.8 3.9 15.4 3 17 3 20.1 3 22 5.4 22 8.5 22 14.5 12 21 12 21z"
            fill="currentColor"
          />
        )}
        {config.icon === 'reply' && (
          <path
            d="M3 10a7 7 0 1014 0c0 3.5-2.5 6.5-6 7.5V21l-4-4h-.5A7 7 0 013 10z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
        )}
        {(config.icon === 'repost' || config.icon === 'quote') && (
          <path
            d="M17 1l4 4-4 4M20 5H7a4 4 0 00-4 4v2M7 23l-4-4 4-4M4 19h13a4 4 0 004-4v-2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {config.icon === 'follow' && (
          <>
            <circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M2 21v-2a4 4 0 014-4h8a4 4 0 014 4v2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M19 8l2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {config.icon === 'mention' && (
          <>
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M16 12v2a4 4 0 008 0v-2A10 10 0 1012 22"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        )}
        {config.icon === 'person-request' && (
          <>
            <circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M2 21v-2a4 4 0 014-4h8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="19" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M19 15v3l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
        {config.icon === 'dm' && (
          <path
            d="M20 2H4a2 2 0 00-2 2v13a2 2 0 002 2h3l3 3 3-3h7a2 2 0 002-2V4a2 2 0 00-2-2z"
            fill="currentColor"
          />
        )}
      </svg>
    </span>
  )
}
