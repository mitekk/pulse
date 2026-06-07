// ============================================================
// Timeline API
// ============================================================

import { apiClient } from './client'
import type { CursorPage, PostDto } from '@/types/api'

export const timelineApi = {
  getHome: (cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/timeline/home?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getHashtag: (tag: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/timeline/hashtag/${encodeURIComponent(tag)}?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),
}
