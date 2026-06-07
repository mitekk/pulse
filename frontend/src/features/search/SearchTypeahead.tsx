// ============================================================
// SearchTypeahead — debounced dropdown with users + tags
// Used in the right sidebar / header search box
// Short-circuits: #tag → /tag/:tag, @handle → /@handle
// ============================================================

import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { searchApi } from '@/lib/api/search'
import { queryKeys } from '@/lib/cache/queryKeys'
import { Avatar } from '@/components/Avatar'
import type { UserCardDto, TagDto } from '@/types/api'

interface SearchTypeaheadProps {
  onSearch?: (q: string) => void
  placeholder?: string
  /** Initial value (controlled from URL on search page) */
  defaultValue?: string
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}

interface SuggestDropdownProps {
  users: UserCardDto[]
  tags: TagDto[]
  query: string
  onSelect: () => void
  listboxId: string
}

function SuggestDropdown({ users, tags, query, onSelect, listboxId }: SuggestDropdownProps) {
  const navigate = useNavigate()

  if (users.length === 0 && tags.length === 0) return null

  const handleUserClick = (handle: string) => {
    navigate(`/@${handle}`)
    onSelect()
  }

  const handleTagClick = (tag: string) => {
    navigate(`/tag/${tag}`)
    onSelect()
  }

  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Search suggestions"
      data-testid="search-typeahead-dropdown"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 'var(--z-dropdown)',
        overflow: 'hidden',
        maxHeight: '360px',
        overflowY: 'auto',
        listStyle: 'none',
        padding: '0.375rem',
      }}
    >
      {users.length > 0 && (
        <>
          <li
            role="presentation"
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            People
          </li>
          {users.map((user) => (
            <li key={user.id} role="option" aria-selected="false">
              <button
                data-testid={`suggest-user-${user.handle}`}
                onClick={() => handleUserClick(user.handle)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: 'var(--radius-lg)',
                  transition: 'background var(--duration-fast)',
                  textAlign: 'left',
                }}
              >
                <Avatar src={user.avatarUrl} displayName={user.displayName} handle={user.handle} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
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
                    {user.displayName}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    @{user.handle}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </>
      )}

      {tags.length > 0 && (
        <>
          <li
            role="presentation"
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: users.length > 0 ? '0.25rem' : 0,
            }}
          >
            Trending
          </li>
          {tags.map((tag) => (
            <li key={tag.tag} role="option" aria-selected="false">
              <button
                data-testid={`suggest-tag-${tag.tag}`}
                onClick={() => handleTagClick(tag.tag)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: 'var(--radius-lg)',
                  transition: 'background var(--duration-fast)',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-full)',
                    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent)',
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--font-weight-bold)',
                    flexShrink: 0,
                  }}
                >
                  #
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                      color: 'var(--color-text)',
                    }}
                  >
                    #{tag.tag}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    {tag.postCount.toLocaleString()} posts
                  </div>
                </div>
              </button>
            </li>
          ))}
        </>
      )}

      {/* Search for query CTA */}
      <li role="option" aria-selected="false">
        <button
          data-testid="suggest-search-all"
          onClick={() => {
            // parent handles navigation via onSearch
            onSelect()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.625rem 0.75rem',
            borderRadius: 'var(--radius-lg)',
            transition: 'background var(--duration-fast)',
            borderTop: '1px solid var(--color-border)',
            marginTop: '0.25rem',
            paddingTop: '0.75rem',
            color: 'var(--color-accent)',
            textAlign: 'left',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M18 18l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Search for "{query}"
        </button>
      </li>
    </ul>
  )
}

export function SearchTypeahead({ onSearch, placeholder = 'Search', defaultValue = '' }: SearchTypeaheadProps) {
  const [inputValue, setInputValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const debouncedQ = useDebounce(inputValue.trim(), 250)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  // Update input when defaultValue changes (e.g. from URL)
  useEffect(() => {
    setInputValue(defaultValue)
  }, [defaultValue])

  const { data: suggestions } = useQuery({
    queryKey: queryKeys.search.suggest(debouncedQ),
    queryFn: () => searchApi.suggest(debouncedQ),
    staleTime: 30_000,
    enabled: debouncedQ.length >= 2 && open,
  })

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const q = inputValue.trim()
        if (!q) return

        setOpen(false)

        // Short-circuit routing
        if (q.startsWith('#')) {
          const tag = q.slice(1)
          navigate(`/tag/${tag}`)
        } else if (q.startsWith('@')) {
          const handle = q.slice(1)
          navigate(`/@${handle}`)
        } else {
          onSearch?.(q)
          navigate(`/search?q=${encodeURIComponent(q)}&type=top`)
        }
      } else if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    },
    [inputValue, navigate, onSearch],
  )

  const handleSelect = () => {
    setOpen(false)
    const q = inputValue.trim()
    if (q) {
      onSearch?.(q)
    }
  }

  const showDropdown =
    open &&
    debouncedQ.length >= 2 &&
    suggestions &&
    (suggestions.users.length > 0 || suggestions.tags.length > 0)

  return (
    <div
      ref={containerRef}
      data-testid="search-typeahead"
      style={{ position: 'relative', width: '100%' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          background: 'var(--color-surface)',
          border: '1.5px solid',
          borderColor: open ? 'var(--color-accent)' : 'transparent',
          borderRadius: 'var(--radius-full)',
          padding: '0.5rem 1rem',
          transition: 'border-color var(--duration-fast)',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M18 18l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          data-testid="search-input"
          type="search"
          role="combobox"
          aria-expanded={showDropdown ? 'true' : 'false'}
          aria-autocomplete="list"
          aria-controls={listboxId}
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            background: 'transparent',
            outline: 'none',
            border: 'none',
            minWidth: 0,
          }}
        />
        {inputValue && (
          <button
            data-testid="search-clear"
            onClick={() => {
              setInputValue('')
              setOpen(false)
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            style={{
              color: 'var(--color-text-muted)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <SuggestDropdown
          users={suggestions.users}
          tags={suggestions.tags}
          query={debouncedQ}
          onSelect={handleSelect}
          listboxId={listboxId}
        />
      )}
    </div>
  )
}
