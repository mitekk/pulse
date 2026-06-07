// ============================================================
// Messaging (DMs) API
// ============================================================

import { apiClient } from './client'
import type { ConversationDto, MessageDto, CursorPage } from '@/types/api'

export interface SendMessageRequest {
  text?: string
  mediaId?: string
  clientNonce: string
}

export const messagingApi = {
  getConversations: (cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<ConversationDto>>(
      `/conversations?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  createConversation: (recipientHandle: string) =>
    apiClient.post<{ conversation: ConversationDto }>('/conversations', {
      recipientHandle,
    }),

  getMessages: (conversationId: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<MessageDto>>(
      `/conversations/${conversationId}/messages?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  sendMessage: (conversationId: string, body: SendMessageRequest) =>
    apiClient.post<{ message: MessageDto }>(
      `/conversations/${conversationId}/messages`,
      body,
    ),

  markRead: (conversationId: string, lastReadMessageId: string) =>
    apiClient.post<{ ok: true }>(`/conversations/${conversationId}/read`, {
      lastReadMessageId,
    }),

  mute: (conversationId: string) =>
    apiClient.post<{ muted: true }>(`/conversations/${conversationId}/mute`),

  unmute: (conversationId: string) =>
    apiClient.delete<{ muted: false }>(`/conversations/${conversationId}/mute`),
}
