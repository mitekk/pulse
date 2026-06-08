import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infra/redis/redis.service';
import { Post } from '../posts/post.entity';
import { Hashtag } from '../posts/hashtag.entity';
import { PostHashtag } from '../posts/post-hashtag.entity';
import { User } from '../users/user.entity';
import { Follow } from '../users/follow.entity';
import { Like } from '../engagement/like.entity';
import { VisibilityService } from '../users/visibility.service';
import { ViewerFlagsService } from '../engagement/viewer-flags.service';
import { EntityExtractorService } from '../posts/entity-extractor.service';
import { PostCacheService } from './post-cache.service';
import { MediaHydrationService } from '../media/media-hydration.service';
import { CursorUtil } from '../../common/utils/cursor.util';
import {
  PostDto,
  PostAuthorDto,
  PostCountsDto,
  PostViewerDto,
  ShallowPostDto,
} from '../posts/dto/post.dto';
import type { ExtractedEntities } from '../posts/entity-extractor.service';

// ── Constants ─────────────────────────────────────────────────────────────────

const HOME_TIMELINE_CAP = 800;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Celebrity pull-merge window: query posts from the past N days */
const CELEBRITY_PULL_DAYS = 7;

// ── Helpers ───────────────────────────────────────────────────────────────────

const homeKey = (userId: string) => `home:${userId}`;

function toAuthorDto(user: User): PostAuthorDto {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: null,
    isVerified: user.isVerified,
    isPrivate: user.isPrivate,
  };
}

function toPostDto(
  post: Post,
  entities: ExtractedEntities,
  viewer: PostViewerDto,
  quoteOf: ShallowPostDto | null = null,
  repostOf: ShallowPostDto | null = null,
  repostedBy: { handle: string; displayName: string } | null = null,
): PostDto {
  const counts: PostCountsDto = {
    replies: post.replyCount,
    reposts: post.repostCount,
    likes: post.likeCount,
    bookmarks: post.bookmarkCount,
  };
  return {
    id: post.id,
    author: toAuthorDto(post.author),
    text: post.deletedAt ? null : post.text,
    createdAt: post.createdAt.toISOString(),
    entities: post.deletedAt ? { mentions: [], hashtags: [], urls: [] } : entities,
    media: [],
    counts,
    viewer,
    replyToId: post.replyToId,
    replyPolicy: post.replyPolicy,
    quoteOf,
    repostOf,
    repostedBy,
    deleted: post.deletedAt !== null,
  };
}

function toShallowDto(post: Post, entities: ExtractedEntities): ShallowPostDto {
  return {
    id: post.id,
    author: toAuthorDto(post.author),
    text: post.deletedAt ? null : post.text,
    createdAt: post.createdAt.toISOString(),
    entities,
    // ShallowPostDto is embedded in PostDto.repostOf / PostDto.quoteOf. The
    // frontend PostCard renders it recursively and accesses post.media — include
    // an empty array so the guard (post.media?.length) does not crash when
    // media is absent from this shallow shape.
    media: [],
    counts: {
      replies: post.replyCount,
      reposts: post.repostCount,
      likes: post.likeCount,
      bookmarks: post.bookmarkCount,
    },
    replyToId: post.replyToId,
    replyPolicy: post.replyPolicy,
    deleted: post.deletedAt !== null,
  };
}

// ── TimelineService ───────────────────────────────────────────────────────────

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);
  private readonly celebrityThreshold: number;

  constructor(
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Like)
    private readonly likeRepo: Repository<Like>,
    @InjectRepository(Hashtag)
    private readonly hashtagRepo: Repository<Hashtag>,
    @InjectRepository(PostHashtag)
    private readonly postHashtagRepo: Repository<PostHashtag>,
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly visibilityService: VisibilityService,
    private readonly viewerFlagsService: ViewerFlagsService,
    private readonly entityExtractor: EntityExtractorService,
    private readonly postCacheService: PostCacheService,
    private readonly mediaHydration: MediaHydrationService,
    private readonly configService: ConfigService,
  ) {
    this.celebrityThreshold =
      this.configService.get<number>('CELEBRITY_FOLLOWER_THRESHOLD') ?? 10_000;
  }

  // ── Home Timeline ──────────────────────────────────────────────────────────

  /**
   * GET /api/v1/timeline/home
   *
   * Read path (hybrid fan-out per ADR-0004):
   *   1. ZREVRANGEBYSCORE home:{userId} cursor page of post IDs
   *   2. MGET post:{id} cache hydration → batch Postgres fallback for misses
   *   3. Backfill cache for misses (post:{id} TTL)
   *   4. VisibilityService.filterPostPage — remove blocked/private/muted posts
   *   5. ViewerFlagsService.hydrate — liked/reposted/bookmarked flags
   *   6. Celebrity pull-merge (live-query recent posts from followed celebrities)
   *   7. Deduplicate + sort by Snowflake score → return cursor page
   *
   * Cold-start: empty zset → fall back to pulling recent posts from followees directly.
   */
  async getHomeFeed(
    userId: string,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const clampedLimit = Math.min(limit, MAX_LIMIT);

    // ── 1. Read cursor page from home:{userId} zset ──────────────────────────
    const redis = this.redisService.client;
    const key = homeKey(userId);

    // Cursor encodes the last score seen (Snowflake BIGINT as string)
    let maxScore: string = '+inf';
    if (cursor) {
      const decoded = CursorUtil.decode(cursor);
      if (decoded.type === 'score_id') {
        // score is stored as a string; subtract 1 to get exclusive lower bound
        maxScore = String(Number(decoded.score) - 1);
      }
    }

    const zsetPostIds: string[] = [];
    const zsetScores: number[] = [];

    try {
      // ZREVRANGEBYSCORE returns highest scores first (newest posts first)
      // We fetch limit+1 to detect hasMore
      const raw = await redis.zrevrangebyscore(
        key,
        maxScore,
        '-inf',
        'WITHSCORES',
        'LIMIT',
        0,
        clampedLimit + 1,
      );

      // raw is interleaved: [member0, score0, member1, score1, ...]
      for (let i = 0; i < raw.length; i += 2) {
        zsetPostIds.push(raw[i]);
        zsetScores.push(Number(raw[i + 1]));
      }
    } catch (err) {
      this.logger.warn(`ZREVRANGEBYSCORE failed for user ${userId}: ${String(err)}`);
    }

    // ── Cold-start fallback: empty zset → pull from followees ──────────────
    if (zsetPostIds.length === 0) {
      return this.coldStartFeed(userId, clampedLimit, cursor);
    }

    const hasMoreFromZset = zsetPostIds.length > clampedLimit;
    const pageIds = zsetPostIds.slice(0, clampedLimit);
    const pageScores = zsetScores.slice(0, clampedLimit);

    // ── 2. Cache hydration: MGET post:{id} ──────────────────────────────────
    const cachedPosts = await this.postCacheService.mget(pageIds);
    const missIds = pageIds.filter((id) => !cachedPosts.has(id));

    // ── 3. Postgres fallback for cache misses ────────────────────────────────
    let dbPosts: Post[] = [];
    if (missIds.length > 0) {
      dbPosts = await this.postRepo.find({
        where: missIds.map((id) => ({ id })),
        relations: { author: true },
        withDeleted: true,
      });

      // Backfill cache for Postgres hits
      const dtosToCachePromises = dbPosts.map(async (p) => {
        const ent = await this.loadEntities(p.id, p.text);
        const vf: PostViewerDto = { liked: false, reposted: false, bookmarked: false };
        return toPostDto(p, ent, vf, null, null, null);
      });
      const dtosToCache = await Promise.all(dtosToCachePromises);
      await this.postCacheService.mset(dtosToCache);
    }

    // ── Build unified post list in zset score order ──────────────────────────
    const dbPostMap = new Map<string, Post>(dbPosts.map((p) => [p.id, p]));

    // Posts from cache — visibility filter needs author context
    // We need to load author info for cached posts too (for filterPostPage)
    const cachedMissingAuthor: string[] = [];
    for (const [id, dto] of cachedPosts) {
      if (!dto.author) cachedMissingAuthor.push(id);
    }

    // Build ordered list of Post-like objects for visibility filtering
    // For cache hits, reconstruct a minimal Post entity-like object
    const postsForVisibility: Post[] = [];
    for (const postId of pageIds) {
      const dbPost = dbPostMap.get(postId);
      if (dbPost) {
        postsForVisibility.push(dbPost);
      } else {
        const dto = cachedPosts.get(postId);
        if (!dto) continue;
        // Reconstruct minimal Post from cached DTO for visibility check
        const fakePost = new Post();
        fakePost.id = dto.id;
        fakePost.authorId = dto.author.id;
        fakePost.author = Object.assign(new User(), {
          id: dto.author.id,
          handle: dto.author.handle,
          displayName: dto.author.displayName,
          isVerified: dto.author.isVerified,
          isPrivate: dto.author.isPrivate,
        });
        fakePost.deletedAt = dto.deleted ? new Date() : null;
        postsForVisibility.push(fakePost);
      }
    }

    // ── 4. Visibility filter ──────────────────────────────────────────────────
    const visiblePosts = await this.visibilityService.filterPostPage(userId, postsForVisibility, {
      suppressDeleted: true,
    });
    const visibleIds = new Set(visiblePosts.map((p) => p.id));

    // Also filter muted authors
    const mutedFilteredIds = new Set<string>();
    for (const p of visiblePosts) {
      const muted = await this.visibilityService.isMuted(userId, p.authorId);
      if (muted) mutedFilteredIds.add(p.id);
    }

    // ── 5. Celebrity pull-merge ───────────────────────────────────────────────
    const celebrityPosts = await this.pullCelebrityPosts(userId, clampedLimit);

    // ── Merge: zset posts + celebrity posts (deduplicate by ID) ──────────────
    const mergedMap = new Map<string, { score: number; post: Post | null; dto: PostDto | null }>();

    // Add zset posts
    for (let i = 0; i < pageIds.length; i++) {
      const id = pageIds[i];
      if (!visibleIds.has(id) || mutedFilteredIds.has(id)) continue;
      const post = dbPostMap.get(id) ?? null;
      const dto = cachedPosts.get(id) ?? null;
      mergedMap.set(id, { score: pageScores[i], post, dto });
    }

    // Add celebrity posts (scored by their snowflake id)
    for (const p of celebrityPosts) {
      if (!mergedMap.has(p.id)) {
        mergedMap.set(p.id, { score: Number(BigInt(p.id)), post: p, dto: null });
      }
    }

    // ── Sort by score DESC ────────────────────────────────────────────────────
    const sortedEntries = [...mergedMap.entries()].sort((a, b) => b[1].score - a[1].score);
    const finalPage = sortedEntries.slice(0, clampedLimit);
    const hasMore = hasMoreFromZset || sortedEntries.length > clampedLimit;

    // ── 5 (cont.). ViewerFlags hydration ─────────────────────────────────────
    const finalIds = finalPage.map(([id]) => id);
    const viewerFlags = await this.viewerFlagsService.hydrate(userId, finalIds);

    // ── Build final PostDto list ──────────────────────────────────────────────
    const items: PostDto[] = [];
    for (const [postId] of finalPage) {
      const entry = mergedMap.get(postId);
      if (!entry) continue;
      const vf = viewerFlags.get(postId) ?? { liked: false, reposted: false, bookmarked: false };

      if (entry.dto && !entry.post) {
        // Cache hit — patch viewer flags
        items.push({ ...entry.dto, viewer: vf });
      } else if (entry.post) {
        const p = entry.post;
        const ent = await this.loadEntities(p.id, p.text);

        // Load quote/repost targets if needed
        let quoteOf: ShallowPostDto | null = null;
        let repostOf: ShallowPostDto | null = null;
        let repostedBy: { handle: string; displayName: string } | null = null;

        if (p.repostOfId) {
          const rp = await this.postRepo.findOne({
            where: { id: p.repostOfId },
            relations: { author: true },
            withDeleted: true,
          });
          if (rp) {
            const rEnt = await this.loadEntities(rp.id, rp.text);
            repostOf = toShallowDto(rp, rEnt);
            repostedBy = { handle: p.author.handle, displayName: p.author.displayName };
          }
        }

        if (p.quoteOfId) {
          const qp = await this.postRepo.findOne({
            where: { id: p.quoteOfId },
            relations: { author: true },
            withDeleted: true,
          });
          if (qp) {
            const qEnt = await this.loadEntities(qp.id, qp.text);
            quoteOf = toShallowDto(qp, qEnt);
          }
        }

        items.push(toPostDto(p, ent, vf, quoteOf, repostOf, repostedBy));
      }
    }

    // ── Build next cursor ─────────────────────────────────────────────────────
    const nextCursor =
      hasMore && finalPage.length > 0
        ? CursorUtil.encodeScoreId(
            String(finalPage[finalPage.length - 1][1].score),
            finalPage[finalPage.length - 1][0],
          )
        : null;

    await this.mediaHydration.apply(items);
    return { items, cursor: nextCursor, hasMore };
  }

  // ── Cold-start: empty home zset → pull recent posts from followees ─────────

  private async coldStartFeed(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    this.logger.debug(`Cold-start feed for user ${userId}`);

    // Get all followee IDs (include self so own posts appear in home feed)
    const follows = await this.followRepo.find({
      where: { followerId: userId, state: 'active' as const },
      select: ['followeeId'],
    });

    const followeeIds = follows.map((f) => f.followeeId);
    // Always include own posts in home feed
    const feedAuthorIds = [...new Set([userId, ...followeeIds])];

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    const qb = this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.author_id = ANY(:ids)', { ids: feedAuthorIds })
      .andWhere('p.deleted_at IS NULL')
      .andWhere('p.repost_of_id IS NULL'); // exclude pure reposts from cold-start (they're confusing without context)

    if (afterIdStr) {
      qb.andWhere('p.id < :afterId', { afterId: afterIdStr });
    }

    qb.orderBy('p.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const filtered = await this.visibilityService.filterPostPage(userId, page, {
      suppressDeleted: true,
    });

    // Filter out posts from muted authors (visibilityService.filterPostPage skips this)
    const mutedAuthorIds = await this.visibilityService.getMutedIds(
      userId,
      filtered.map((p) => p.authorId),
    );
    const muteFiltered = filtered.filter((p) => !mutedAuthorIds.has(p.authorId));

    const pageIds = muteFiltered.map((p) => p.id);
    const viewerFlags = await this.viewerFlagsService.hydrate(userId, pageIds);

    const items: PostDto[] = [];
    for (const p of muteFiltered) {
      const vf = viewerFlags.get(p.id) ?? { liked: false, reposted: false, bookmarked: false };
      const ent = await this.loadEntities(p.id, p.text);
      items.push(toPostDto(p, ent, vf, null, null, null));
    }

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].id) : null;

    await this.mediaHydration.apply(items);
    return { items, cursor: nextCursor, hasMore };
  }

  // ── Celebrity pull-merge helper ────────────────────────────────────────────

  /**
   * Pull recent posts from followed celebrity accounts.
   * Returns raw Post entities (visibility filtering done by caller).
   */
  private async pullCelebrityPosts(userId: string, limit: number): Promise<Post[]> {
    try {
      // Find celebrity followees (followers_count > threshold)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - CELEBRITY_PULL_DAYS);

      const celebrities = await this.dataSource.query<{ id: string }[]>(
        `SELECT u.id
         FROM follows f
         JOIN users u ON u.id = f.followee_id
         WHERE f.follower_id = $1
           AND f.state = 'active'
           AND u.followers_count > $2
           AND u.deleted_at IS NULL`,
        [userId, this.celebrityThreshold],
      );

      if (celebrities.length === 0) return [];

      const celebIds = celebrities.map((c) => c.id);

      const posts = await this.postRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.author', 'author')
        .where('p.author_id = ANY(:ids)', { ids: celebIds })
        .andWhere('p.deleted_at IS NULL')
        .andWhere('p.created_at > :cutoff', { cutoff: cutoffDate.toISOString() })
        .orderBy('p.id', 'DESC')
        .take(limit)
        .getMany();

      return posts;
    } catch (err) {
      this.logger.warn(`Celebrity pull-merge failed: ${String(err)}`);
      return [];
    }
  }

  // ── User timeline tabs ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/users/:handle/posts
   * Author's own posts + reposts (sorted by snowflake ID desc).
   * Reposts are merged in by their repost snowflake time.
   */
  async getUserPosts(
    handle: string,
    viewerId: string | null,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const user = await this.resolveUser(handle, viewerId);

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    // Include the user's own posts + reposts
    const qb = this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.author_id = :authorId', { authorId: user.id })
      .andWhere('p.deleted_at IS NULL');

    if (afterIdStr) {
      qb.andWhere('p.id < :afterId', { afterId: afterIdStr });
    }

    qb.orderBy('p.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    return this.buildPage(rows, viewerId, limit, 'desc');
  }

  /**
   * GET /api/v1/users/:handle/replies
   * Posts with reply_to_id IS NOT NULL (only actual replies, no top-level posts).
   */
  async getUserReplies(
    handle: string,
    viewerId: string | null,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const user = await this.resolveUser(handle, viewerId);

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    const qb = this.postRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.author_id = :authorId', { authorId: user.id })
      .andWhere('p.reply_to_id IS NOT NULL')
      .andWhere('p.deleted_at IS NULL');

    if (afterIdStr) {
      qb.andWhere('p.id < :afterId', { afterId: afterIdStr });
    }

    qb.orderBy('p.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    return this.buildPage(rows, viewerId, limit, 'desc');
  }

  /**
   * GET /api/v1/users/:handle/media
   * Posts that have at least one associated media attachment.
   * Joins post_media to filter to posts with media only.
   */
  async getUserMedia(
    handle: string,
    viewerId: string | null,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const user = await this.resolveUser(handle, viewerId);

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    // Join post_media to only include posts with at least one media attachment.
    // Uses DISTINCT to avoid duplicate rows from multiple media per post.
    const qb = this.postRepo
      .createQueryBuilder('p')
      .innerJoin('post_media', 'pm', 'pm.post_id = p.id')
      .leftJoinAndSelect('p.author', 'author')
      .where('p.author_id = :authorId', { authorId: user.id })
      .andWhere('p.deleted_at IS NULL')
      .andWhere('p.reply_to_id IS NULL')
      .andWhere('p.repost_of_id IS NULL')
      .distinct(true);

    if (afterIdStr) {
      qb.andWhere('p.id < :afterId', { afterId: afterIdStr });
    }

    qb.orderBy('p.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    return this.buildPage(rows, viewerId, limit, 'desc');
  }

  /**
   * GET /api/v1/users/:handle/likes
   * Posts liked by the user. Privacy-gated: 403 if viewer cannot see.
   * Private accounts only show likes to themselves and their followers.
   */
  async getUserLikes(
    handle: string,
    viewerId: string | null,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const user = await this.resolveUser(handle, viewerId);

    // Privacy gate: private accounts only show likes to followers (or self)
    if (user.isPrivate && viewerId !== user.id) {
      if (!viewerId) {
        throw new ForbiddenException({
          error: { code: 'PRIVATE_ACCOUNT', message: 'This account is private' },
        });
      }
      const isFollowing = await this.visibilityService.isActiveFollower(viewerId, user.id);
      if (!isFollowing) {
        throw new ForbiddenException({
          error: { code: 'PRIVATE_ACCOUNT', message: 'This account is private' },
        });
      }
    }

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    // Join likes to posts, ordered by like created_at (the like time, not post time)
    // We use the like's primary key (user_id, post_id) — order by post_id DESC
    const qb = this.likeRepo
      .createQueryBuilder('l')
      .innerJoinAndSelect('l.post', 'p')
      .innerJoinAndSelect('p.author', 'author')
      .where('l.user_id = :userId', { userId: user.id })
      .andWhere('p.deleted_at IS NULL');

    if (afterIdStr) {
      qb.andWhere('l.post_id < :afterId', { afterId: afterIdStr });
    }

    // Use createdAt to avoid TypeORM metadata resolution bug with composite-PK columns.
    qb.orderBy('l.createdAt', 'DESC').take(limit + 1);

    const likeRows = await qb.getMany();
    const hasMore = likeRows.length > limit;
    const page = likeRows.slice(0, limit);
    const posts = page.map((l) => l.post);

    const filtered = await this.visibilityService.filterPostPage(viewerId, posts, {
      suppressDeleted: true,
    });

    const pageIds = filtered.map((p) => p.id);
    const viewerFlags = await this.viewerFlagsService.hydrate(viewerId, pageIds);

    const items: PostDto[] = [];
    for (const p of filtered) {
      const vf = viewerFlags.get(p.id) ?? { liked: false, reposted: false, bookmarked: false };
      const ent = await this.loadEntities(p.id, p.text);
      items.push(toPostDto(p, ent, vf, null, null, null));
    }

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].postId) : null;

    await this.mediaHydration.apply(items);
    return { items, cursor: nextCursor, hasMore };
  }

  // ── Hashtag Timeline ───────────────────────────────────────────────────────

  /**
   * GET /api/v1/timeline/hashtag/:tag
   * Posts with the given hashtag, newest first, cursor-paginated, visibility-filtered.
   */
  async getHashtagTimeline(
    tag: string,
    viewerId: string | null,
    limit = DEFAULT_LIMIT,
    cursor?: string,
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const clampedLimit = Math.min(limit, MAX_LIMIT);

    // Normalize tag (strip leading #, lowercase)
    const normalizedTag = tag.replace(/^#/, '').toLowerCase();

    const hashtag = await this.hashtagRepo.findOne({
      where: { tag: normalizedTag },
    });

    if (!hashtag) {
      return { items: [], cursor: null, hasMore: false };
    }

    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    const qb = this.postHashtagRepo
      .createQueryBuilder('ph')
      .innerJoinAndSelect('ph.post', 'p')
      .innerJoinAndSelect('p.author', 'author')
      .where('ph.hashtag_id = :hashtagId', { hashtagId: hashtag.id })
      .andWhere('p.deleted_at IS NULL');

    if (afterIdStr) {
      qb.andWhere('p.id < :afterId', { afterId: afterIdStr });
    }

    // Use p.id instead of ph.post_id to avoid TypeORM composite-PK orderBy bug
    // (TypeORM fails to resolve metadata for @PrimaryColumn + @ManyToOne composite columns)
    qb.orderBy('p.id', 'DESC').take(clampedLimit + 1);

    const phRows = await qb.getMany();
    const hasMore = phRows.length > clampedLimit;
    const page = phRows.slice(0, clampedLimit);
    const posts = page.map((ph) => ph.post);

    const filtered = await this.visibilityService.filterPostPage(viewerId, posts, {
      suppressDeleted: true,
    });

    const pageIds = filtered.map((p) => p.id);
    const viewerFlags = await this.viewerFlagsService.hydrate(viewerId, pageIds);

    const items: PostDto[] = [];
    for (const p of filtered) {
      const vf = viewerFlags.get(p.id) ?? { liked: false, reposted: false, bookmarked: false };
      const ent = await this.loadEntities(p.id, p.text);
      items.push(toPostDto(p, ent, vf, null, null, null));
    }

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].postId) : null;

    await this.mediaHydration.apply(items);
    return { items, cursor: nextCursor, hasMore };
  }

  // ── Block-purge hook ───────────────────────────────────────────────────────

  /**
   * Called when user A blocks user B.
   * Removes all of B's post IDs from A's home zset (and vice versa).
   * This fulfills the hook comment left in UsersService.block().
   */
  async purgeBlockedPostsFromZset(blockerId: string, blockedId: string): Promise<void> {
    const redis = this.redisService.client;

    try {
      // Get all posts by the blocked user that might be in the blocker's zset
      const blockedPosts = await this.postRepo.find({
        where: { authorId: blockedId },
        select: ['id'],
        withDeleted: true,
      });

      if (blockedPosts.length > 0) {
        const postIds = blockedPosts.map((p) => p.id);
        const pipeline = redis.pipeline();

        // Remove blocked user's posts from blocker's home zset
        pipeline.zrem(homeKey(blockerId), ...postIds);
        // Remove blocker's posts from blocked user's home zset
        const blockerPosts = await this.postRepo.find({
          where: { authorId: blockerId },
          select: ['id'],
          withDeleted: true,
        });
        if (blockerPosts.length > 0) {
          pipeline.zrem(homeKey(blockedId), ...blockerPosts.map((p) => p.id));
        }

        await pipeline.exec();
        this.logger.debug(
          `Block-purge: removed ${postIds.length} posts of ${blockedId} from ${blockerId}'s home zset`,
        );
      }
    } catch (err) {
      this.logger.warn(`Block-purge failed: ${String(err)}`);
    }
  }

  // ── Timeline trim ──────────────────────────────────────────────────────────

  /**
   * Trim a user's home timeline zset to HOME_TIMELINE_CAP.
   * Called by the timeline.trim repeatable cron job.
   */
  async trimHomeZset(userId: string): Promise<void> {
    const redis = this.redisService.client;
    try {
      await redis.zremrangebyrank(homeKey(userId), 0, -(HOME_TIMELINE_CAP + 1));
    } catch (err) {
      this.logger.warn(`timeline.trim failed for user ${userId}: ${String(err)}`);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveUser(handle: string, viewerId: string | null): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { handle: handle as unknown as string },
      withDeleted: false,
    });

    if (!user) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    // Visibility check
    const vis = await this.visibilityService.canViewProfile(viewerId, user);
    if (!vis.visible) {
      if (vis.reason === 'blocked') {
        throw new ForbiddenException({
          error: { code: 'BLOCKED', message: 'Access denied' },
        });
      }
      throw new ForbiddenException({
        error: { code: 'PRIVATE_ACCOUNT', message: 'This account is private' },
      });
    }

    return user;
  }

  private async loadEntities(postId: string, text: string | null): Promise<ExtractedEntities> {
    if (!text) return { mentions: [], hashtags: [], urls: [] };
    return this.entityExtractor.extractAndPersist(postId, text);
  }

  private async buildPage(
    rows: Post[],
    viewerId: string | null,
    limit: number,
    _direction: 'asc' | 'desc',
  ): Promise<{ items: PostDto[]; cursor: string | null; hasMore: boolean }> {
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const filtered = await this.visibilityService.filterPostPage(viewerId, page, {
      suppressDeleted: true,
    });

    const pageIds = filtered.map((p) => p.id);
    const viewerFlags = await this.viewerFlagsService.hydrate(viewerId, pageIds);

    const items: PostDto[] = [];
    for (const p of filtered) {
      const vf = viewerFlags.get(p.id) ?? { liked: false, reposted: false, bookmarked: false };
      const ent = await this.loadEntities(p.id, p.text);

      let repostOf: ShallowPostDto | null = null;
      let repostedBy: { handle: string; displayName: string } | null = null;

      if (p.repostOfId) {
        const rp = await this.postRepo.findOne({
          where: { id: p.repostOfId },
          relations: { author: true },
          withDeleted: true,
        });
        if (rp) {
          const rEnt = await this.loadEntities(rp.id, rp.text);
          repostOf = toShallowDto(rp, rEnt);
          repostedBy = { handle: p.author.handle, displayName: p.author.displayName };
        }
      }

      items.push(toPostDto(p, ent, vf, null, repostOf, repostedBy));
    }

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].id) : null;

    await this.mediaHydration.apply(items);
    return { items, cursor: nextCursor, hasMore };
  }
}
