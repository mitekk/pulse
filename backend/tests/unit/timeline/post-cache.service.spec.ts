/**
 * PostCacheService unit tests.
 *
 * Covers:
 *   - set/get round-trip with TTL
 *   - get returns null on cache miss
 *   - get returns null on Redis error (graceful)
 *   - mget: hits + misses in single call
 *   - mset: pipeline SET for multiple posts
 *   - del / delMany: invalidation
 */
import { describe, it, expect } from 'vitest';
import { PostCacheService } from '../../../src/modules/timeline/post-cache.service';
import type { PostDto } from '../../../src/modules/posts/dto/post.dto';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makePostDto(id = '1000'): PostDto {
  return {
    id,
    author: {
      id: 'u1',
      handle: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: false,
      isPrivate: false,
    },
    text: 'hello',
    createdAt: '2026-01-01T00:00:00Z',
    entities: { mentions: [], hashtags: [], urls: [] },
    media: [],
    counts: { replies: 0, reposts: 0, likes: 0, bookmarks: 0 },
    viewer: { liked: false, reposted: false, bookmarked: false },
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(
  overrides: Partial<{
    get: (key: string) => Promise<string | null>;
    mget: (...keys: string[]) => Promise<(string | null)[]>;
    set: () => Promise<void>;
    del: () => Promise<number>;
    pipeline: () => unknown;
  }> = {},
) {
  const store = new Map<string, string>();

  const redisClient = {
    get: overrides.get ?? ((key: string) => Promise.resolve(store.get(key) ?? null)),
    set:
      overrides.set ??
      ((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
    del:
      overrides.del ??
      ((...keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve(keys.length);
      }),
    mget:
      overrides.mget ??
      ((...keys: string[]) => Promise.resolve(keys.map((k) => store.get(k) ?? null))),
    pipeline:
      overrides.pipeline ??
      (() => {
        const ops: Array<() => Promise<void>> = [];
        const pipe = {
          set: (key: string, value: string) => {
            ops.push(() => {
              store.set(key, value);
              return Promise.resolve();
            });
            return pipe;
          },
          exec: async () => {
            await Promise.all(ops.map((op) => op()));
            return [];
          },
        };
        return pipe;
      }),
  };

  const redisService = { client: redisClient };
  return new PostCacheService(redisService as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PostCacheService', () => {
  describe('set + get round-trip', () => {
    it('stores and retrieves a PostDto', async () => {
      const svc = buildService();
      const dto = makePostDto('123');
      await svc.set(dto);
      const result = await svc.get('123');
      expect(result).toEqual(dto);
    });

    it('returns null for a cache miss', async () => {
      const svc = buildService();
      const result = await svc.get('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when Redis throws', async () => {
      const svc = buildService({
        get: () => Promise.reject(new Error('Redis down')),
      });
      const result = await svc.get('123');
      expect(result).toBeNull();
    });
  });

  describe('mget', () => {
    it('returns map with cached entries and no misses', async () => {
      const svc = buildService();
      const d1 = makePostDto('1');
      const d2 = makePostDto('2');
      await svc.set(d1);
      await svc.set(d2);

      const result = await svc.mget(['1', '2', '3']);
      expect(result.get('1')).toEqual(d1);
      expect(result.get('2')).toEqual(d2);
      expect(result.has('3')).toBe(false);
    });

    it('returns empty map for empty input', async () => {
      const svc = buildService();
      const result = await svc.mget([]);
      expect(result.size).toBe(0);
    });
  });

  describe('mset', () => {
    it('writes multiple posts to cache', async () => {
      const svc = buildService();
      const posts = [makePostDto('10'), makePostDto('11')];
      await svc.mset(posts);

      const r1 = await svc.get('10');
      const r2 = await svc.get('11');
      expect(r1).toEqual(posts[0]);
      expect(r2).toEqual(posts[1]);
    });
  });

  describe('del / delMany', () => {
    it('removes a single entry', async () => {
      const svc = buildService();
      await svc.set(makePostDto('99'));
      await svc.del('99');
      expect(await svc.get('99')).toBeNull();
    });

    it('removes multiple entries', async () => {
      const svc = buildService();
      await svc.set(makePostDto('1'));
      await svc.set(makePostDto('2'));
      await svc.delMany(['1', '2']);
      expect(await svc.get('1')).toBeNull();
      expect(await svc.get('2')).toBeNull();
    });

    it('delMany is no-op on empty array', async () => {
      const svc = buildService();
      await expect(svc.delMany([])).resolves.toBeUndefined();
    });
  });

  describe('postKey', () => {
    it('returns expected key format', () => {
      const svc = buildService();
      expect(svc.postKey('123')).toBe('post:123');
    });
  });
});
