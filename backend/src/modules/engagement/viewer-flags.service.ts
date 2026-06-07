import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../infra/redis/redis.service';
import { Like } from './like.entity';
import { Bookmark } from './bookmark.entity';
import { PostViewerDto } from '../posts/dto/post.dto';

/**
 * Per-user Redis set key prefixes for viewer-flag hydration.
 *
 * Key taxonomy (per ADR-0004 recommendation: per-user sets):
 *   liked:{userId}      — SADD/SREM on like/unlike; SISMEMBER to check
 *   bookmarked:{userId} — SADD/SREM on bookmark/unbookmark; SISMEMBER to check
 *   reposted:{userId}   — SADD/SREM on repost/unrepost; SISMEMBER to check
 *                         (managed by PostsModule for repost; included here for read-path)
 *
 * TTL: viewer-flag sets are NOT given a TTL because they represent the user's full
 * engagement history. They are invalidated (SREM/SADD) on write. The reconcile job
 * can rebuild them if needed. This matches the "no TTL; reconciled" entry in the
 * Redis key taxonomy table in architecture.md.
 */
export const REDIS_KEY = {
  liked: (userId: string) => `liked:${userId}`,
  bookmarked: (userId: string) => `bookmarked:${userId}`,
  reposted: (userId: string) => `reposted:${userId}`,
} as const;

export interface ViewerFlags {
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
}

/**
 * ViewerFlagsService — batch-hydrate viewer engagement flags for a list of post IDs.
 *
 * Algorithm:
 *   1. Pipeline SISMEMBER against the per-user Redis sets (liked:, bookmarked:).
 *   2. On set miss (key does not exist), fall back to a single DB query for all
 *      post IDs and backfill the Redis set.
 *   3. Return a map of postId → ViewerFlags.
 *
 * Exported so PostsService, TimelineService, etc. can inject and call it.
 */
@Injectable()
export class ViewerFlagsService {
  private readonly logger = new Logger(ViewerFlagsService.name);

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Like)
    private readonly likeRepo: Repository<Like>,
    @InjectRepository(Bookmark)
    private readonly bookmarkRepo: Repository<Bookmark>,
  ) {}

  /**
   * Hydrate viewer flags for the given viewer + list of post IDs.
   * Returns a map: postId → { liked, reposted, bookmarked }.
   * If viewerId is null (anonymous), all flags are false.
   */
  async hydrate(viewerId: string | null, postIds: string[]): Promise<Map<string, PostViewerDto>> {
    const result = new Map<string, PostViewerDto>();

    // Seed defaults
    for (const id of postIds) {
      result.set(id, { liked: false, reposted: false, bookmarked: false });
    }

    if (!viewerId || postIds.length === 0) return result;

    const redis = this.redisService.client;
    const likedKey = REDIS_KEY.liked(viewerId);
    const bookmarkedKey = REDIS_KEY.bookmarked(viewerId);
    const repostedKey = REDIS_KEY.reposted(viewerId);

    // ── Pipelined Redis SISMEMBER for all post IDs ────────────────────────────
    const pipeline = redis.pipeline();

    for (const postId of postIds) {
      pipeline.sismember(likedKey, postId);
      pipeline.sismember(bookmarkedKey, postId);
      pipeline.sismember(repostedKey, postId);
    }

    // Also check whether the liked set exists (to detect cache miss vs empty set)
    pipeline.exists(likedKey);

    let pipelineResults: [Error | null, unknown][];
    try {
      pipelineResults = (await pipeline.exec()) ?? [];
    } catch (err) {
      this.logger.warn(`ViewerFlags pipeline failed, using DB fallback: ${String(err)}`);
      return this.hydrateFromDb(viewerId, postIds, result);
    }

    // Last result is the EXISTS check
    const existsResult = pipelineResults[pipelineResults.length - 1];
    const likedKeyExists = existsResult && !existsResult[0] && (existsResult[1] as number) > 0;

    if (!likedKeyExists) {
      // Redis miss — backfill from DB then re-read from DB directly
      await this.backfillUserSets(viewerId);
      return this.hydrateFromDb(viewerId, postIds, result);
    }

    // Parse pipeline results: 3 results per post (liked, bookmarked, reposted)
    for (let i = 0; i < postIds.length; i++) {
      const postId = postIds[i];
      const likedRes = pipelineResults[i * 3];
      const bookmarkedRes = pipelineResults[i * 3 + 1];
      const repostedRes = pipelineResults[i * 3 + 2];

      result.set(postId, {
        liked: !likedRes?.[0] && likedRes?.[1] === 1,
        bookmarked: !bookmarkedRes?.[0] && bookmarkedRes?.[1] === 1,
        reposted: !repostedRes?.[0] && repostedRes?.[1] === 1,
      });
    }

    return result;
  }

  /**
   * Hydrate from DB (cache-miss fallback).
   */
  private async hydrateFromDb(
    viewerId: string,
    postIds: string[],
    result: Map<string, PostViewerDto>,
  ): Promise<Map<string, PostViewerDto>> {
    if (postIds.length === 0) return result;

    const [likedRows, bookmarkedRows] = await Promise.all([
      this.likeRepo
        .createQueryBuilder('l')
        .select('l.post_id', 'postId')
        .where('l.user_id = :userId AND l.post_id = ANY(:postIds)', {
          userId: viewerId,
          postIds,
        })
        .getRawMany<{ postId: string }>(),
      this.bookmarkRepo
        .createQueryBuilder('b')
        .select('b.post_id', 'postId')
        .where('b.user_id = :userId AND b.post_id = ANY(:postIds)', {
          userId: viewerId,
          postIds,
        })
        .getRawMany<{ postId: string }>(),
    ]);

    const likedSet = new Set(likedRows.map((r) => r.postId));
    const bookmarkedSet = new Set(bookmarkedRows.map((r) => r.postId));

    for (const postId of postIds) {
      const existing = result.get(postId) ?? { liked: false, reposted: false, bookmarked: false };
      result.set(postId, {
        ...existing,
        liked: likedSet.has(postId),
        bookmarked: bookmarkedSet.has(postId),
      });
    }

    return result;
  }

  /**
   * Backfill the per-user liked/bookmarked Redis sets from the DB.
   * Called on cache miss. Adds all post IDs the user has liked/bookmarked.
   * Does NOT set a TTL — these sets are invalidated on write.
   */
  async backfillUserSets(userId: string): Promise<void> {
    const redis = this.redisService.client;
    try {
      const [likedRows, bookmarkedRows] = await Promise.all([
        this.likeRepo
          .createQueryBuilder('l')
          .select('l.post_id', 'postId')
          .where('l.user_id = :userId', { userId })
          .getRawMany<{ postId: string }>(),
        this.bookmarkRepo
          .createQueryBuilder('b')
          .select('b.post_id', 'postId')
          .where('b.user_id = :userId', { userId })
          .getRawMany<{ postId: string }>(),
      ]);

      const pipeline = redis.pipeline();

      if (likedRows.length > 0) {
        pipeline.sadd(REDIS_KEY.liked(userId), ...likedRows.map((r) => r.postId));
      } else {
        // Sentinel so we know the key exists (prevents repeat DB lookups)
        pipeline.set(`liked:${userId}:seeded`, '1', 'EX', 3600);
      }

      if (bookmarkedRows.length > 0) {
        pipeline.sadd(REDIS_KEY.bookmarked(userId), ...bookmarkedRows.map((r) => r.postId));
      }

      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`Failed to backfill viewer sets for user ${userId}: ${String(err)}`);
    }
  }

  /**
   * Convenience method: hydrate flags for a single post.
   */
  async hydrateOne(viewerId: string | null, postId: string): Promise<PostViewerDto> {
    const map = await this.hydrate(viewerId, [postId]);
    return map.get(postId) ?? { liked: false, reposted: false, bookmarked: false };
  }
}
