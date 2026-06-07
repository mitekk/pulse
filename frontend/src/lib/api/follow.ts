// ============================================================
// Follow Graph & Follow Requests API
// ============================================================

import { apiClient } from './client'
import type { CursorPage, FollowRequestDto } from '@/types/api'

export type FollowState = 'active' | 'pending'

export const followApi = {
  follow: (handle: string) =>
    apiClient.post<{ state: FollowState }>(`/users/${handle}/follow`),

  unfollow: (handle: string) =>
    apiClient.delete<void>(`/users/${handle}/follow`),

  block: (handle: string) =>
    apiClient.post<{ blocked: true }>(`/users/${handle}/block`),

  unblock: (handle: string) =>
    apiClient.delete<void>(`/users/${handle}/block`),

  mute: (handle: string) =>
    apiClient.post<{ muted: true }>(`/users/${handle}/mute`),

  unmute: (handle: string) =>
    apiClient.delete<void>(`/users/${handle}/mute`),

  // ── Follow requests (private accounts) ───────────────────
  getFollowRequests: (cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<FollowRequestDto>>(
      `/follow-requests?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  acceptFollowRequest: (id: string) =>
    apiClient.post<{ state: 'active' }>(`/follow-requests/${id}/accept`),

  declineFollowRequest: (id: string) =>
    apiClient.post<{ state: 'declined' }>(`/follow-requests/${id}/decline`),
}
