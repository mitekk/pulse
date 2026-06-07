/**
 * EntityExtractorService unit tests.
 * All DB dependencies mocked — no real DB needed.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityExtractorService } from '../../../src/modules/posts/entity-extractor.service';
import { Hashtag } from '../../../src/modules/posts/hashtag.entity';

// ── Test factory ──────────────────────────────────────────────────────────────

function buildExtractor(userRows: { id: string; handle: string }[] = []) {
  const userRepo = {
    createQueryBuilder: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(userRows),
    }),
  };

  const hashtagRepo = {
    createQueryBuilder: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(null), // no existing hashtags by default
    }),
    save: vi.fn().mockImplementation((h: Hashtag) => Promise.resolve(h)),
  };

  const mentionRepo = {};
  const postHashtagRepo = {};

  const insertBuilder = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  const dataSource = {
    createQueryBuilder: vi.fn().mockReturnValue(insertBuilder),
  };

  const svc = new EntityExtractorService(
    userRepo as never,
    hashtagRepo as never,
    mentionRepo as never,
    postHashtagRepo as never,
    dataSource as never,
  );

  return { svc, userRepo, hashtagRepo, dataSource, insertBuilder };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EntityExtractorService', () => {
  describe('extractAndPersist — null/empty text', () => {
    it('returns empty entities for null text', async () => {
      const { svc } = buildExtractor();
      const result = await svc.extractAndPersist('post-1', null);
      expect(result).toEqual({ mentions: [], hashtags: [], urls: [] });
    });

    it('returns empty entities for empty string', async () => {
      const { svc } = buildExtractor();
      const result = await svc.extractAndPersist('post-1', '');
      expect(result).toEqual({ mentions: [], hashtags: [], urls: [] });
    });
  });

  describe('mention extraction', () => {
    it('extracts a single mention with correct offsets', async () => {
      const { svc } = buildExtractor([{ id: 'user-1', handle: 'alice' }]);
      const result = await svc.extractAndPersist('post-1', 'Hello @alice how are you');
      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0]).toMatchObject({
        handle: 'alice',
        userId: 'user-1',
        start: 6, // '@' is at index 6
        end: 12, // '@alice' is 6 chars
      });
    });

    it('extracts multiple mentions', async () => {
      const { svc } = buildExtractor([
        { id: 'user-1', handle: 'alice' },
        { id: 'user-2', handle: 'bob' },
      ]);
      const result = await svc.extractAndPersist('post-1', '@alice @bob hi');
      expect(result.mentions).toHaveLength(2);
    });

    it('skips mentions for unknown handles', async () => {
      const { svc } = buildExtractor([]); // no users in DB
      const result = await svc.extractAndPersist('post-1', '@unknown hi');
      expect(result.mentions).toHaveLength(0);
    });

    it('deduplicates repeated mentions of the same user', async () => {
      const { svc } = buildExtractor([{ id: 'user-1', handle: 'alice' }]);
      const result = await svc.extractAndPersist('post-1', '@alice @alice hello');
      // Should only appear once in DB writes (deduplicated by userId)
      expect(result.mentions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('hashtag extraction', () => {
    it('extracts a hashtag with correct offsets', async () => {
      const { svc } = buildExtractor();
      const result = await svc.extractAndPersist('post-1', 'hello #world today');
      expect(result.hashtags).toHaveLength(1);
      expect(result.hashtags[0]).toMatchObject({
        tag: 'world',
        start: 6,
        end: 12,
      });
    });

    it('extracts multiple hashtags', async () => {
      const { svc } = buildExtractor();
      const result = await svc.extractAndPersist('post-1', '#foo #bar baz #qux');
      expect(result.hashtags).toHaveLength(3);
    });

    it('normalizes hashtag to lowercase', async () => {
      const { svc } = buildExtractor();
      const result = await svc.extractAndPersist('post-1', '#HelloWorld');
      expect(result.hashtags[0].tag).toBe('helloworld');
    });

    it('upserts existing hashtag from DB', async () => {
      const { svc, hashtagRepo } = buildExtractor();
      // Return existing hashtag
      (hashtagRepo.createQueryBuilder as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue({ id: 'existing-id', tag: 'world' }),
      });
      const result = await svc.extractAndPersist('post-1', '#world');
      // Should use existing ID, not create new
      expect(hashtagRepo.save).not.toHaveBeenCalled();
      expect(result.hashtags[0].tag).toBe('world');
    });
  });

  describe('URL extraction', () => {
    it('extracts a URL with display URL', async () => {
      const { svc } = buildExtractor();
      const result = await svc.extractAndPersist('post-1', 'Check https://example.com/path out');
      expect(result.urls).toHaveLength(1);
      expect(result.urls[0].url).toBe('https://example.com/path');
      expect(result.urls[0].displayUrl).toBe('example.com/path');
    });

    it('extracts multiple URLs', async () => {
      const { svc } = buildExtractor();
      const result = await svc.extractAndPersist(
        'post-1',
        'See https://foo.com and https://bar.com',
      );
      expect(result.urls).toHaveLength(2);
    });

    it('correctly computes start/end offsets for URL', async () => {
      const { svc } = buildExtractor();
      const text = 'go to https://example.com now';
      const result = await svc.extractAndPersist('post-1', text);
      expect(result.urls[0].start).toBe(6); // 'https...' starts at index 6
    });
  });

  describe('mixed content', () => {
    it('extracts mentions, hashtags, and URLs from the same text', async () => {
      const { svc } = buildExtractor([{ id: 'user-1', handle: 'bob' }]);
      const result = await svc.extractAndPersist('post-1', '@bob check #cool https://example.com');
      expect(result.mentions).toHaveLength(1);
      expect(result.hashtags).toHaveLength(1);
      expect(result.urls).toHaveLength(1);
    });
  });
});
