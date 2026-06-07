// ============================================================
// useDmComposer — optimistic DM send with clientNonce
//
// Flow:
//   1. Generate clientNonce (crypto.randomUUID)
//   2. Append an "optimistic" bubble to the messages cache (status='sending')
//   3. Emit dm.send via WS AND POST via REST (dual-path, server deduplicates by nonce)
//   4. On WS echo (dm.message event from server): reconcile by nonce — replace
//      the optimistic entry with the canonical MessageDto
//   5. On error: mark the optimistic bubble status='failed' for retry UI
// ============================================================

import { useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { messagingApi } from '@/lib/api/messaging'
import { emitSendMessage } from '@/lib/realtime/roomManager'
import { queryKeys } from '@/lib/cache/queryKeys'
import type { MessageDto, CursorPage } from '@/types/api'

export interface OptimisticMessage extends MessageDto {
  _status: 'sending' | 'failed'
  _localNonce: string
}

export type MessageEntry = MessageDto | OptimisticMessage

export function isOptimistic(msg: MessageEntry): msg is OptimisticMessage {
  return '_status' in msg
}

interface UseDmComposerOptions {
  conversationId: string
  currentUserId: string
}

interface UseDmComposerResult {
  send: (text: string, mediaId?: string) => Promise<void>
  retry: (nonce: string) => Promise<void>
  isSending: boolean
  sendError: string | null
}

export function useDmComposer({
  conversationId,
  currentUserId,
}: UseDmComposerOptions): UseDmComposerResult {
  const queryClient = useQueryClient()
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  // Track pending nonces so we can reconcile with WS echo
  const pendingNoncesRef = useRef<Set<string>>(new Set())

  const appendOptimistic = useCallback(
    (nonce: string, text: string, mediaId?: string) => {
      const optimistic: OptimisticMessage = {
        id: `optimistic-${nonce}`,
        conversationId,
        senderId: currentUserId,
        text: text || null,
        media: null,
        clientNonce: nonce,
        createdAt: new Date().toISOString(),
        _status: 'sending',
        _localNonce: nonce,
      }
      void mediaId // media preview not implemented in optimistic path; shown after reconcile

      const key = queryKeys.conversations.messages(conversationId)
      queryClient.setQueryData<{ pages: CursorPage<MessageEntry>[]; pageParams: unknown[] }>(
        key,
        (prev) => {
          if (!prev) {
            // No cache yet — seed with a page containing just the optimistic message
            return {
              pages: [{ items: [optimistic], cursor: null, hasMore: false }],
              pageParams: [null],
            }
          }
          const [firstPage, ...rest] = prev.pages
          return {
            ...prev,
            pages: [
              {
                ...firstPage,
                items: [optimistic, ...firstPage.items],
              },
              ...rest,
            ],
          }
        },
      )

      return optimistic
    },
    [conversationId, currentUserId, queryClient],
  )

  const markFailed = useCallback(
    (nonce: string) => {
      const key = queryKeys.conversations.messages(conversationId)
      queryClient.setQueryData<{ pages: CursorPage<MessageEntry>[]; pageParams: unknown[] }>(
        key,
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.map((msg) => {
                if (isOptimistic(msg) && msg._localNonce === nonce) {
                  return { ...msg, _status: 'failed' as const }
                }
                return msg
              }),
            })),
          }
        },
      )
    },
    [conversationId, queryClient],
  )

  const removeOptimistic = useCallback(
    (nonce: string) => {
      const key = queryKeys.conversations.messages(conversationId)
      queryClient.setQueryData<{ pages: CursorPage<MessageEntry>[]; pageParams: unknown[] }>(
        key,
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              items: page.items.filter(
                (msg) => !(isOptimistic(msg) && msg._localNonce === nonce),
              ),
            })),
          }
        },
      )
    },
    [conversationId, queryClient],
  )

  const doSend = useCallback(
    async (text: string, mediaId?: string, nonce?: string): Promise<void> => {
      const clientNonce = nonce ?? crypto.randomUUID()
      setIsSending(true)
      setSendError(null)

      appendOptimistic(clientNonce, text, mediaId)
      pendingNoncesRef.current.add(clientNonce)

      // Emit via WS (fast path) + REST (reliable path); server deduplicates by nonce
      emitSendMessage({ conversationId, text: text || undefined, mediaId, clientNonce })

      try {
        const { message } = await messagingApi.sendMessage(conversationId, {
          text: text || undefined,
          mediaId,
          clientNonce,
        })
        // REST succeeded — the WS echo may already have reconciled; remove optimistic
        // and let the eventRouter's handleDmMessage inject the canonical message.
        // If WS echo hasn't arrived yet the REST response gives us the canonical dto.
        pendingNoncesRef.current.delete(clientNonce)
        removeOptimistic(clientNonce)

        // Inject canonical message into cache (idempotent if WS already did it)
        const key = queryKeys.conversations.messages(conversationId)
        queryClient.setQueryData<{ pages: CursorPage<MessageDto>[]; pageParams: unknown[] }>(
          key,
          (prev) => {
            if (!prev) return prev
            // Check if already injected by WS echo
            const alreadyPresent = prev.pages.some((page) =>
              page.items.some((m) => m.clientNonce === clientNonce && !isOptimistic(m as MessageEntry)),
            )
            if (alreadyPresent) return prev
            const [firstPage, ...rest] = prev.pages
            return {
              ...prev,
              pages: [{ ...firstPage, items: [message, ...firstPage.items] }, ...rest],
            }
          },
        )
      } catch (err) {
        pendingNoncesRef.current.delete(clientNonce)
        markFailed(clientNonce)
        setSendError(err instanceof Error ? err.message : 'Failed to send message')
      } finally {
        setIsSending(false)
      }
    },
    [conversationId, appendOptimistic, removeOptimistic, markFailed, queryClient],
  )

  const send = useCallback(
    (text: string, mediaId?: string) => doSend(text, mediaId),
    [doSend],
  )

  const retry = useCallback(
    (nonce: string) => {
      // Find the failed message text
      const key = queryKeys.conversations.messages(conversationId)
      const data = queryClient.getQueryData<{ pages: CursorPage<MessageEntry>[] }>(key)
      let failedText = ''
      if (data) {
        for (const page of data.pages) {
          for (const msg of page.items) {
            if (isOptimistic(msg) && msg._localNonce === nonce) {
              failedText = msg.text ?? ''
              break
            }
          }
        }
      }
      // Remove the old failed bubble and re-send (no media retry in this path)
      removeOptimistic(nonce)
      return doSend(failedText, undefined, nonce)
    },
    [conversationId, doSend, removeOptimistic, queryClient],
  )

  return { send, retry, isSending, sendError }
}
