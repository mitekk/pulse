// ============================================================
// ComposeDmModal — /compose/dm
// User typeahead → POST /conversations → navigate to thread
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Avatar } from '@/components/Avatar'
import { messagingApi } from '@/lib/api/messaging'
import { searchApi } from '@/lib/api/search'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { UserCardDto } from '@/types/api'

export default function ComposeDmModal() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserCardDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setSelectedUser(null)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQ(val.trim())
    }, 250)
  }, [])

  const { data: suggestions } = useQuery({
    queryKey: queryKeys.search.suggest(debouncedQ),
    queryFn: () => searchApi.suggest(debouncedQ),
    staleTime: 30_000,
    enabled: debouncedQ.length >= 1,
  })

  const createConversationMutation = useMutation({
    mutationFn: (handle: string) => messagingApi.createConversation(handle),
    onSuccess: ({ conversation }) => {
      navigate(`/messages/${conversation.id}`, { replace: true })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to create conversation.')
    },
  })

  const handleSelectUser = (user: UserCardDto) => {
    setSelectedUser(user)
    setQuery(user.displayName)
    setDebouncedQ('')
  }

  const handleStart = () => {
    if (!selectedUser) return
    createConversationMutation.mutate(selectedUser.handle)
  }

  const handleClose = () => navigate(-1)

  const showDropdown =
    !selectedUser &&
    debouncedQ.length >= 1 &&
    suggestions &&
    suggestions.users.length > 0

  return (
    <div
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
      onClick={handleClose}
    >
      <div
        data-testid="compose-dm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="New message"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          width: '100%',
          maxWidth: '520px',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-lg)',
              fontWeight: 400,
            }}
          >
            New message
          </h2>
          <button
            data-testid="compose-dm-close"
            onClick={handleClose}
            aria-label="Close"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div
          style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-weight-medium)',
                flexShrink: 0,
              }}
            >
              To:
            </span>

            {selectedUser && (
              <div
                data-testid="selected-user-chip"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  background:
                    'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                  color: 'var(--color-accent)',
                  borderRadius: 'var(--radius-full)',
                  padding: '2px 10px 2px 6px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-weight-medium)',
                  flexShrink: 0,
                }}
              >
                <Avatar
                  src={selectedUser.avatarUrl}
                  displayName={selectedUser.displayName}
                  size="xs"
                />
                {selectedUser.displayName}
                <button
                  data-testid="remove-selected-user"
                  onClick={() => {
                    setSelectedUser(null)
                    setQuery('')
                  }}
                  aria-label="Remove"
                  style={{ marginLeft: '2px', color: 'inherit', lineHeight: 1 }}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            )}

            <div style={{ position: 'relative', flex: 1 }}>
              <input
                data-testid="compose-dm-search-input"
                type="text"
                placeholder="Search people…"
                value={query}
                onChange={handleInputChange}
                autoFocus
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text)',
                }}
                aria-label="Search for a person to message"
                aria-autocomplete="list"
                aria-haspopup="listbox"
              />

              {/* Suggestions dropdown */}
              {showDropdown && (
                <ul
                  role="listbox"
                  aria-label="People suggestions"
                  data-testid="dm-user-suggestions"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: '-70px',
                    right: 0,
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-md)',
                    zIndex: 'var(--z-dropdown)',
                    overflow: 'hidden',
                    listStyle: 'none',
                    maxHeight: '240px',
                    overflowY: 'auto',
                    padding: '0.25rem',
                  }}
                >
                  {suggestions.users.map((suggestedUser) => (
                    <li key={suggestedUser.id} role="option" aria-selected="false">
                      <button
                        data-testid={`dm-suggest-user-${suggestedUser.handle}`}
                        onClick={() => handleSelectUser(suggestedUser)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          width: '100%',
                          padding: '0.5rem 0.625rem',
                          borderRadius: 'var(--radius-md)',
                          textAlign: 'left',
                          transition: 'background var(--duration-fast)',
                        }}
                        onMouseEnter={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.background =
                            'var(--color-surface-overlay)'
                        }}
                        onMouseLeave={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.background =
                            'transparent'
                        }}
                      >
                        <Avatar
                          src={suggestedUser.avatarUrl}
                          displayName={suggestedUser.displayName}
                          handle={suggestedUser.handle}
                          size="sm"
                          isVerified={suggestedUser.isVerified}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'var(--font-weight-semibold)',
                              color: 'var(--color-text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {suggestedUser.displayName}
                          </div>
                          <div
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-muted)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            @{suggestedUser.handle}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p
            role="alert"
            data-testid="compose-dm-error"
            style={{
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--color-danger)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {error}
          </p>
        )}

        {/* Empty state when no query */}
        {!selectedUser && !debouncedQ && (
          <div
            style={{
              padding: 'var(--space-8) var(--space-4)',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: 'var(--text-sm)',
            }}
          >
            Search for someone to start a conversation.
          </div>
        )}

        {/* Action footer */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderTop: selectedUser ? '1px solid var(--color-border)' : 'none',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            data-testid="compose-dm-next-button"
            onClick={handleStart}
            disabled={!selectedUser || createConversationMutation.isPending}
            aria-disabled={!selectedUser || createConversationMutation.isPending}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: 'var(--radius-full)',
              background:
                selectedUser && !createConversationMutation.isPending
                  ? 'var(--color-accent)'
                  : 'var(--color-surface-raised)',
              color:
                selectedUser && !createConversationMutation.isPending
                  ? 'var(--color-accent-contrast)'
                  : 'var(--color-text-dimmed)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              transition: 'background var(--duration-fast)',
              cursor:
                selectedUser && !createConversationMutation.isPending
                  ? 'pointer'
                  : 'not-allowed',
            }}
          >
            {createConversationMutation.isPending ? 'Opening…' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
