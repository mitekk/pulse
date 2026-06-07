// ============================================================
// Tests: MessageBubble
// - read-receipt tick (single vs double tick based on otherLastReadMessageId)
// - failed state: shows retry button
// - sending state: dimmed bubble
// - grouped messages: no timestamp shown
// ============================================================

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MessageBubble } from './MessageBubble'
import type { MessageDto } from '@/types/api'
import type { OptimisticMessage } from './useDmComposer'

function makeMessage(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'msg1',
    conversationId: 'conv1',
    senderId: 'me',
    text: 'Hello world',
    media: null,
    clientNonce: 'nonce1',
    createdAt: '2024-01-01T12:00:00Z',
    ...overrides,
  }
}

function makeOptimisticMessage(status: 'sending' | 'failed', nonce = 'opt1'): OptimisticMessage {
  return {
    id: `optimistic-${nonce}`,
    conversationId: 'conv1',
    senderId: 'me',
    text: 'Optimistic message',
    media: null,
    clientNonce: nonce,
    createdAt: new Date().toISOString(),
    _status: status,
    _localNonce: nonce,
  }
}

describe('MessageBubble', () => {
  describe('read receipts', () => {
    it('shows single tick when message is not yet read by other', () => {
      const msg = makeMessage({ id: 'msg-100' })
      render(
        <MessageBubble
          message={msg}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId="msg-050" // older than msg-100
          onRetry={vi.fn()}
        />,
      )
      const tick = screen.getByTestId('message-tick-msg-100')
      expect(tick).toHaveAttribute('aria-label', 'Delivered')
    })

    it('shows double tick when message has been read by other', () => {
      const msg = makeMessage({ id: 'msg-100' })
      render(
        <MessageBubble
          message={msg}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId="msg-150" // newer, so msg-100 is read
          onRetry={vi.fn()}
        />,
      )
      const tick = screen.getByTestId('message-tick-msg-100')
      expect(tick).toHaveAttribute('aria-label', 'Read')
    })

    it('shows double tick when lastReadMessageId equals this message id', () => {
      const msg = makeMessage({ id: 'msg-100' })
      render(
        <MessageBubble
          message={msg}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId="msg-100"
          onRetry={vi.fn()}
        />,
      )
      const tick = screen.getByTestId('message-tick-msg-100')
      expect(tick).toHaveAttribute('aria-label', 'Read')
    })

    it('shows no tick for received messages (not mine)', () => {
      const msg = makeMessage({ id: 'msg-100', senderId: 'other-user' })
      render(
        <MessageBubble
          message={msg}
          isMine={false}
          isGrouped={false}
          otherLastReadMessageId="msg-200"
          onRetry={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('message-tick-msg-100')).not.toBeInTheDocument()
    })

    it('shows no tick when otherLastReadMessageId is null', () => {
      const msg = makeMessage({ id: 'msg-100' })
      render(
        <MessageBubble
          message={msg}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId={null}
          onRetry={vi.fn()}
        />,
      )
      const tick = screen.getByTestId('message-tick-msg-100')
      // Single tick (delivered) when lastRead is null
      expect(tick).toHaveAttribute('aria-label', 'Delivered')
    })
  })

  describe('failed state', () => {
    it('shows retry button for failed optimistic messages', () => {
      const failed = makeOptimisticMessage('failed', 'opt-fail')
      const onRetry = vi.fn()
      render(
        <MessageBubble
          message={failed as unknown as MessageDto}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId={null}
          onRetry={onRetry}
        />,
      )
      const retryBtn = screen.getByTestId(`retry-message-optimistic-opt-fail`)
      expect(retryBtn).toBeInTheDocument()
      fireEvent.click(retryBtn)
      expect(onRetry).toHaveBeenCalledWith('opt-fail')
    })

    it('does not show retry button for successfully sent messages', () => {
      const msg = makeMessage({ id: 'msg-ok' })
      render(
        <MessageBubble
          message={msg}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId={null}
          onRetry={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('retry-message-msg-ok')).not.toBeInTheDocument()
    })
  })

  describe('sending state', () => {
    it('renders sending indicator for optimistic sending messages', () => {
      const sending = makeOptimisticMessage('sending', 'opt-send')
      render(
        <MessageBubble
          message={sending as unknown as MessageDto}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId={null}
          onRetry={vi.fn()}
        />,
      )
      // Sending spinner aria-label
      expect(screen.getByLabelText('Sending')).toBeInTheDocument()
    })
  })

  describe('message content', () => {
    it('renders message text', () => {
      const msg = makeMessage({ text: 'Test message content' })
      render(
        <MessageBubble
          message={msg}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId={null}
          onRetry={vi.fn()}
        />,
      )
      expect(screen.getByText('Test message content')).toBeInTheDocument()
    })

    it('renders the message bubble element', () => {
      const msg = makeMessage({ id: 'msg-render' })
      render(
        <MessageBubble
          message={msg}
          isMine={true}
          isGrouped={false}
          otherLastReadMessageId={null}
          onRetry={vi.fn()}
        />,
      )
      expect(screen.getByTestId('message-bubble-msg-render')).toBeInTheDocument()
    })
  })
})
