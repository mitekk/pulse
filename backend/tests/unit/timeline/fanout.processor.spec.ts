/**
 * FanoutProcessor unit tests.
 *
 * Covers:
 *   - Normal fan-out: ZADD + ZREMRANGEBYRANK for each active follower
 *   - Celebrity skip: author.followersCount > threshold → no Redis writes
 *   - Author not found → safe return
 *   - Idempotency: ZADD NX mode
 *   - Large follower list batched in groups of 500
 *   - Realtime publisher called after successful fan-out
 */
import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import { FanoutProcessor } from '../../../src/modules/timeline/fanout.processor';
import { User } from '../../../src/modules/users/user.entity';
import { Follow } from '../../../src/modules/users/follow.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'author-1';
  u.followersCount = 100;
  return Object.assign(u, overrides);
}

function makeFollow(followerId: string): Follow {
  const f = new Follow();
  f.followerId = followerId;
  f.followeeId = 'author-1';
  f.state = 'active';
  return f;
}

function makeJob(data: { postId: string; authorId: string; repostOf?: string }): Job {
  return { data } as unknown as Job;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

function buildProcessor(overrides: {
  followersCount?: number;
  authorExists?: boolean;
  followers?: Array<{ followerId: string }>;
  threshold?: number;
}) {
  const {
    followersCount = 100,
    authorExists = true,
    followers = [{ followerId: 'follower-1' }, { followerId: 'follower-2' }],
    threshold = 10000,
  } = overrides;

  const pipeline = {
    zadd: vi.fn().mockReturnThis(),
    zremrangebyrank: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redisClient = {
    pipeline: vi.fn().mockReturnValue(pipeline),
    publish: vi.fn().mockResolvedValue(1),
  };

  const redisService = {
    client: redisClient,
  };

  const userRepo = {
    findOne: vi.fn().mockResolvedValue(authorExists ? makeUser({ followersCount }) : null),
  };

  const followRepo = {
    find: vi.fn().mockImplementation(({ skip, take }: { skip: number; take: number }) => {
      const page = followers.slice(skip, skip + take);
      return Promise.resolve(page.map((f) => makeFollow(f.followerId)));
    }),
  };

  const configService = {
    get: vi.fn().mockReturnValue(threshold),
  };

  const realtimePublisher = {
    notifyNewTimelinePosts: vi.fn().mockResolvedValue(undefined),
  };

  const processor = new FanoutProcessor(
    redisService as never,
    followRepo as never,
    userRepo as never,
    configService as never,
    realtimePublisher as never,
  );

  return { processor, pipeline, redisClient, userRepo, followRepo, realtimePublisher };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FanoutProcessor', () => {
  describe('process — normal fan-out', () => {
    it('calls ZADD for each active follower', async () => {
      const { processor, pipeline } = buildProcessor({});
      await processor.process(makeJob({ postId: '1234567890', authorId: 'author-1' }));

      expect(pipeline.zadd).toHaveBeenCalledTimes(2);
      expect(pipeline.zadd).toHaveBeenCalledWith(
        'home:follower-1',
        'NX',
        expect.any(Number),
        '1234567890',
      );
      expect(pipeline.zadd).toHaveBeenCalledWith(
        'home:follower-2',
        'NX',
        expect.any(Number),
        '1234567890',
      );
    });

    it('calls ZREMRANGEBYRANK after each ZADD to enforce cap', async () => {
      const { processor, pipeline } = buildProcessor({});
      await processor.process(makeJob({ postId: '1234567890', authorId: 'author-1' }));

      expect(pipeline.zremrangebyrank).toHaveBeenCalledTimes(2);
      expect(pipeline.zremrangebyrank).toHaveBeenCalledWith('home:follower-1', 0, -801);
    });

    it('executes pipeline once per batch', async () => {
      const { processor, pipeline } = buildProcessor({});
      await processor.process(makeJob({ postId: '1234567890', authorId: 'author-1' }));

      expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('publishes to realtime publisher after successful fan-out', async () => {
      const { processor, realtimePublisher } = buildProcessor({});
      await processor.process(makeJob({ postId: '1234567890', authorId: 'author-1' }));

      expect(realtimePublisher.notifyNewTimelinePosts).toHaveBeenCalledOnce();
    });
  });

  describe('process — celebrity skip', () => {
    it('skips fan-out when author has more followers than threshold', async () => {
      const { processor, pipeline } = buildProcessor({
        followersCount: 15_000,
        threshold: 10_000,
      });

      await processor.process(makeJob({ postId: '9999', authorId: 'celeb-1' }));

      expect(pipeline.zadd).not.toHaveBeenCalled();
    });

    it('does NOT skip when author is exactly at threshold', async () => {
      const { processor, pipeline } = buildProcessor({
        followersCount: 10_000, // exactly at threshold (not > threshold)
        threshold: 10_000,
        followers: [{ followerId: 'follower-1' }],
      });

      await processor.process(makeJob({ postId: '9999', authorId: 'author-1' }));

      expect(pipeline.zadd).toHaveBeenCalled();
    });
  });

  describe('process — author not found', () => {
    it('returns early without Redis writes when author is missing', async () => {
      const { processor, pipeline } = buildProcessor({ authorExists: false });
      await processor.process(makeJob({ postId: '111', authorId: 'ghost-author' }));

      expect(pipeline.zadd).not.toHaveBeenCalled();
    });
  });

  describe('process — batch pagination', () => {
    it('fetches followers in multiple batches when count exceeds batch size', async () => {
      // Create 501 followers to trigger two batches
      const manyFollowers = Array.from({ length: 501 }, (_, i) => ({ followerId: `f-${i}` }));
      const { processor, followRepo, pipeline } = buildProcessor({ followers: manyFollowers });

      await processor.process(makeJob({ postId: '555', authorId: 'author-1' }));

      // Should have called find twice (batch 1: 500, batch 2: 1)
      expect(followRepo.find).toHaveBeenCalledTimes(2);
      // Pipeline exec called once per batch
      expect(pipeline.exec).toHaveBeenCalledTimes(2);
    });
  });

  describe('process — ZADD NX idempotency', () => {
    it('uses NX flag so duplicate jobs do not double-add', async () => {
      const { processor, pipeline } = buildProcessor({
        followers: [{ followerId: 'follower-1' }],
      });

      await processor.process(makeJob({ postId: '1234567890', authorId: 'author-1' }));

      // Verify NX flag is passed
      const call = pipeline.zadd.mock.calls[0];
      expect(call).toContain('NX');
    });
  });
});
