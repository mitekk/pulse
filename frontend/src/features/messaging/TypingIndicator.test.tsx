// ============================================================
// Tests: TypingIndicator
// - hidden when no one is typing
// - shown when other user is typing
// - hides current user from typing indicator
// - typing indicator auto-expiry (via typingStore TTL)
// ============================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TypingIndicator } from './TypingIndicator'
import { useTypingStore } from '@/lib/stores/typingStore'

const PARTICIPANTS = [
  { id: 'user1', handle: 'alice', displayName: 'Alice', avatarUrl: null, isVerified: false, isPrivate: false },
  { id: 'user2', handle: 'bob', displayName: 'Bob', avatarUrl: null, isVerified: false, isPrivate: false },
]

describe('TypingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset typing store
    useTypingStore.setState({ typingUsers: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
    useTypingStore.setState({ typingUsers: {} })
  })

  it('renders nothing when no one is typing', () => {
    const { container } = render(
      <TypingIndicator
        conversationId="conv1"
        currentUserId="user1"
        participants={PARTICIPANTS}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows typing indicator when other user is typing', () => {
    // Set bob typing in conv1
    act(() => {
      useTypingStore.getState().setTyping('conv1', 'user2')
    })

    render(
      <TypingIndicator
        conversationId="conv1"
        currentUserId="user1"
        participants={PARTICIPANTS}
      />,
    )

    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument()
    expect(screen.getByText(/Bob is typing/)).toBeInTheDocument()
  })

  it('does NOT show indicator when only current user is typing', () => {
    // Set alice (current user) typing — should be excluded
    act(() => {
      useTypingStore.getState().setTyping('conv1', 'user1')
    })

    const { container } = render(
      <TypingIndicator
        conversationId="conv1"
        currentUserId="user1"
        participants={PARTICIPANTS}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('does NOT show indicator for a different conversation', () => {
    // Set typing for conv2, not conv1
    act(() => {
      useTypingStore.getState().setTyping('conv2', 'user2')
    })

    const { container } = render(
      <TypingIndicator
        conversationId="conv1"
        currentUserId="user1"
        participants={PARTICIPANTS}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('auto-expires the typing indicator after TTL (store removes the entry)', () => {
    act(() => {
      useTypingStore.getState().setTyping('conv1', 'user2')
    })

    // Before TTL: entry present
    expect(useTypingStore.getState().typingUsers['conv1:user2']).toBeDefined()

    // Fast-forward past the 4s TTL — the store's setTimeout removes the key
    act(() => {
      vi.advanceTimersByTime(4200)
    })

    // After TTL, typingStore removes the entry
    expect(useTypingStore.getState().typingUsers['conv1:user2']).toBeUndefined()
  })
})
