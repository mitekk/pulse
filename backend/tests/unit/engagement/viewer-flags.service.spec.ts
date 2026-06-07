/**
 * ViewerFlagsService unit tests.
 *
 * Covers:
 *   - Returns all-false for anonymous viewer (null viewerId)
 *   - Returns all-false for empty postIds list
 *   - Redis hit path: pipelined SISMEMBER returns correct flags
 *   - Redis miss path: key does not exist → DB fallback + backfill
 *   - DB fallback returns correct liked/bookmarked flags
 *   - backfillUserSets: SADDs liked rows to Redis
 *   - hydrateOne: delegates to hydrate() correctly
 */
import { describe, it, expect, vi } from 'vitest';
import { ViewerFlagsService } from '../../../src/modules/engagement/viewer-flags.service';

// ── Builder ───────────────────────────────────────────────────────────────────

function buildService() {
  let pipelineResults: [Error | null, number][] = [];

  const redisPipeline = {
    sismember: vi.fn().mockReturnThis(),
    exists: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    exec: vi.fn().mockImplementation(() => Promise.resolve(pipelineResults)),
  };

  const redisClient = {
    pipeline: vi.fn().mockReturnValue(redisPipeline),
    set: vi.fn().mockResolvedValue('OK'),
  };

  const redisService = {
    client: redisClient,
  };

  const likeRepo = {
    createQueryBuilder: vi.fn(),
  };

  const bookmarkRepo = {
    createQueryBuilder: vi.fn(),
  };

  const svc = new ViewerFlagsService(
    redisService as never,
    likeRepo as never,
    bookmarkRepo as never,
  );

  return {
    svc,
    redisPipeline,
    redisClient,
    redisService,
    likeRepo,
    bookmarkRepo,
    setPipelineResults: (results: [Error | null, number][]) => {
      pipelineResults = results;
    },
  };
}

// Helper to build a mock query builder returning specific raw rows
function mockQb(rows: { postId: string }[]) {
  return {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockResolvedValue(rows),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ViewerFlagsService.hydrate', () => {
  it('returns all-false flags for null viewerId', async () => {
    const { svc } = buildService();

    const result = await svc.hydrate(null, ['post-1', 'post-2']);

    expect(result.get('post-1')).toEqual({ liked: false, reposted: false, bookmarked: false });
    expect(result.get('post-2')).toEqual({ liked: false, reposted: false, bookmarked: false });
  });

  it('returns empty map for empty postIds', async () => {
    const { svc } = buildService();

    const result = await svc.hydrate('user-1', []);

    expect(result.size).toBe(0);
  });

  it('parses Redis SISMEMBER results correctly on cache hit', async () => {
    const { svc, setPipelineResults } = buildService();

    // postIds: ['post-1', 'post-2']
    // pipeline results: per post: [liked, bookmarked, reposted] + EXISTS=1 at end
    // post-1: liked=1, bookmarked=0, reposted=0
    // post-2: liked=0, bookmarked=1, reposted=1
    // EXISTS (liked:user-1) = 1 (cache hit)
    setPipelineResults([
      [null, 1], // post-1 liked
      [null, 0], // post-1 bookmarked
      [null, 0], // post-1 reposted
      [null, 0], // post-2 liked
      [null, 1], // post-2 bookmarked
      [null, 1], // post-2 reposted
      [null, 1], // EXISTS liked:user-1 = 1 (hit)
    ]);

    const result = await svc.hydrate('user-1', ['post-1', 'post-2']);

    expect(result.get('post-1')).toEqual({ liked: true, reposted: false, bookmarked: false });
    expect(result.get('post-2')).toEqual({ liked: false, reposted: true, bookmarked: true });
  });

  it('falls back to DB when Redis set does not exist (cache miss)', async () => {
    const { svc, setPipelineResults, likeRepo, bookmarkRepo } = buildService();

    // EXISTS returns 0 → cache miss
    setPipelineResults([
      [null, 0], // post-1 liked SISMEMBER (irrelevant — miss)
      [null, 0], // post-1 bookmarked
      [null, 0], // post-1 reposted
      [null, 0], // EXISTS liked:user-1 = 0 (miss)
    ]);

    // DB returns: user liked post-1
    likeRepo.createQueryBuilder.mockReturnValue(mockQb([{ postId: 'post-1' }]));
    bookmarkRepo.createQueryBuilder.mockReturnValue(mockQb([]));

    const result = await svc.hydrate('user-1', ['post-1']);

    expect(result.get('post-1')).toEqual({ liked: true, reposted: false, bookmarked: false });
  });

  it('correctly marks bookmarked from DB on cache miss', async () => {
    const { svc, setPipelineResults, likeRepo, bookmarkRepo } = buildService();

    // EXISTS returns 0 → cache miss; also triggers backfillUserSets
    setPipelineResults([
      [null, 0],
      [null, 0],
      [null, 0], // post-1 flags
      [null, 0], // EXISTS = 0 (miss)
    ]);

    likeRepo.createQueryBuilder.mockReturnValue(mockQb([])); // not liked
    // Two calls: one for hydrateFromDb, one for backfillUserSets
    bookmarkRepo.createQueryBuilder.mockReturnValue(mockQb([{ postId: 'post-1' }]));

    const result = await svc.hydrate('user-1', ['post-1']);

    expect(result.get('post-1')?.bookmarked).toBe(true);
  });

  it('handles Redis pipeline error gracefully by falling back to DB', async () => {
    const { svc, redisPipeline, likeRepo, bookmarkRepo } = buildService();

    redisPipeline.exec.mockRejectedValue(new Error('Redis connection lost'));
    likeRepo.createQueryBuilder.mockReturnValue(mockQb([{ postId: 'post-1' }]));
    bookmarkRepo.createQueryBuilder.mockReturnValue(mockQb([]));

    const result = await svc.hydrate('user-1', ['post-1']);

    // DB fallback should work
    expect(result.get('post-1')).toEqual({ liked: true, reposted: false, bookmarked: false });
  });
});

describe('ViewerFlagsService.backfillUserSets', () => {
  it('SADDs liked post IDs to Redis liked set', async () => {
    const { svc, likeRepo, bookmarkRepo, redisPipeline } = buildService();

    likeRepo.createQueryBuilder.mockReturnValue(mockQb([{ postId: 'p1' }, { postId: 'p2' }]));
    bookmarkRepo.createQueryBuilder.mockReturnValue(mockQb([]));

    await svc.backfillUserSets('user-1');

    expect(redisPipeline.sadd).toHaveBeenCalledWith('liked:user-1', 'p1', 'p2');
  });

  it('SADDs bookmarked post IDs to Redis bookmarked set', async () => {
    const { svc, likeRepo, bookmarkRepo, redisPipeline } = buildService();

    likeRepo.createQueryBuilder.mockReturnValue(mockQb([]));
    bookmarkRepo.createQueryBuilder.mockReturnValue(mockQb([{ postId: 'p3' }, { postId: 'p4' }]));

    await svc.backfillUserSets('user-1');

    expect(redisPipeline.sadd).toHaveBeenCalledWith('bookmarked:user-1', 'p3', 'p4');
  });

  it('sets sentinel key when user has no likes (empty set case)', async () => {
    const { svc, likeRepo, bookmarkRepo, redisPipeline } = buildService();

    likeRepo.createQueryBuilder.mockReturnValue(mockQb([]));
    bookmarkRepo.createQueryBuilder.mockReturnValue(mockQb([]));

    await svc.backfillUserSets('user-1');

    expect(redisPipeline.set).toHaveBeenCalledWith('liked:user-1:seeded', '1', 'EX', 3600);
  });

  it('handles Redis pipeline failure gracefully (no throw)', async () => {
    const { svc, likeRepo, bookmarkRepo, redisPipeline } = buildService();

    likeRepo.createQueryBuilder.mockReturnValue(mockQb([{ postId: 'p1' }]));
    bookmarkRepo.createQueryBuilder.mockReturnValue(mockQb([]));
    redisPipeline.exec.mockRejectedValue(new Error('Redis down'));

    // Should not throw
    await expect(svc.backfillUserSets('user-1')).resolves.toBeUndefined();
  });
});

describe('ViewerFlagsService.hydrateOne', () => {
  it('returns viewer flags for a single post via hydrate()', async () => {
    const { svc, setPipelineResults } = buildService();

    // Cache hit: liked=1, bookmarked=0, reposted=0, EXISTS=1
    setPipelineResults([
      [null, 1],
      [null, 0],
      [null, 0],
      [null, 1],
    ]);

    const flags = await svc.hydrateOne('user-1', 'post-1');

    expect(flags).toEqual({ liked: true, reposted: false, bookmarked: false });
  });

  it('returns all-false for anonymous viewer', async () => {
    const { svc } = buildService();
    const flags = await svc.hydrateOne(null, 'post-1');
    expect(flags).toEqual({ liked: false, reposted: false, bookmarked: false });
  });
});
