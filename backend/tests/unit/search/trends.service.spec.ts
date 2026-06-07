import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrendsService } from '../../../src/modules/hashtags/trends.service';

// ── Redis mock ────────────────────────────────────────────────────────────────

function makePipelineMock() {
  const calls: Array<[string, ...unknown[]]> = [];
  const mock = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
    _calls: calls,
  };
  return mock;
}

function makeRedisMock(overrides: Record<string, unknown> = {}) {
  const pipeline = makePipelineMock();
  return {
    pipeline: vi.fn().mockReturnValue(pipeline),
    scan: vi.fn().mockResolvedValue(['0', []]),
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    ...overrides,
    _pipeline: pipeline,
  };
}

function makeRedisService(redisMock: ReturnType<typeof makeRedisMock>) {
  return { client: redisMock };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TrendsService', () => {
  let service: TrendsService;
  let redisMock: ReturnType<typeof makeRedisMock>;

  beforeEach(() => {
    redisMock = makeRedisMock();
    service = new TrendsService(makeRedisService(redisMock) as never);
  });

  describe('incrementTags', () => {
    it('does nothing for empty tags array', async () => {
      await service.incrementTags([]);
      expect(redisMock.pipeline).not.toHaveBeenCalled();
    });

    it('increments and sets expiry for each tag', async () => {
      const pipeline = redisMock._pipeline;
      await service.incrementTags(['typescript', 'nestjs']);
      expect(pipeline.incr).toHaveBeenCalledTimes(2);
      expect(pipeline.expire).toHaveBeenCalledTimes(2);
      expect(pipeline.exec).toHaveBeenCalledOnce();
    });

    it('builds correct bucket key format', async () => {
      const pipeline = redisMock._pipeline;
      await service.incrementTags(['hello']);
      const incrCalls = pipeline.incr.mock.calls as [string][];
      expect(incrCalls[0][0]).toMatch(/^trending:bucket:hello:\d+$/);
    });
  });

  describe('getTrends', () => {
    it('returns empty array when cache is empty', async () => {
      redisMock.get = vi.fn().mockResolvedValue(null);
      const result = await service.getTrends();
      expect(result).toEqual([]);
    });

    it('parses and returns cached trends', async () => {
      const trends = [{ tag: 'typescript', postCount: 42, postsInWindow: 42 }];
      redisMock.get = vi.fn().mockResolvedValue(JSON.stringify(trends));
      const result = await service.getTrends();
      expect(result).toEqual(trends);
    });

    it('returns empty array on invalid JSON in cache', async () => {
      redisMock.get = vi.fn().mockResolvedValue('invalid json{{{');
      const result = await service.getTrends();
      expect(result).toEqual([]);
    });
  });

  describe('recomputeTrends', () => {
    it('writes empty trends when no buckets exist', async () => {
      redisMock.scan = vi.fn().mockResolvedValue(['0', []]);
      await service.recomputeTrends();
      expect(redisMock.setex).toHaveBeenCalledOnce();
      const payload = JSON.parse(redisMock.setex.mock.calls[0][2] as string) as unknown[];
      expect(payload).toEqual([]);
    });

    it('applies decay weights correctly — recent bucket scores higher', async () => {
      const now = Math.floor(Date.now() / 60000);
      const recentBucket = now - 5; // 5 minutes ago → weight 4
      const oldBucket = now - 50; // 50 minutes ago → weight 1

      redisMock.scan = vi
        .fn()
        .mockResolvedValue([
          '0',
          [`trending:bucket:hotTag:${recentBucket}`, `trending:bucket:hotTag:${oldBucket}`],
        ]);

      // Both buckets have count = 10; recent weight 4 → 40; old weight 1 → 10; total 50
      redisMock.get = vi.fn().mockResolvedValue('10');

      await service.recomputeTrends();

      const payload = JSON.parse(redisMock.setex.mock.calls[0][2] as string) as Array<{
        tag: string;
        postCount: number;
        postsInWindow: number;
      }>;

      expect(payload).toHaveLength(1);
      expect(payload[0].tag).toBe('hotTag');
      expect(payload[0].postCount).toBe(50);
    });

    it('ignores buckets older than 120 minutes (weight = 0)', async () => {
      const now = Math.floor(Date.now() / 60000);
      const stale = now - 200; // 200 minutes ago → weight 0

      redisMock.scan = vi.fn().mockResolvedValue(['0', [`trending:bucket:oldTag:${stale}`]]);
      redisMock.get = vi.fn().mockResolvedValue('100');

      await service.recomputeTrends();

      const payload = JSON.parse(redisMock.setex.mock.calls[0][2] as string) as unknown[];
      expect(payload).toEqual([]);
    });

    it('sorts tags by score descending', async () => {
      const now = Math.floor(Date.now() / 60000);
      const bucket = now - 5;

      redisMock.scan = vi
        .fn()
        .mockResolvedValue([
          '0',
          [`trending:bucket:lowTag:${bucket}`, `trending:bucket:highTag:${bucket}`],
        ]);

      let callCount = 0;
      redisMock.get = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? '5' : '50');
      });

      await service.recomputeTrends();

      const payload = JSON.parse(redisMock.setex.mock.calls[0][2] as string) as Array<{
        tag: string;
      }>;

      // highTag (50 × 4 = 200) before lowTag (5 × 4 = 20)
      expect(payload[0].tag).toBe('highTag');
    });

    it('limits output to top 10 tags', async () => {
      const now = Math.floor(Date.now() / 60000);
      const bucket = now - 5;

      // Create 15 tags
      const keys = Array.from({ length: 15 }, (_, i) => `trending:bucket:tag${i}:${bucket}`);
      redisMock.scan = vi.fn().mockResolvedValue(['0', keys]);
      redisMock.get = vi.fn().mockResolvedValue('10');

      await service.recomputeTrends();

      const payload = JSON.parse(redisMock.setex.mock.calls[0][2] as string) as unknown[];
      expect(payload.length).toBeLessThanOrEqual(10);
    });
  });
});
