// ============================================================
// Search API
// ============================================================

import { apiClient } from './client'
import type { PostDto, UserCardDto, TagDto, TrendDto, CursorPage } from '@/types/api'

export type SearchType = 'top' | 'latest' | 'people' | 'media'

export interface SearchSuggestResponse {
  users: UserCardDto[]
  tags: TagDto[]
}

export interface TrendsResponse {
  trends: TrendDto[]
}

export const searchApi = {
  search: (q: string, type: SearchType, cursor?: string, limit = 20) =>
    apiClient.get<CursorPage<PostDto | UserCardDto>>(
      `/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`,
    ),

  suggest: (q: string) =>
    apiClient.get<SearchSuggestResponse>(
      `/search/suggest?q=${encodeURIComponent(q)}`,
    ),

  getTrends: () =>
    apiClient.get<TrendsResponse>('/trends'),
}
