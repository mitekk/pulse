import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { RedisService } from '../../infra/redis/redis.service';

interface ReconcileJobData {
  triggeredBy?: string; // 'cron' | manual trigger label
}

/**
 * CountersReconcileProcessor — BullMQ processor for the 'counters.reconcile' repeatable job.
 *
 * Registered on the 'counters' queue.
 *
 * What it does (every 10 minutes by cron):
 *   1. Recompute like_count, bookmark_count, reply_count, repost_count from source tables.
 *   2. For each post where any counter drifted, issue a corrective UPDATE.
 *   3. Also update the Redis counters hash (counters:{postId}) to match the corrected values.
 *
 * The reconciliation runs in batches to avoid long-running transactions.
 * Only posts with nonzero counts are reconciled (posts with all-zero counts are skipped
 * since they haven't drifted).
 */
@Processor('counters')
export class CountersReconcileProcessor extends WorkerHost {
  private readonly logger = new Logger(CountersReconcileProcessor.name);

  /** Batch size for reconciliation queries */
  private static readonly BATCH_SIZE = 500;

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job<ReconcileJobData>): Promise<{ corrected: number }> {
    this.logger.log(`counters.reconcile started (triggered by: ${job.data.triggeredBy ?? 'cron'})`);

    const startedAt = Date.now();
    let totalCorrected = 0;
    let offset = 0;

    // Process posts in batches to avoid full-table locks
    while (true) {
      const batch = await this.reconcileBatch(offset);
      totalCorrected += batch.corrected;

      if (batch.done) break;
      offset += CountersReconcileProcessor.BATCH_SIZE;
    }

    this.logger.log(
      `counters.reconcile done in ${Date.now() - startedAt}ms. Corrected ${totalCorrected} posts.`,
    );

    return { corrected: totalCorrected };
  }

  private async reconcileBatch(offset: number): Promise<{ corrected: number; done: boolean }> {
    /**
     * Query: for each post in this batch, compute the true counts from source tables,
     * compare with the denorm columns, and return rows where they differ.
     *
     * We join against the source tables using subqueries to compute true counts.
     * Posts with like_count=0 AND bookmark_count=0 AND reply_count=0 AND repost_count=0
     * are included so we can correct if they somehow have drift (unlikely, but safe).
     */
    const driftedRows = await this.dataSource.query<
      {
        id: string;
        true_likes: string;
        true_bookmarks: string;
        true_replies: string;
        true_reposts: string;
        like_count: string;
        bookmark_count: string;
        reply_count: string;
        repost_count: string;
      }[]
    >(
      `
      SELECT
        p.id,
        COALESCE((SELECT COUNT(*)::int FROM likes l WHERE l.post_id = p.id), 0)            AS true_likes,
        COALESCE((SELECT COUNT(*)::int FROM bookmarks b WHERE b.post_id = p.id), 0)        AS true_bookmarks,
        COALESCE((SELECT COUNT(*)::int FROM posts r WHERE r.reply_to_id = p.id
                    AND r.deleted_at IS NULL), 0)                                           AS true_replies,
        COALESCE((SELECT COUNT(*)::int FROM posts rp
                    WHERE (rp.repost_of_id = p.id OR rp.quote_of_id = p.id)
                    AND rp.deleted_at IS NULL), 0)                                          AS true_reposts,
        p.like_count,
        p.bookmark_count,
        p.reply_count,
        p.repost_count
      FROM posts p
      WHERE p.deleted_at IS NULL
      ORDER BY p.id ASC
      LIMIT $1 OFFSET $2
    `,
      [CountersReconcileProcessor.BATCH_SIZE, offset],
    );

    if (driftedRows.length === 0) {
      return { corrected: 0, done: true };
    }

    const isDone = driftedRows.length < CountersReconcileProcessor.BATCH_SIZE;

    // Find posts where any counter drifted
    const drifted = driftedRows.filter(
      (row) =>
        parseInt(row.true_likes) !== parseInt(row.like_count) ||
        parseInt(row.true_bookmarks) !== parseInt(row.bookmark_count) ||
        parseInt(row.true_replies) !== parseInt(row.reply_count) ||
        parseInt(row.true_reposts) !== parseInt(row.repost_count),
    );

    if (drifted.length === 0) {
      return { corrected: 0, done: isDone };
    }

    // Correct Postgres denorm columns
    for (const row of drifted) {
      await this.dataSource.query(
        `UPDATE posts
         SET like_count     = $2,
             bookmark_count = $3,
             reply_count    = $4,
             repost_count   = $5
         WHERE id = $1`,
        [
          row.id,
          parseInt(row.true_likes),
          parseInt(row.true_bookmarks),
          parseInt(row.true_replies),
          parseInt(row.true_reposts),
        ],
      );
    }

    // Correct Redis counter hashes (best-effort pipeline)
    try {
      const redis = this.redisService.client;
      const pipeline = redis.pipeline();

      for (const row of drifted) {
        const key = `counters:${row.id}`;
        pipeline.hset(key, {
          likes: parseInt(row.true_likes),
          bookmarks: parseInt(row.true_bookmarks),
          replies: parseInt(row.true_replies),
          reposts: parseInt(row.true_reposts),
        });
      }

      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`Redis counter reconcile update failed: ${String(err)}`);
    }

    this.logger.debug(`Reconciled batch at offset=${offset}: ${drifted.length} posts corrected`);

    return { corrected: drifted.length, done: isDone };
  }
}
