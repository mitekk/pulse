// ============================================================
// Posts API
// ============================================================

import { apiClient } from './client'
import type { PostDto, CursorPage, UserCardDto } from '@/types/api'
import type { ReplyPolicy } from '@/types/api'

export interface CreatePostRequest {
  text?: string
  mediaIds?: string[]
  replyToId?: string
  quoteOfId?: string
  replyPolicy?: ReplyPolicy
}

export interface ThreadResponse {
  ancestors: PostDto[]
  post: PostDto
  replies: PostDto[]
  cursor: string | null
  hasMore: boolean
}

export const postsApi = {
  create: (body: CreatePostRequest) =>
    apiClient.post<{ post: PostDto }>('/posts', body),

  getById: (id: string) =>
    apiClient.get<{ post: PostDto }>(`/posts/${id}`),

  deleteById: (id: string) =>
    apiClient.delete<void>(`/posts/${id}`),

  getThread: (id: string) =>
    apiClient.get<ThreadResponse>(`/posts/${id}/thread`),

  getReplies: (id: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/posts/${id}/replies?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getReposts: (id: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<UserCardDto>>(
      `/posts/${id}/reposts?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getQuotes: (id: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/posts/${id}/quotes?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getLikes: (id: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<UserCardDto>>(
      `/posts/${id}/likes?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),
}
