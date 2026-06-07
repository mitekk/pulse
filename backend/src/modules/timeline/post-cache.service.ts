import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { PostDto } from '../posts/dto/post.dto';

/**
 * PostCacheService — write-through cache helper for the `post:{id}` Redis key.
 *
 * TTL strategy (from ADR-0004):
 *   - Hydrated PostDto cached for POST_CACHE_TTL_SECONDS (4 hours by default).
 *   - Invalidated on edit, soft-delete, or counter-change.
 *   - Counter updates use HINCRBY on `counters:{id}` hash (managed by EngagementService)
 *     rather than re-serialising the full PostDto to keep write amplification low.
 *
 * Key schema:  post:{id}  → JSON string of PostDto
 */
@Injectable()
export class PostCacheService {
  private readonly logger = new Logger(PostCacheService.name);

  /** 4-hour TTL per ADR-0004 */
  static readonly POST_CACHE_TTL_SECONDS = 4 * 60 * 60;

  constructor(private readonly redisService: RedisService) {}

  postKey(postId: string): string {
    return `post:${postId}`;
  }

  // ── write-through / set ──────────────────────────────────────────────────────

  async set(post: PostDto): Promise<void> {
    try {
      await this.redisService.client.set(
        this.postKey(post.id),
        JSON.stringify(post),
        'EX',
        PostCacheService.POST_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`Failed to cache post ${post.id}: ${String(err)}`);
    }
  }

  // ── get (cache-aside read) ───────────────────────────────────────────────────

  async get(postId: string): Promise<PostDto | null> {
    try {
      const raw = await this.redisService.client.get(this.postKey(postId));
      if (!raw) return null;
      return JSON.parse(raw) as PostDto;
    } catch (err) {
      this.logger.warn(`Failed to read cached post ${postId}: ${String(err)}`);
      return null;
    }
  }

  // ── batch MGET ───────────────────────────────────────────────────────────────

  /**
   * Returns a map of postId → PostDto for all IDs that hit the cache.
   * Missing IDs are absent from the returned map.
   */
  async mget(postIds: string[]): Promise<Map<string, PostDto>> {
    const result = new Map<string, PostDto>();
    if (postIds.length === 0) return result;

    try {
      const keys = postIds.map((id) => this.postKey(id));
      const values = await this.redisService.client.mget(...keys);

      for (let i = 0; i < postIds.length; i++) {
        const raw = values[i];
        if (raw) {
          try {
            result.set(postIds[i], JSON.parse(raw) as PostDto);
          } catch {
            // ignore malformed JSON — treat as miss
          }
        }
      }
    } catch (err) {
      this.logger.warn(`MGET failed for ${postIds.length} posts: ${String(err)}`);
    }

    return result;
  }

  // ── batch backfill ───────────────────────────────────────────────────────────

  /**
   * Pipeline-set multiple posts at once (used after Postgres fallback).
   */
  async mset(posts: PostDto[]): Promise<void> {
    if (posts.length === 0) return;
    try {
      const pipeline = this.redisService.client.pipeline();
      for (const post of posts) {
        pipeline.set(
          this.postKey(post.id),
          JSON.stringify(post),
          'EX',
          PostCacheService.POST_CACHE_TTL_SECONDS,
        );
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`Failed to mset ${posts.length} posts: ${String(err)}`);
    }
  }

  // ── invalidate ───────────────────────────────────────────────────────────────

  async del(postId: string): Promise<void> {
    try {
      await this.redisService.client.del(this.postKey(postId));
    } catch (err) {
      this.logger.warn(`Failed to invalidate cached post ${postId}: ${String(err)}`);
    }
  }

  async delMany(postIds: string[]): Promise<void> {
    if (postIds.length === 0) return;
    try {
      const keys = postIds.map((id) => this.postKey(id));
      await this.redisService.client.del(...keys);
    } catch (err) {
      this.logger.warn(`Failed to invalidate ${postIds.length} cached posts: ${String(err)}`);
    }
  }
}
