import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SEARCH_PORT, SearchPort, SearchType, SuggestResult } from './search.port';
import { VisibilityService } from '../users/visibility.service';
import { parseSearchQuery } from './search-query-parser';
import { TimelineService } from '../timeline/timeline.service';
import { PostsService } from '../posts/posts.service';
import { UsersService } from '../users/users.service';
import type { PostDto } from '../posts/dto/post.dto';
import type { UserCardDto } from '../users/dto/user-card.dto';

export interface SearchResponse {
  items: Array<PostDto | UserCardDto>;
  cursor: string | null;
  hasMore: boolean;
}

export interface SuggestResponse {
  users: UserCardDto[];
  tags: Array<{ tag: string; postCount: number }>;
}

/** Limit defaults */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(SEARCH_PORT)
    private readonly searchPort: SearchPort,
    private readonly visibilityService: VisibilityService,
    private readonly timelineService: TimelineService,
    private readonly postsService: PostsService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async search(params: {
    q: string;
    type?: string;
    viewerId: string | null;
    limit?: number;
    cursor?: string;
  }): Promise<SearchResponse> {
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const type: SearchType = this.validateType(params.type);
    const intent = parseSearchQuery(params.q);

    // Route special intents
    if (intent.type === 'hashtag') {
      // Delegate to timeline hashtag query
      const result = await this.timelineService.getHashtagTimeline(
        intent.tag,
        params.viewerId,
        limit,
        params.cursor,
      );
      return { items: result.items, cursor: result.cursor, hasMore: result.hasMore };
    }

    if (intent.type === 'user') {
      // Single user lookup by handle
      const user = await this.usersService
        .getProfile(intent.handle, params.viewerId)
        .catch(() => null);
      if (!user) return { items: [], cursor: null, hasMore: false };
      // Return as UserCardDto
      const card: UserCardDto = {
        id: user.user.id,
        handle: user.user.handle,
        displayName: user.user.displayName,
        avatarUrl: user.user.avatarUrl,
        isVerified: user.user.isVerified,
        isPrivate: user.user.isPrivate,
      };
      return { items: [card], cursor: null, hasMore: false };
    }

    // FTS search
    const { postIds, userIds, nextCursor } = await this.searchPort.search({
      query: intent.ftsQuery,
      type,
      viewerId: params.viewerId,
      limit,
      cursor: params.cursor,
    });

    // People search returns users
    if (type === 'people') {
      const cards = await this.hydrateUsers(userIds, params.viewerId);
      return { items: cards, cursor: nextCursor, hasMore: nextCursor !== null };
    }

    // Post search — hydrate + visibility filter
    const posts = await this.hydratePosts(postIds, params.viewerId);
    return { items: posts, cursor: nextCursor, hasMore: nextCursor !== null };
  }

  async suggest(params: {
    q: string;
    viewerId: string | null;
    limit?: number;
  }): Promise<SuggestResponse> {
    const limit = Math.min(params.limit ?? 10, 20);

    const result: SuggestResult = await this.searchPort.suggest({
      query: params.q,
      viewerId: params.viewerId,
      limit,
    });

    const users = await this.hydrateUsers(result.userIds, params.viewerId);

    // Enrich tags with post counts from hashtags table
    const tags = await this.enrichTags(result.tags);

    return { users, tags };
  }

  private validateType(raw?: string): SearchType {
    const valid: SearchType[] = ['top', 'latest', 'people', 'media'];
    if (raw && valid.includes(raw as SearchType)) return raw as SearchType;
    return 'top';
  }

  private async hydrateUsers(userIds: string[], _viewerId: string | null): Promise<UserCardDto[]> {
    if (!userIds.length) return [];

    const rows = await this.dataSource.query<
      {
        id: string;
        handle: string;
        display_name: string;
        avatar_media_id: string | null;
        is_verified: boolean;
        is_private: boolean;
      }[]
    >(
      `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.is_verified, u.is_private
       FROM users u
       WHERE u.id = ANY($1) AND u.deleted_at IS NULL`,
      [userIds],
    );

    // Preserve ordering from search results
    const map = new Map(rows.map((r) => [r.id, r]));
    return userIds
      .map((id) => {
        const r = map.get(id);
        if (!r) return null;
        const card: UserCardDto = {
          id: r.id,
          handle: r.handle,
          displayName: r.display_name,
          avatarUrl: null, // media URLs resolved via CDN in Phase 6
          isVerified: r.is_verified,
          isPrivate: r.is_private,
        };
        return card;
      })
      .filter((c): c is UserCardDto => c !== null);
  }

  private async hydratePosts(postIds: string[], viewerId: string | null): Promise<PostDto[]> {
    if (!postIds.length) return [];

    const results = await Promise.all(
      postIds.map((id) => this.postsService.findOne(id, viewerId).catch(() => null)),
    );

    const posts: PostDto[] = [];
    for (const r of results) {
      if (r && typeof r === 'object' && 'post' in r && r.post) {
        posts.push(r.post as PostDto);
      }
    }
    return posts;
  }

  private async enrichTags(tags: string[]): Promise<Array<{ tag: string; postCount: number }>> {
    if (!tags.length) return [];

    const rows = await this.dataSource.query<{ tag: string; cnt: string }[]>(
      `SELECT h.tag, COUNT(ph.post_id) AS cnt
       FROM hashtags h
       LEFT JOIN post_hashtags ph ON ph.hashtag_id = h.id
       WHERE h.tag = ANY($1)
       GROUP BY h.tag`,
      [tags],
    );

    const map = new Map(rows.map((r) => [r.tag, parseInt(r.cnt, 10)]));
    return tags.map((tag) => ({ tag, postCount: map.get(tag) ?? 0 }));
  }
}
