// ============================================================
// Users & Profiles API
// ============================================================

import { apiClient } from './client'
import type { ProfileDto, CursorPage, PostDto, UserCardDto } from '@/types/api'

export interface UpdateProfileRequest {
  displayName?: string
  bio?: string
  location?: string
  website?: string
  avatarMediaId?: string
  bannerMediaId?: string
  isPrivate?: boolean
  dmPrivacy?: 'everyone' | 'following'
}

export const usersApi = {
  getProfile: (handle: string) =>
    apiClient.get<{ user: ProfileDto }>(`/users/${handle}`),

  updateMe: (body: UpdateProfileRequest) =>
    apiClient.patch<{ user: ProfileDto }>('/users/me', body),

  getPosts: (handle: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/users/${handle}/posts?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getReplies: (handle: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/users/${handle}/replies?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getMedia: (handle: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/users/${handle}/media?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getLikes: (handle: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto>>(
      `/users/${handle}/likes?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getFollowers: (handle: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<UserCardDto>>(
      `/users/${handle}/followers?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  getFollowing: (handle: string, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<UserCardDto>>(
      `/users/${handle}/following?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),
}
