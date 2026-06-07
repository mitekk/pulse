/**
 * CountersReconcileProcessor unit tests.
 *
 * Covers:
 *   - process() returns { corrected: N } for N drifted posts
 *   - process() corrects Postgres denorm columns for drifted posts
 *   - process() updates Redis counter hashes for drifted posts
 *   - process() skips posts where counters are accurate
 *   - reconcileBatch() stops iteration when batch is smaller than BATCH_SIZE
 */
import { describe, it, expect, vi } from 'vitest';
import { CountersReconcileProcessor } from '../../../src/modules/engagement/counters-reconcile.processor';
import { Job } from 'bullmq';

// ── Builder ───────────────────────────────────────────────────────────────────

function buildProcessor() {
  const redisPipeline = {
    hset: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redisClient = {
    pipeline: vi.fn().mockReturnValue(redisPipeline),
  };

  const redisService = {
    client: redisClient,
  };

  const dataSource = {
    query: vi.fn(),
  };

  const processor = new CountersReconcileProcessor(dataSource as never, redisService as never);

  // Create a fake job
  const job = {
    data: { triggeredBy: 'test' },
  } as Job<{ triggeredBy?: string }>;

  return { processor, dataSource, redisService, redisPipeline, job };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CountersReconcileProcessor.process', () => {
  it('returns { corrected: 0 } when all counters are accurate', async () => {
    const { processor, dataSource, job } = buildProcessor();

    // First batch: one post with accurate counters; size < BATCH_SIZE → done=true immediately
    dataSource.query.mockResolvedValueOnce([
      {
        id: 'p1',
        true_likes: '5',
        true_bookmarks: '2',
        true_replies: '3',
        true_reposts: '1',
        like_count: '5',
        bookmark_count: '2',
        reply_count: '3',
        repost_count: '1',
      },
    ]);

    const result = await processor.process(job);

    expect(result).toEqual({ corrected: 0 });
    // Only one SELECT — batch size < BATCH_SIZE so done=true without a second query
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('corrects Postgres denorm columns for drifted posts', async () => {
    const { processor, dataSource, job } = buildProcessor();

    // First batch: one post where like_count drifted (size < BATCH_SIZE → done=true)
    // Then one UPDATE call
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'p1',
          true_likes: '6', // true count
          true_bookmarks: '2',
          true_replies: '3',
          true_reposts: '1',
          like_count: '5', // stale
          bookmark_count: '2',
          reply_count: '3',
          repost_count: '1',
        },
      ])
      .mockResolvedValueOnce(undefined); // UPDATE

    const result = await processor.process(job);

    expect(result).toEqual({ corrected: 1 });

    // Find the UPDATE call
    const updateCall = dataSource.query.mock.calls.find((call) =>
      (call[0] as string).includes('UPDATE posts'),
    );
    expect(updateCall).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(updateCall![1]).toEqual(['p1', 6, 2, 3, 1]);
  });

  it('updates Redis counter hashes for corrected posts', async () => {
    const { processor, dataSource, redisPipeline, job } = buildProcessor();

    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'p1',
          true_likes: '10',
          true_bookmarks: '0',
          true_replies: '2',
          true_reposts: '0',
          like_count: '8', // drifted
          bookmark_count: '0',
          reply_count: '2',
          repost_count: '0',
        },
      ])
      .mockResolvedValueOnce(undefined); // UPDATE

    await processor.process(job);

    expect(redisPipeline.hset).toHaveBeenCalledWith('counters:p1', {
      likes: 10,
      bookmarks: 0,
      replies: 2,
      reposts: 0,
    });
  });

  it('handles multiple drifted posts in one batch', async () => {
    const { processor, dataSource, job } = buildProcessor();

    // SELECT batch returns 2 drifted posts (batch < BATCH_SIZE → done=true)
    // Then 2 UPDATE calls follow (one per drifted post)
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 'p1',
          true_likes: '3',
          true_bookmarks: '1',
          true_replies: '0',
          true_reposts: '0',
          like_count: '2', // drift
          bookmark_count: '1',
          reply_count: '0',
          repost_count: '0',
        },
        {
          id: 'p2',
          true_likes: '0',
          true_bookmarks: '5',
          true_replies: '1',
          true_reposts: '0',
          like_count: '0',
          bookmark_count: '4', // drift
          reply_count: '1',
          repost_count: '0',
        },
      ])
      .mockResolvedValueOnce(undefined) // UPDATE p1
      .mockResolvedValueOnce(undefined); // UPDATE p2

    const result = await processor.process(job);
    expect(result.corrected).toBe(2);
  });

  it('terminates when first batch returns empty results', async () => {
    const { processor, dataSource, job } = buildProcessor();

    dataSource.query.mockResolvedValueOnce([]); // no posts at all

    const result = await processor.process(job);

    expect(result).toEqual({ corrected: 0 });
    expect(dataSource.query).toHaveBeenCalledTimes(1); // single SELECT, stops immediately
  });
});
