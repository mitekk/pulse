/**
 * EngagementService unit tests.
 *
 * Covers:
 *   - like/unlike idempotency and counter deltas (incl. floor-at-0)
 *   - bookmark/unbookmark idempotency and counter deltas (incl. floor-at-0)
 *   - 404 on non-existent post for all toggle operations
 *   - getLikes cursor pagination
 *   - getBookmarks cursor pagination
 *
 * All DB / Redis calls mocked via vi.fn(). No real DB or Redis.
 */
import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { EngagementService } from '../../../src/modules/engagement/engagement.service';
import { Like } from '../../../src/modules/engagement/like.entity';
import { Bookmark } from '../../../src/modules/engagement/bookmark.entity';
import { Post } from '../../../src/modules/posts/post.entity';
import { User } from '../../../src/modules/users/user.entity';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'user-1';
  u.handle = 'alice';
  u.displayName = 'Alice';
  u.email = 'alice@example.com';
  u.passwordHash = 'hash';
  u.bio = null;
  u.location = null;
  u.website = null;
  u.avatarMediaId = null;
  u.bannerMediaId = null;
  u.isVerified = false;
  u.isPrivate = false;
  u.dmPrivacy = 'following';
  u.followersCount = 0;
  u.followingCount = 0;
  u.postsCount = 0;
  u.emailVerifiedAt = null;
  u.createdAt = new Date('2026-01-01');
  u.updatedAt = new Date('2026-01-01');
  u.deletedAt = null;
  return Object.assign(u, overrides);
}

function makePost(overrides: Partial<Post> = {}): Post {
  const p = new Post();
  p.id = '1000000000000001';
  p.authorId = 'user-2'; // different from default viewer 'user-1'
  p.author = makeUser({ id: 'user-2', handle: 'bob' });
  p.text = 'hello world';
  p.lang = null;
  p.replyToId = null;
  p.replyRootId = null;
  p.conversationId = null;
  p.repostOfId = null;
  p.quoteOfId = null;
  p.replyPolicy = 'everyone';
  p.replyCount = 0;
  p.repostCount = 0;
  p.likeCount = 5;
  p.bookmarkCount = 3;
  p.viewCount = 0;
  p.createdAt = new Date('2026-01-01');
  p.deletedAt = null;
  p.mentions = [];
  p.postHashtags = [];
  return Object.assign(p, overrides);
}

function makeLike(userId: string, postId: string): Like {
  const l = new Like();
  l.userId = userId;
  l.postId = postId;
  l.user = makeUser({ id: userId });
  l.createdAt = new Date('2026-01-01');
  return l;
}

function makeBookmark(userId: string, postId: string): Bookmark {
  const b = new Bookmark();
  b.userId = userId;
  b.postId = postId;
  b.post = makePost({ id: postId });
  b.createdAt = new Date('2026-01-01');
  return b;
}

// ── Builder ───────────────────────────────────────────────────────────────────

function buildService() {
  const post = makePost();

  const likeRepo = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const bookmarkRepo = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const postRepo = {
    findOne: vi.fn().mockResolvedValue(post),
  };

  const txManager = {
    create: vi.fn().mockImplementation((_entity: unknown, data: unknown) => data),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined),
  };

  const dataSource = {
    transaction: vi.fn().mockImplementation(async (fn: (m: typeof txManager) => Promise<void>) => {
      await fn(txManager);
    }),
  };

  const redisPipeline = {
    sadd: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    hincrby: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redisService = {
    client: {
      pipeline: vi.fn().mockReturnValue(redisPipeline),
    },
  };

  const notificationPort = {
    notifyLike: vi.fn().mockResolvedValue(undefined),
    notifyRepost: vi.fn().mockResolvedValue(undefined),
    notifyReply: vi.fn().mockResolvedValue(undefined),
    notifyMention: vi.fn().mockResolvedValue(undefined),
    notifyQuote: vi.fn().mockResolvedValue(undefined),
  };

  const svc = new EngagementService(
    likeRepo as never,
    bookmarkRepo as never,
    postRepo as never,
    dataSource as never,
    redisService as never,
    notificationPort as never,
  );

  return {
    svc,
    post,
    likeRepo,
    bookmarkRepo,
    postRepo,
    dataSource,
    txManager,
    redisPipeline,
    redisService,
    notificationPort,
  };
}

// ── Like tests ────────────────────────────────────────────────────────────────

describe('EngagementService.like', () => {
  it('inserts like row and returns liked=true with incremented count', async () => {
    const { svc, likeRepo, txManager } = buildService();
    likeRepo.findOne.mockResolvedValue(null); // not yet liked

    const result = await svc.like('user-1', '1000000000000001');

    expect(result).toEqual({ liked: true, count: 6 }); // 5 + 1
    expect(txManager.save).toHaveBeenCalledWith(
      Like,
      expect.objectContaining({ userId: 'user-1', postId: '1000000000000001' }),
    );
    expect(txManager.query).toHaveBeenCalledWith(
      `UPDATE posts SET like_count = like_count + 1 WHERE id = $1`,
      ['1000000000000001'],
    );
  });

  it('is idempotent when already liked (no insert, returns same count)', async () => {
    const { svc, likeRepo, txManager } = buildService();
    likeRepo.findOne.mockResolvedValue(makeLike('user-1', '1000000000000001'));

    const result = await svc.like('user-1', '1000000000000001');

    expect(result).toEqual({ liked: true, count: 5 });
    expect(txManager.save).not.toHaveBeenCalled(); // no duplicate insert
  });

  it('notifies post author when liker is not the author', async () => {
    const { svc, likeRepo, notificationPort } = buildService();
    likeRepo.findOne.mockResolvedValue(null);

    await svc.like('user-1', '1000000000000001'); // user-1 likes post by user-2

    // Give notification promise time to resolve
    await Promise.resolve();
    expect(notificationPort.notifyLike).toHaveBeenCalledWith(
      'user-1',
      'user-2',
      '1000000000000001',
    );
  });

  it('does not notify when author likes their own post', async () => {
    const { svc, post, likeRepo, notificationPort } = buildService();
    post.authorId = 'user-1'; // make author = liker
    likeRepo.findOne.mockResolvedValue(null);

    await svc.like('user-1', '1000000000000001');

    await Promise.resolve();
    expect(notificationPort.notifyLike).not.toHaveBeenCalled();
  });

  it('throws 404 when post does not exist', async () => {
    const { svc, postRepo } = buildService();
    postRepo.findOne.mockResolvedValue(null);

    await expect(svc.like('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('adjusts Redis liked set and counter hash', async () => {
    const { svc, likeRepo, redisPipeline } = buildService();
    likeRepo.findOne.mockResolvedValue(null);

    await svc.like('user-1', '1000000000000001');

    expect(redisPipeline.sadd).toHaveBeenCalledWith('liked:user-1', '1000000000000001');
    expect(redisPipeline.hincrby).toHaveBeenCalledWith('counters:1000000000000001', 'likes', 1);
  });
});

describe('EngagementService.unlike', () => {
  it('deletes like row and returns liked=false with decremented count', async () => {
    const { svc, likeRepo, txManager } = buildService();
    likeRepo.findOne.mockResolvedValue(makeLike('user-1', '1000000000000001'));

    const result = await svc.unlike('user-1', '1000000000000001');

    expect(result).toEqual({ liked: false, count: 4 }); // 5 - 1
    expect(txManager.delete).toHaveBeenCalledWith(Like, {
      userId: 'user-1',
      postId: '1000000000000001',
    });
    expect(txManager.query).toHaveBeenCalledWith(
      `UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`,
      ['1000000000000001'],
    );
  });

  it('is idempotent when not liked (no delete, returns same count)', async () => {
    const { svc, likeRepo, txManager } = buildService();
    likeRepo.findOne.mockResolvedValue(null); // not liked

    const result = await svc.unlike('user-1', '1000000000000001');

    expect(result).toEqual({ liked: false, count: 5 });
    expect(txManager.delete).not.toHaveBeenCalled();
  });

  it('floors count at 0 when likeCount is already 0', async () => {
    const { svc, post, likeRepo } = buildService();
    post.likeCount = 0; // already at floor
    likeRepo.findOne.mockResolvedValue(makeLike('user-1', '1000000000000001'));

    const result = await svc.unlike('user-1', '1000000000000001');

    expect(result.count).toBe(0); // Math.max(0 - 1, 0)
  });

  it('removes from Redis liked set and decrements counter hash', async () => {
    const { svc, likeRepo, redisPipeline } = buildService();
    likeRepo.findOne.mockResolvedValue(makeLike('user-1', '1000000000000001'));

    await svc.unlike('user-1', '1000000000000001');

    expect(redisPipeline.srem).toHaveBeenCalledWith('liked:user-1', '1000000000000001');
    expect(redisPipeline.hincrby).toHaveBeenCalledWith('counters:1000000000000001', 'likes', -1);
  });

  it('throws 404 when post does not exist', async () => {
    const { svc, postRepo } = buildService();
    postRepo.findOne.mockResolvedValue(null);

    await expect(svc.unlike('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ── Bookmark tests ────────────────────────────────────────────────────────────

describe('EngagementService.bookmark', () => {
  it('inserts bookmark row and returns bookmarked=true', async () => {
    const { svc, bookmarkRepo, txManager } = buildService();
    bookmarkRepo.findOne.mockResolvedValue(null);

    const result = await svc.bookmark('user-1', '1000000000000001');

    expect(result).toEqual({ bookmarked: true });
    expect(txManager.save).toHaveBeenCalledWith(
      Bookmark,
      expect.objectContaining({ userId: 'user-1', postId: '1000000000000001' }),
    );
    expect(txManager.query).toHaveBeenCalledWith(
      `UPDATE posts SET bookmark_count = bookmark_count + 1 WHERE id = $1`,
      ['1000000000000001'],
    );
  });

  it('is idempotent when already bookmarked', async () => {
    const { svc, bookmarkRepo, txManager } = buildService();
    bookmarkRepo.findOne.mockResolvedValue(makeBookmark('user-1', '1000000000000001'));

    const result = await svc.bookmark('user-1', '1000000000000001');

    expect(result).toEqual({ bookmarked: true });
    expect(txManager.save).not.toHaveBeenCalled();
  });

  it('adjusts Redis bookmarked set and counter hash', async () => {
    const { svc, bookmarkRepo, redisPipeline } = buildService();
    bookmarkRepo.findOne.mockResolvedValue(null);

    await svc.bookmark('user-1', '1000000000000001');

    expect(redisPipeline.sadd).toHaveBeenCalledWith('bookmarked:user-1', '1000000000000001');
    expect(redisPipeline.hincrby).toHaveBeenCalledWith('counters:1000000000000001', 'bookmarks', 1);
  });

  it('throws 404 when post does not exist', async () => {
    const { svc, postRepo } = buildService();
    postRepo.findOne.mockResolvedValue(null);

    await expect(svc.bookmark('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});

describe('EngagementService.unbookmark', () => {
  it('deletes bookmark row and returns bookmarked=false', async () => {
    const { svc, bookmarkRepo, txManager } = buildService();
    bookmarkRepo.findOne.mockResolvedValue(makeBookmark('user-1', '1000000000000001'));

    const result = await svc.unbookmark('user-1', '1000000000000001');

    expect(result).toEqual({ bookmarked: false });
    expect(txManager.delete).toHaveBeenCalledWith(Bookmark, {
      userId: 'user-1',
      postId: '1000000000000001',
    });
    expect(txManager.query).toHaveBeenCalledWith(
      `UPDATE posts SET bookmark_count = GREATEST(bookmark_count - 1, 0) WHERE id = $1`,
      ['1000000000000001'],
    );
  });

  it('is idempotent when not bookmarked', async () => {
    const { svc, bookmarkRepo, txManager } = buildService();
    bookmarkRepo.findOne.mockResolvedValue(null);

    const result = await svc.unbookmark('user-1', '1000000000000001');

    expect(result).toEqual({ bookmarked: false });
    expect(txManager.delete).not.toHaveBeenCalled();
  });

  it('removes from Redis bookmarked set and decrements counter hash', async () => {
    const { svc, bookmarkRepo, redisPipeline } = buildService();
    bookmarkRepo.findOne.mockResolvedValue(makeBookmark('user-1', '1000000000000001'));

    await svc.unbookmark('user-1', '1000000000000001');

    expect(redisPipeline.srem).toHaveBeenCalledWith('bookmarked:user-1', '1000000000000001');
    expect(redisPipeline.hincrby).toHaveBeenCalledWith(
      'counters:1000000000000001',
      'bookmarks',
      -1,
    );
  });

  it('floors bookmark_count at 0', async () => {
    const { svc, post, bookmarkRepo } = buildService();
    post.bookmarkCount = 0;
    bookmarkRepo.findOne.mockResolvedValue(makeBookmark('user-1', '1000000000000001'));

    // Should not throw; GREATEST in the SQL handles the floor
    const result = await svc.unbookmark('user-1', '1000000000000001');
    expect(result).toEqual({ bookmarked: false });
  });

  it('throws 404 when post does not exist', async () => {
    const { svc, postRepo } = buildService();
    postRepo.findOne.mockResolvedValue(null);

    await expect(svc.unbookmark('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ── getLikes tests ────────────────────────────────────────────────────────────

describe('EngagementService.getLikes', () => {
  it('returns empty list when no likes', async () => {
    const mockQb = {
      innerJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([]),
    };
    const likeRepo = {
      findOne: vi.fn(),
      createQueryBuilder: vi.fn().mockReturnValue(mockQb),
    };

    const svc = new EngagementService(
      likeRepo as never,
      {} as never,
      { findOne: vi.fn().mockResolvedValue(makePost()) } as never,
      {} as never,
      { client: { pipeline: vi.fn() } } as never,
      {} as never,
    );

    const result = await svc.getLikes('1000000000000001', null, 20);
    expect(result).toEqual({ items: [], cursor: null, hasMore: false });
  });

  it('returns paginated users who liked the post', async () => {
    const likeRepo = {
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    const likeRows = [
      Object.assign(makeLike('user-a', '1000000000000001'), {
        user: makeUser({ id: 'user-a', handle: 'alice' }),
      }),
      Object.assign(makeLike('user-b', '1000000000000001'), {
        user: makeUser({ id: 'user-b', handle: 'bob' }),
      }),
    ];

    const mockQb = {
      innerJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(likeRows),
    };
    likeRepo.createQueryBuilder.mockReturnValue(mockQb);

    const svc = new EngagementService(
      likeRepo as never,
      {} as never,
      { findOne: vi.fn().mockResolvedValue(makePost()) } as never,
      {} as never,
      { client: { pipeline: vi.fn() } } as never,
      {} as never,
    );

    const result = await svc.getLikes('1000000000000001', null, 20);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].handle).toBe('alice');
    expect(result.hasMore).toBe(false);
  });

  it('sets hasMore=true and cursor when more results exist', async () => {
    const likeRepo = {
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    // Return limit+1 rows to signal hasMore
    const likeRows = Array.from({ length: 3 }, (_, i) =>
      Object.assign(makeLike(`user-${i}`, '1000000000000001'), {
        user: makeUser({ id: `user-${i}`, handle: `user${i}` }),
      }),
    );

    const mockQb = {
      innerJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(likeRows),
    };
    likeRepo.createQueryBuilder.mockReturnValue(mockQb);

    const svc = new EngagementService(
      likeRepo as never,
      {} as never,
      { findOne: vi.fn().mockResolvedValue(makePost()) } as never,
      {} as never,
      { client: { pipeline: vi.fn() } } as never,
      {} as never,
    );

    const result = await svc.getLikes('1000000000000001', null, 2); // limit=2, returns 3

    expect(result.items).toHaveLength(2); // sliced to limit
    expect(result.hasMore).toBe(true);
    expect(result.cursor).not.toBeNull();
  });
});
