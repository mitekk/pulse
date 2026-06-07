// ============================================================
// SettingsPage — /settings hub with sub-routes:
//   /settings          → hub (link list)
//   /settings/account  → profile edit form (PATCH /users/me)
//   /settings/sessions → active sessions + revoke
// Uses React Router's /*-matched layout pattern
// ============================================================

import { Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authApi } from '@/lib/api/auth'
import { usersApi } from '@/lib/api/users'
import { queryKeys } from '@/lib/cache/queryKeys'
import { useCurrentUser } from '@/lib/auth/useCurrentUser'
import { useAuthStore } from '@/lib/auth/store'
import { Skeleton } from '@/components/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import type { SessionDto } from '@/types/api'

// ── Profile edit schema (mirrors §15 limits) ─────────────────
const profileSchema = z.object({
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be 50 characters or less'),
  bio: z.string().max(160, 'Bio must be 160 characters or less').optional(),
  location: z.string().max(30, 'Location must be 30 characters or less').optional(),
  website: z
    .string()
    .max(100, 'Website URL must be 100 characters or less')
    .refine(
      (v) => !v || v.startsWith('http://') || v.startsWith('https://') || v.startsWith('www.'),
      'Must be a valid URL',
    )
    .optional(),
  isPrivate: z.boolean().optional(),
  dmPrivacy: z.enum(['everyone', 'following']).optional(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

// ── Field error helper ────────────────────────────────────────
function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span
      role="alert"
      style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-danger)',
        display: 'block',
        marginTop: '0.25rem',
      }}
    >
      {message}
    </span>
  )
}

// ── Field label helper ────────────────────────────────────────
function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-weight-medium)',
        color: 'var(--color-text-muted)',
        display: 'block',
        marginBottom: '0.375rem',
      }}
    >
      {children}
    </label>
  )
}

// ── Text input helper ─────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.875rem',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  outline: 'none',
  transition: 'border-color var(--duration-fast)',
  boxSizing: 'border-box',
}

// ── Character counter helper ──────────────────────────────────
function CharCount({ current, max }: { current: number; max: number }) {
  const remaining = max - current
  const isNear = remaining <= 10
  const isOver = remaining < 0
  return (
    <span
      aria-live="polite"
      style={{
        fontSize: 'var(--text-xs)',
        color: isOver
          ? 'var(--color-danger)'
          : isNear
            ? 'var(--color-warning, #f59e0b)'
            : 'var(--color-text-muted)',
        float: 'right',
        marginTop: '0.25rem',
      }}
    >
      {remaining}
    </span>
  )
}

// ── Account Settings ──────────────────────────────────────────
function AccountSettings() {
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const setAuth = useAuthStore((s) => s.setAuth)
  const accessToken = useAuthStore((s) => s.accessToken)

  const { data: profileData, status: profileStatus } = useQuery({
    queryKey: queryKeys.users.profile(currentUser?.handle ?? ''),
    queryFn: () => usersApi.getProfile(currentUser!.handle),
    staleTime: 30_000,
    enabled: !!currentUser,
  })

  const profile = profileData?.user

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: profile
      ? {
          displayName: profile.displayName,
          bio: profile.bio ?? '',
          location: profile.location ?? '',
          website: profile.website ?? '',
          isPrivate: profile.isPrivate,
          // dmPrivacy comes from UserDto via auth store, not ProfileDto
          dmPrivacy: (currentUser?.dmPrivacy ?? 'everyone') as 'everyone' | 'following',
        }
      : undefined,
  })

  const bioValue = watch('bio') ?? ''
  const displayNameValue = watch('displayName') ?? ''
  const locationValue = watch('location') ?? ''
  const websiteValue = watch('website') ?? ''

  const updateMutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      usersApi.updateMe({
        displayName: values.displayName,
        bio: values.bio || undefined,
        location: values.location || undefined,
        website: values.website || undefined,
        isPrivate: values.isPrivate,
        dmPrivacy: values.dmPrivacy,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.profile(currentUser?.handle ?? '') })
      // Update auth store user (only fields that exist on UserDto)
      if (currentUser) {
        setAuth(
          accessToken ?? '',
          {
            ...currentUser,
            displayName: data.user.displayName,
            isPrivate: data.user.isPrivate,
          },
        )
      }
    },
  })

  if (profileStatus === 'pending') {
    return (
      <div data-testid="account-settings-loading" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Skeleton width={100} height={14} />
            <Skeleton height={42} />
          </div>
        ))}
      </div>
    )
  }

  if (profileStatus === 'error' || !profile) {
    return <EmptyState title="Could not load profile" description="Please try refreshing." />
  }

  return (
    <form
      data-testid="account-settings-form"
      onSubmit={handleSubmit((values) => updateMutation.mutate(values))}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.5rem' }}
      noValidate
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-xl)',
          fontWeight: 400,
          color: 'var(--color-text)',
          margin: 0,
        }}
      >
        Edit profile
      </h2>

      {/* Display name */}
      <div>
        <Label htmlFor="displayName">Display name</Label>
        <input
          id="displayName"
          data-testid="settings-display-name"
          type="text"
          autoComplete="name"
          {...register('displayName')}
          style={{
            ...inputStyle,
            borderColor: errors.displayName ? 'var(--color-danger)' : 'var(--color-border)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = errors.displayName ? 'var(--color-danger)' : 'var(--color-border)' }}
        />
        <CharCount current={displayNameValue.length} max={50} />
        <FieldError message={errors.displayName?.message} />
      </div>

      {/* Bio */}
      <div>
        <Label htmlFor="bio">Bio</Label>
        <textarea
          id="bio"
          data-testid="settings-bio"
          rows={3}
          {...register('bio')}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: '80px',
            borderColor: errors.bio ? 'var(--color-danger)' : 'var(--color-border)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = errors.bio ? 'var(--color-danger)' : 'var(--color-border)' }}
        />
        <CharCount current={bioValue.length} max={160} />
        <FieldError message={errors.bio?.message} />
      </div>

      {/* Location */}
      <div>
        <Label htmlFor="location">Location</Label>
        <input
          id="location"
          data-testid="settings-location"
          type="text"
          {...register('location')}
          style={{
            ...inputStyle,
            borderColor: errors.location ? 'var(--color-danger)' : 'var(--color-border)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = errors.location ? 'var(--color-danger)' : 'var(--color-border)' }}
        />
        <CharCount current={locationValue.length} max={30} />
        <FieldError message={errors.location?.message} />
      </div>

      {/* Website */}
      <div>
        <Label htmlFor="website">Website</Label>
        <input
          id="website"
          data-testid="settings-website"
          type="url"
          placeholder="https://yoursite.com"
          {...register('website')}
          style={{
            ...inputStyle,
            borderColor: errors.website ? 'var(--color-danger)' : 'var(--color-border)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = errors.website ? 'var(--color-danger)' : 'var(--color-border)' }}
        />
        <CharCount current={websiteValue.length} max={100} />
        <FieldError message={errors.website?.message} />
      </div>

      {/* Privacy toggles */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1rem',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text)',
            margin: 0,
          }}
        >
          Privacy
        </h3>

        {/* Protected account */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text)',
                margin: '0 0 0.25rem',
              }}
            >
              Protected account
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
              Only approved followers can see your posts
            </p>
          </div>
          <label
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
            aria-label="Protect your account"
          >
            <input
              data-testid="settings-is-private"
              type="checkbox"
              {...register('isPrivate')}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)', cursor: 'pointer' }}
            />
          </label>
        </div>

        {/* DM privacy */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text)',
                margin: '0 0 0.25rem',
              }}
            >
              Direct message requests
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
              Who can send you message requests
            </p>
          </div>
          <select
            id="dmPrivacy"
            data-testid="settings-dm-privacy"
            {...register('dmPrivacy')}
            style={{
              ...inputStyle,
              width: 'auto',
              padding: '0.375rem 0.625rem',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <option value="everyone">Everyone</option>
            <option value="following">People I follow</option>
          </select>
        </div>
      </div>

      {/* Success / error feedback */}
      {updateMutation.isSuccess && (
        <div
          role="status"
          data-testid="settings-success-message"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
            color: 'var(--color-accent)',
            fontSize: 'var(--text-sm)',
          }}
        >
          Profile updated successfully.
        </div>
      )}
      {updateMutation.isError && (
        <div
          role="alert"
          data-testid="settings-error-message"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)',
            color: 'var(--color-danger)',
            fontSize: 'var(--text-sm)',
          }}
        >
          Failed to update profile. Please try again.
        </div>
      )}

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          data-testid="settings-save-button"
          type="submit"
          disabled={isSubmitting || !isDirty || updateMutation.isPending}
          style={{
            padding: '0.625rem 1.5rem',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-contrast)',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-semibold)',
            fontSize: 'var(--text-sm)',
            border: 'none',
            cursor: isSubmitting || !isDirty ? 'default' : 'pointer',
            opacity: isSubmitting || !isDirty ? 0.6 : 1,
            transition: 'opacity var(--duration-fast)',
            minWidth: '100px',
          }}
        >
          {updateMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

// ── Session item ──────────────────────────────────────────────
function SessionItem({ session, onRevoke }: { session: SessionDto; onRevoke: (id: string) => void }) {
  const ua = session.userAgent
  // Simplified UA parsing
  let device = 'Unknown device'
  if (ua.includes('iPhone') || ua.includes('Android')) device = 'Mobile'
  else if (ua.includes('iPad')) device = 'Tablet'
  else if (ua.includes('Macintosh') || ua.includes('Windows')) device = 'Desktop'

  let browser = ''
  if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Safari')) browser = 'Safari'
  else if (ua.includes('Edge')) browser = 'Edge'

  const createdDate = new Date(session.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div
      data-testid={`session-item-${session.id}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
        padding: '1rem',
        borderBottom: '1px solid var(--color-border)',
        background: session.isCurrent
          ? 'color-mix(in srgb, var(--color-accent) 5%, transparent)'
          : 'transparent',
      }}
    >
      {/* Device icon */}
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface-raised)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          flexShrink: 0,
        }}
      >
        {device === 'Mobile' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="18" r="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 22h8M12 18v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text)',
            }}
          >
            {device}{browser ? ` · ${browser}` : ''}
          </span>
          {session.isCurrent && (
            <span
              data-testid="session-current-badge"
              style={{
                fontSize: 'var(--text-xs)',
                background: 'var(--color-accent)',
                color: 'var(--color-accent-contrast)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 'var(--font-weight-medium)',
              }}
            >
              This device
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            margin: '0.25rem 0 0',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {session.ip} · Started {createdDate}
        </p>
      </div>

      {!session.isCurrent && (
        <button
          data-testid={`session-revoke-${session.id}`}
          onClick={() => onRevoke(session.id)}
          style={{
            padding: '0.375rem 0.875rem',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--color-danger)',
            background: 'transparent',
            color: 'var(--color-danger)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-medium)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Revoke
        </button>
      )}
    </div>
  )
}

// ── Sessions Settings ─────────────────────────────────────────
function SessionsSettings() {
  const queryClient = useQueryClient()
  const authStore = useAuthStore()
  const navigate = useNavigate()

  const { data, status } = useQuery({
    queryKey: queryKeys.auth.sessions(),
    queryFn: () => authApi.getSessions(),
    staleTime: 60_000,
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => authApi.deleteSession(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })
    },
  })

  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      const sessions = data?.items ?? []
      await Promise.all(
        sessions
          .filter((s) => !s.isCurrent)
          .map((s) => authApi.deleteSession(s.id)),
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      authStore.logout()
      navigate('/login')
    },
  })

  if (status === 'pending') {
    return (
      <div data-testid="sessions-loading" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Skeleton width={40} height={40} radius="var(--radius-lg)" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <Skeleton width={140} height={14} />
              <Skeleton width={100} height={12} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return <EmptyState title="Could not load sessions" description="Please try again." />
  }

  const sessions = data?.items ?? []
  const otherSessions = sessions.filter((s) => !s.isCurrent)

  return (
    <div data-testid="sessions-settings">
      <div
        style={{
          padding: '1.5rem 1.5rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              fontWeight: 400,
              color: 'var(--color-text)',
              margin: '0 0 0.25rem',
            }}
          >
            Active sessions
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
            Devices where you are currently signed in
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {otherSessions.length > 0 && (
            <button
              data-testid="revoke-all-sessions"
              onClick={() => revokeAllMutation.mutate()}
              disabled={revokeAllMutation.isPending}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
              }}
            >
              {revokeAllMutation.isPending ? 'Revoking…' : 'Log out all other devices'}
            </button>
          )}
          <button
            data-testid="logout-button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-danger)',
              background: 'transparent',
              color: 'var(--color-danger)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-body)',
              cursor: 'pointer',
            }}
          >
            {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>

      <div>
        {sessions.length === 0 ? (
          <EmptyState title="No active sessions" description="No other sessions found." />
        ) : (
          sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              onRevoke={(id) => revokeMutation.mutate(id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Settings hub ──────────────────────────────────────────────
const settingsLinks = [
  {
    to: '/settings/account',
    label: 'Edit profile',
    description: 'Display name, bio, photo, privacy',
    testId: 'settings-link-account',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/settings/sessions',
    label: 'Security & sessions',
    description: 'Active sessions, sign out everywhere',
    testId: 'settings-link-sessions',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

function SettingsHub() {
  return (
    <div data-testid="settings-hub" style={{ padding: '1.5rem 0' }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl, 1.5rem)',
          fontWeight: 400,
          color: 'var(--color-text)',
          margin: '0 0 1.5rem',
          padding: '0 1.5rem',
        }}
      >
        Settings
      </h1>

      <nav aria-label="Settings sections">
        {settingsLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            data-testid={link.testId}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem 1.5rem',
              borderBottom: '1px solid var(--color-border)',
              textDecoration: 'none',
              background: isActive ? 'var(--color-surface)' : 'transparent',
              color: 'var(--color-text)',
              transition: 'background var(--duration-fast)',
            })}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-surface-raised)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                flexShrink: 0,
              }}
            >
              {link.icon}
            </div>
            <div>
              <div
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 'var(--font-weight-medium)',
                  color: 'var(--color-text)',
                  marginBottom: '2px',
                }}
              >
                {link.label}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                {link.description}
              </div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', flexShrink: 0 }}
            >
              <path
                d="M9 18l6-6-6-6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

// ── Back button for sub-pages ─────────────────────────────────
function BackToSettings({ title }: { title: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        background: 'var(--color-bg)',
        zIndex: 10,
      }}
    >
      <Link
        to="/settings"
        data-testid="settings-back"
        aria-label="Back to settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-full)',
          color: 'var(--color-text)',
          textDecoration: 'none',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M19 12H5M5 12l7-7M5 12l7 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-lg)',
          fontWeight: 400,
          color: 'var(--color-text)',
        }}
      >
        {title}
      </span>
    </div>
  )
}

// ── Root SettingsPage ─────────────────────────────────────────
export default function SettingsPage() {
  return (
    <Routes>
      <Route index element={<SettingsHub />} />
      <Route
        path="account"
        element={
          <>
            <BackToSettings title="Edit profile" />
            <AccountSettings />
          </>
        }
      />
      <Route
        path="sessions"
        element={
          <>
            <BackToSettings title="Sessions" />
            <SessionsSettings />
          </>
        }
      />
    </Routes>
  )
}
