import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';

export interface TrendDto {
  tag: string;
  postCount: number;
  postsInWindow: number;
}

/**
 * TrendsService — manages time-bucketed trending hashtag counters.
 *
 * Architecture:
 *   On post create: increment `trending:bucket:{tag}:{minuteBucket}` (TTL: 2h)
 *   Cron every ~5min: sum buckets per tag with exponential decay → write `trends:cache` payload
 *   GET /trends: return cached payload (fallback: empty list)
 *
 * Minute bucket: Math.floor(Date.now() / 60000) — groups events per minute.
 * Decay: more recent buckets weight more. We sum 4 time windows:
 *   - Last 15min  (15 buckets) × weight 4
 *   - Last 30min  (15 more)   × weight 2
 *   - Last 60min  (30 more)   × weight 1
 *   - Last 120min (60 more)   × weight 0.5
 *
 * This gives a smooth trending score that favors recent activity.
 */
@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);

  /** Bucket TTL: 2 hours (we look back max 120 minutes) */
  private static readonly BUCKET_TTL_SECS = 7200;
  /** Cached trends key */
  private static readonly TRENDS_CACHE_KEY = 'trends:cache';
  /** Trends cache TTL: 10 minutes (cron runs every 5min) */
  private static readonly TRENDS_CACHE_TTL_SECS = 600;
  /** Number of trending tags to surface */
  private static readonly TOP_N = 10;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Increment trending counters for a list of hashtags.
   * Called from the entity-extraction path on post create.
   */
  async incrementTags(tags: string[]): Promise<void> {
    if (!tags.length) return;

    const minuteBucket = Math.floor(Date.now() / 60000);
    const pipeline = this.redisService.client.pipeline();

    for (const tag of tags) {
      const key = `trending:bucket:${tag.toLowerCase()}:${minuteBucket}`;
      pipeline.incr(key);
      pipeline.expire(key, TrendsService.BUCKET_TTL_SECS);
    }

    await pipeline.exec();
  }

  /**
   * Recompute trends from time-bucketed Redis counters.
   * Called by the BullMQ cron job every ~5 minutes.
   *
   * Algorithm:
   * 1. Scan all `trending:bucket:*` keys (SCAN cursor-based, avoid KEYS in prod)
   * 2. Group by tag, compute decay-weighted score
   * 3. Sort descending, take top N
   * 4. Write to `trends:cache` with TTL
   */
  async recomputeTrends(): Promise<void> {
    const now = Math.floor(Date.now() / 60000);
    const tagScores = new Map<string, number>();

    // SCAN all trending bucket keys
    const keys = await this.scanTrendingKeys();

    for (const key of keys) {
      // Key format: trending:bucket:{tag}:{minuteBucket}
      const parts = key.split(':');
      if (parts.length < 4) continue;

      // Tag can contain colons — reconstruct
      const minuteBucket = parseInt(parts[parts.length - 1], 10);
      const tag = parts.slice(2, parts.length - 1).join(':');

      if (isNaN(minuteBucket)) continue;

      const ageMinutes = now - minuteBucket;
      const weight = this.decayWeight(ageMinutes);
      if (weight === 0) continue; // Too old

      const countStr = await this.redisService.client.get(key);
      const count = parseInt(countStr ?? '0', 10);
      if (!count) continue;

      tagScores.set(tag, (tagScores.get(tag) ?? 0) + count * weight);
    }

    // Sort + take top N
    const sorted = [...tagScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TrendsService.TOP_N);

    const trends: TrendDto[] = sorted.map(([tag, score]) => ({
      tag,
      postCount: Math.round(score), // decay-weighted score used as postsInWindow approximation
      postsInWindow: Math.round(score),
    }));

    await this.redisService.client.setex(
      TrendsService.TRENDS_CACHE_KEY,
      TrendsService.TRENDS_CACHE_TTL_SECS,
      JSON.stringify(trends),
    );

    this.logger.log(`Trends recomputed: ${trends.length} tags`);
  }

  /**
   * Return cached trends payload.
   */
  async getTrends(): Promise<TrendDto[]> {
    const raw = await this.redisService.client.get(TrendsService.TRENDS_CACHE_KEY);
    if (!raw) return [];

    try {
      return JSON.parse(raw) as TrendDto[];
    } catch {
      this.logger.warn('Failed to parse trends cache — returning empty list');
      return [];
    }
  }

  /**
   * Decay weight by age in minutes.
   * Uses 4 time windows with decreasing weights.
   */
  private decayWeight(ageMinutes: number): number {
    if (ageMinutes < 0) return 0;
    if (ageMinutes < 15) return 4;
    if (ageMinutes < 30) return 2;
    if (ageMinutes < 60) return 1;
    if (ageMinutes < 120) return 0.5;
    return 0;
  }

  /**
   * SCAN all `trending:bucket:*` keys without blocking Redis.
   */
  private async scanTrendingKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.redisService.client.scan(
        cursor,
        'MATCH',
        'trending:bucket:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }
}
