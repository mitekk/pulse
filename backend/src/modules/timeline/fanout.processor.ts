import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { RedisService } from '../../infra/redis/redis.service';
import { Follow } from '../users/follow.entity';
import { User } from '../users/user.entity';
import { REALTIME_PUBLISHER_PORT, RealtimePublisherPort } from './realtime-publisher.port';

/** Home timeline zset per user */
const homeKey = (userId: string) => `home:${userId}`;

/** Maximum entries kept in home:{userId} zset (per ADR-0004: ~800) */
const HOME_TIMELINE_CAP = 800;

/**
 * FanoutProcessor — consumes `fanout.post` jobs enqueued by PostsService.
 *
 * Algorithm per ADR-0004 (hybrid fan-out):
 *   1. Load the post author's followersCount to check celebrity status.
 *   2. If author is a celebrity (followersCount > CELEBRITY_FOLLOWER_THRESHOLD),
 *      skip push fan-out — followers pull celebrity posts at read time.
 *   3. Otherwise, page through all active followers in batches of 500.
 *   4. For each follower: ZADD NX home:{followerId} <snowflakeScore> <postId>
 *      then ZREMRANGEBYRANK home:{followerId} 0 -(HOME_TIMELINE_CAP+1) to trim.
 *   5. Publish realtime notification to followers (via RealtimePublisherPort).
 *
 * Idempotency: ZADD NX means duplicate jobs are safe — a re-enqueued fanout
 * for the same postId will not double-add to any follower's zset.
 *
 * Job payload:
 *   { postId: string, authorId: string, repostOf?: string }
 *   - postId     = Snowflake ID of the new or repost post (used as zset member)
 *   - authorId   = the user who created/reposted
 *   - repostOf   = original postId when this is a pure repost (attribution)
 *   Scoring: uses postId itself as score (Snowflake = time-ordered BIGINT).
 */
@Processor('fanout')
export class FanoutProcessor extends WorkerHost {
  private readonly logger = new Logger(FanoutProcessor.name);
  private readonly celebrityThreshold: number;

  constructor(
    private readonly redisService: RedisService,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    @Inject(REALTIME_PUBLISHER_PORT)
    private readonly realtimePublisher: RealtimePublisherPort,
  ) {
    super();
    this.celebrityThreshold =
      this.configService.get<number>('CELEBRITY_FOLLOWER_THRESHOLD') ?? 10_000;
  }

  async process(job: Job<{ postId: string; authorId: string; repostOf?: string }>): Promise<void> {
    const { postId, authorId } = job.data;

    this.logger.debug(`fanout.post start postId=${postId} authorId=${authorId}`);

    // ── Celebrity check ───────────────────────────────────────────────────────
    const author = await this.userRepo.findOne({
      where: { id: authorId },
      select: ['id', 'followersCount'],
    });

    if (!author) {
      this.logger.warn(`fanout: author ${authorId} not found, skipping`);
      return;
    }

    if (author.followersCount > this.celebrityThreshold) {
      this.logger.debug(
        `fanout: author ${authorId} is celebrity (${author.followersCount} followers) — skip push`,
      );
      return;
    }

    // ── Fan-out to all active followers in batches ────────────────────────────
    const batchSize = 500;
    let offset = 0;
    let totalPushed = 0;
    const previewIds: string[] = [];

    // Convert Snowflake string to number for zset score
    // Snowflake IDs are time-ordered 64-bit ints; safe to use as float64 score
    // (precision is maintained for values < 2^53)
    const score = Number(BigInt(postId));

    while (true) {
      const followers = await this.followRepo.find({
        where: { followeeId: authorId, state: 'active' as const },
        select: ['followerId'],
        take: batchSize,
        skip: offset,
      });

      if (followers.length === 0) break;

      const redis = this.redisService.client;
      const pipeline = redis.pipeline();

      for (const f of followers) {
        const key = homeKey(f.followerId);
        // NX: only add if member not already present (idempotency)
        pipeline.zadd(key, 'NX', score, postId);
        // Trim to cap: keep the newest HOME_TIMELINE_CAP entries
        // ZREMRANGEBYRANK removes from index 0 (lowest score) to -(CAP+1)
        pipeline.zremrangebyrank(key, 0, -(HOME_TIMELINE_CAP + 1));
      }

      await pipeline.exec();
      totalPushed += followers.length;

      // Collect preview IDs from first few followers for realtime notification
      // (we notify all followers; previewIds is just a sample)
      if (previewIds.length < 5) {
        previewIds.push(postId);
      }

      offset += batchSize;
      if (followers.length < batchSize) break;
    }

    this.logger.debug(`fanout.post done postId=${postId} pushed to ${totalPushed} followers`);

    // ── Realtime notification seam ────────────────────────────────────────────
    // Notify each follower's connected clients about new posts.
    // The no-op implementation logs at debug; subtask 8 replaces with Socket.IO.
    // For performance, we batch-notify all followers in a single DB query
    // and emit to each — but since RealtimePublisherPort is a no-op now,
    // we skip iterating all follower IDs again and just publish a summary.
    // Subtask 8 can refine this by publishing to the Redis fanout:userId channel.
    if (totalPushed > 0) {
      // Publish to Redis pub/sub channel for the realtime layer (subtask 8 subscribes)
      try {
        await this.redisService.client.publish(
          'timeline:newPosts',
          JSON.stringify({ postId, authorId, totalPushed }),
        );
      } catch (err) {
        this.logger.warn(`Failed to publish timeline:newPosts: ${String(err)}`);
      }

      // Also call the injected port (no-op now, Socket.IO gateway later)
      await this.realtimePublisher
        .notifyNewTimelinePosts(authorId, totalPushed, [postId])
        .catch((err) => this.logger.warn(`realtimePublisher failed: ${String(err)}`));
    }
  }
}
