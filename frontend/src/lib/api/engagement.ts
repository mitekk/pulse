// ============================================================
// Engagement API — likes, reposts, bookmarks
// ============================================================

import { apiClient } from './client'
import type { CursorPage, PostDto } from '@/types/api'

export const engagementApi = {
  like: (postId: string) =>
    apiClient.post<{ liked: true; count: number }>(`/posts/${postId}/like`),

  unlike: (postId: string) =>
    apiClient.delete<{ liked: false; count: number }>(`/posts/${postId}/like`),

  repost: (postId: string) =>
    apiClient.post<{ reposted: true; count: number }>(`/posts/${postId}/repost`),

  unrepost: (postId: string) =>
    apiClient.delete<{ reposted: false; count: number }>(`/posts/${postId}/repost`),

  bookmark: (postId: string) =>
    apiClient.post<{ bookmarked: true }>(`/posts/${postId}/bookmark`),

  unbookmark: (postId: string) =>
    apiClient.delete<{ bookmarked: false }>(`/posts/${postId}/bookmark`),

  getBookmarks: (cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/bookmarks?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),
}
