// ============================================================
// Notifications API
// ============================================================

import { apiClient } from './client'
import type { NotificationDto, CursorPage } from '@/types/api'

export const notificationsApi = {
  getNotifications: (cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<NotificationDto>>(
      `/notifications?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getUnreadCount: () =>
    apiClient.get<{ count: number }>('/notifications/unread-count'),

  markRead: (ids?: string[]) =>
    apiClient.post<{ updated: number }>('/notifications/read', ids ? { ids } : {}),
}
