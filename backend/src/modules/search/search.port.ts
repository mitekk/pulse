/**
 * SearchPort — swap seam for the search backend (ADR-0005).
 *
 * Default implementation: PostgresSearchAdapter (FTS + pg_trgm).
 * Future swap: Elasticsearch/OpenSearch adapter — only this interface changes.
 */

export const SEARCH_PORT = 'SEARCH_PORT';

export type SearchType = 'top' | 'latest' | 'people' | 'media';

export interface PostSearchResult {
  postId: string;
  score?: number;
}

export interface UserSearchResult {
  userId: string;
  score?: number;
}

export interface SearchResults {
  posts: PostSearchResult[];
  users: UserSearchResult[];
}

export interface SearchOptions {
  query: string;
  type: SearchType;
  viewerId: string | null;
  limit: number;
  /** ISO timestamp cursor for latest mode; score+id cursor for top/media */
  cursor?: string;
}

export interface SuggestOptions {
  query: string;
  viewerId: string | null;
  limit: number;
}

export interface SuggestResult {
  userIds: string[];
  tags: string[];
}

export interface SearchPort {
  search(options: SearchOptions): Promise<{
    postIds: string[];
    userIds: string[];
    nextCursor: string | null;
  }>;

  suggest(options: SuggestOptions): Promise<SuggestResult>;
}
