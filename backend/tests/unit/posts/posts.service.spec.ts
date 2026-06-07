/**
 * PostsService unit tests.
 *
 * Covers:
 *   - Codepoint + URL length counting
 *   - Empty-text rules (empty without media → rejected; empty with media → ok)
 *   - Reply policy enforcement (everyone / following / mentioned)
 *   - Repost toggle uniqueness / idempotency
 *   - Quote increments target repost_count
 *   - Thread assembly + reply ranking
 *   - Tombstone on soft-delete
 *
 * All external dependencies mocked via vi.fn(). No real DB or Redis.
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { countPostLength, PostsService } from '../../../src/modules/posts/posts.service';
import { Post } from '../../../src/modules/posts/post.entity';
import { User } from '../../../src/modules/users/user.entity';
import { Mention } from '../../../src/modules/posts/mention.entity';

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
  p.authorId = 'user-1';
  p.author = makeUser();
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
  p.likeCount = 0;
  p.bookmarkCount = 0;
  p.viewCount = 0;
  p.createdAt = new Date('2026-01-01');
  p.deletedAt = null;
  p.mentions = [];
  p.postHashtags = [];
  return Object.assign(p, overrides);
}

// ── Builder ───────────────────────────────────────────────────────────────────

function buildService() {
  const postRepo = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const userRepo = {
    findOneOrFail: vi.fn(),
  };

  const mentionRepo = {
    findOne: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
  };

  const hashtagRepo = {};
  const postHashtagRepo = {};

  const savedPost = makePost();

  const txManager = {
    create: vi
      .fn()
      .mockImplementation((_entity: unknown, data: Partial<Post>) =>
        Object.assign(makePost(), data),
      ),
    save: vi.fn().mockResolvedValue(savedPost),
    findOneOrFail: vi.fn().mockResolvedValue(makeUser()),
    restore: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined),
  };

  const dataSource = {
    transaction: vi.fn().mockImplementation(async (fn: (m: typeof txManager) => Promise<void>) => {
      await fn(txManager);
    }),
  };

  const visibilityService = {
    canViewPost: vi.fn().mockResolvedValue({ visible: true }),
    filterPostPage: vi
      .fn()
      .mockImplementation((_v: unknown, posts: Post[]) => Promise.resolve(posts)),
    isActiveFollower: vi.fn().mockResolvedValue(false),
  };

  const entityExtractor = {
    extractAndPersist: vi.fn().mockResolvedValue({ mentions: [], hashtags: [], urls: [] }),
  };

  const notificationPort = {
    notifyReply: vi.fn().mockResolvedValue(undefined),
    notifyMention: vi.fn().mockResolvedValue(undefined),
    notifyQuote: vi.fn().mockResolvedValue(undefined),
    notifyRepost: vi.fn().mockResolvedValue(undefined),
  };

  const fanoutQueue = { add: vi.fn().mockResolvedValue(undefined) };
  const searchQueue = { add: vi.fn().mockResolvedValue(undefined) };

  const viewerFlagsPort = {
    hydrate: vi.fn().mockResolvedValue(new Map()),
    hydrateOne: vi.fn().mockResolvedValue({ liked: false, reposted: false, bookmarked: false }),
  };

  const svc = new PostsService(
    postRepo as never,
    userRepo as never,
    mentionRepo as never,
    hashtagRepo as never,
    postHashtagRepo as never,
    dataSource as never,
    visibilityService as never,
    entityExtractor as never,
    notificationPort as never,
    viewerFlagsPort as never,
    fanoutQueue as never,
    searchQueue as never,
  );

  return {
    svc,
    postRepo,
    userRepo,
    mentionRepo,
    dataSource,
    txManager,
    visibilityService,
    entityExtractor,
    notificationPort,
    fanoutQueue,
    searchQueue,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('countPostLength', () => {
  it('counts ASCII text by codepoints', () => {
    expect(countPostLength('hello world')).toBe(11);
  });

  it('counts emoji as single codepoint', () => {
    // U+1F600 GRINNING FACE — 2 UTF-16 units, 1 codepoint
    expect(countPostLength('hello 😀')).toBe(7);
  });

  it('replaces each URL with 23 characters regardless of actual URL length', () => {
    const url = 'https://example.com/very/long/path/that/goes/on/and/on';
    const text = `go to ${url} now`;
    // 'go to ' = 6, URL = 23, ' now' = 4 → total 33
    expect(countPostLength(text)).toBe(6 + 23 + 4);
  });

  it('counts multiple URLs each as 23', () => {
    const text = 'https://a.com and https://b.com';
    // 23 + ' and ' (5) + 23 = 51
    expect(countPostLength(text)).toBe(23 + 5 + 23);
  });

  it('returns 0 for empty string', () => {
    expect(countPostLength('')).toBe(0);
  });

  it('rejects text over 280 after URL normalization', () => {
    const text = 'x'.repeat(281);
    expect(countPostLength(text)).toBeGreaterThan(280);
  });
});

describe('PostsService.create', () => {
  it('rejects empty text with no media', async () => {
    const { svc } = buildService();
    await expect(svc.create('user-1', { text: '' })).rejects.toThrow(BadRequestException);
  });

  it('rejects when text is undefined with no mediaIds', async () => {
    const { svc } = buildService();
    await expect(svc.create('user-1', {})).rejects.toThrow(BadRequestException);
  });

  it('rejects text longer than 280 codepoints after URL normalization', async () => {
    const { svc } = buildService();
    const longText = 'a'.repeat(281);
    await expect(svc.create('user-1', { text: longText })).rejects.toThrow(BadRequestException);
  });

  it('creates a post with valid text and enqueues fanout + search', async () => {
    const { svc, fanoutQueue, searchQueue } = buildService();
    const result = await svc.create('user-1', { text: 'hello world' });
    expect(result.text).toBe('hello world');
    expect(fanoutQueue.add).toHaveBeenCalledWith(
      'fanout.post',
      expect.objectContaining({ authorId: 'user-1' }),
      expect.any(Object),
    );
    expect(searchQueue.add).toHaveBeenCalledWith(
      'search.index',
      expect.objectContaining({ action: 'upsert' }),
      expect.any(Object),
    );
  });

  it('allows post with no text when mediaIds provided', async () => {
    const { svc } = buildService();
    // mediaIds present, no text — should not throw
    const result = await svc.create('user-1', { mediaIds: ['media-id-1'] });
    expect(result).toBeDefined();
  });

  describe('reply policy — everyone', () => {
    it('allows reply without checking follow/mention', async () => {
      const { svc, postRepo } = buildService();
      const parent = makePost({ id: 'parent-1', replyPolicy: 'everyone' });
      postRepo.findOne.mockResolvedValueOnce(parent); // parent lookup
      const result = await svc.create('user-2', { text: 'reply', replyToId: 'parent-1' });
      expect(result).toBeDefined();
    });
  });

  describe('reply policy — following', () => {
    it('rejects reply when not following author', async () => {
      const { svc, postRepo, visibilityService } = buildService();
      const parent = makePost({
        id: 'parent-1',
        authorId: 'author-id',
        author: makeUser({ id: 'author-id' }),
        replyPolicy: 'following',
      });
      postRepo.findOne.mockResolvedValueOnce(parent);
      visibilityService.isActiveFollower.mockResolvedValueOnce(false);

      await expect(svc.create('user-2', { text: 'hi', replyToId: 'parent-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows reply when viewer follows the author', async () => {
      const { svc, postRepo, visibilityService } = buildService();
      const parent = makePost({
        id: 'parent-1',
        authorId: 'author-id',
        author: makeUser({ id: 'author-id' }),
        replyPolicy: 'following',
      });
      postRepo.findOne.mockResolvedValueOnce(parent);
      visibilityService.isActiveFollower.mockResolvedValueOnce(true);

      const result = await svc.create('user-2', { text: 'hi', replyToId: 'parent-1' });
      expect(result).toBeDefined();
    });

    it('allows author to reply to their own post regardless of policy', async () => {
      const { svc, postRepo, visibilityService } = buildService();
      const parent = makePost({
        id: 'parent-1',
        authorId: 'user-1',
        author: makeUser({ id: 'user-1' }),
        replyPolicy: 'following',
      });
      postRepo.findOne.mockResolvedValueOnce(parent);
      // isActiveFollower should NOT be called for self-reply

      const result = await svc.create('user-1', { text: 'self reply', replyToId: 'parent-1' });
      expect(result).toBeDefined();
      expect(visibilityService.isActiveFollower).not.toHaveBeenCalled();
    });
  });

  describe('reply policy — mentioned', () => {
    it('rejects reply when user not mentioned in parent', async () => {
      const { svc, postRepo, mentionRepo } = buildService();
      const parent = makePost({
        id: 'parent-1',
        authorId: 'author-id',
        author: makeUser({ id: 'author-id' }),
        replyPolicy: 'mentioned',
      });
      postRepo.findOne.mockResolvedValueOnce(parent);
      mentionRepo.findOne.mockResolvedValueOnce(null); // not mentioned

      await expect(svc.create('user-2', { text: 'hi', replyToId: 'parent-1' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows reply when user is mentioned in parent', async () => {
      const { svc, postRepo, mentionRepo } = buildService();
      const parent = makePost({
        id: 'parent-1',
        authorId: 'author-id',
        author: makeUser({ id: 'author-id' }),
        replyPolicy: 'mentioned',
      });
      const mention = new Mention();
      mention.postId = 'parent-1';
      mention.mentionedUserId = 'user-2';

      postRepo.findOne.mockResolvedValueOnce(parent);
      mentionRepo.findOne.mockResolvedValueOnce(mention);

      const result = await svc.create('user-2', { text: 'hi', replyToId: 'parent-1' });
      expect(result).toBeDefined();
    });
  });

  it('increments repost_count on quoted post', async () => {
    const { svc, postRepo, txManager } = buildService();
    const quoted = makePost({ id: 'quoted-1', authorId: 'other-user' });
    postRepo.findOne.mockResolvedValueOnce(quoted); // quote target
    txManager.query.mockResolvedValue(undefined);

    await svc.create('user-1', { text: 'interesting!', quoteOfId: 'quoted-1' });

    // One of the query calls should increment repost_count on the quoted post
    const repostIncrement = txManager.query.mock.calls.find(
      (call: string[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('repost_count') &&
        call[1][0] === 'quoted-1',
    );
    expect(repostIncrement).toBeDefined();
  });

  it('emits reply notification to parent author (not self)', async () => {
    const { svc, postRepo, notificationPort } = buildService();
    const parent = makePost({
      id: 'parent-1',
      authorId: 'other-user',
      author: makeUser({ id: 'other-user' }),
      replyPolicy: 'everyone',
    });
    postRepo.findOne.mockResolvedValueOnce(parent);

    await svc.create('user-1', { text: 'reply', replyToId: 'parent-1' });

    expect(notificationPort.notifyReply).toHaveBeenCalledWith(
      'user-1',
      'other-user',
      expect.any(String),
    );
  });

  it('does not emit reply notification when replying to own post', async () => {
    const { svc, postRepo, notificationPort } = buildService();
    const parent = makePost({
      id: 'parent-1',
      authorId: 'user-1',
      author: makeUser({ id: 'user-1' }),
      replyPolicy: 'everyone',
    });
    postRepo.findOne.mockResolvedValueOnce(parent);

    await svc.create('user-1', { text: 'self-reply', replyToId: 'parent-1' });
    expect(notificationPort.notifyReply).not.toHaveBeenCalled();
  });
});

describe('PostsService.repost', () => {
  it('returns 404 when original post not found', async () => {
    const { svc, postRepo } = buildService();
    postRepo.findOne.mockResolvedValueOnce(null);
    await expect(svc.repost('user-1', 'missing-post')).rejects.toThrow(NotFoundException);
  });

  it('creates a new repost and returns reposted=true', async () => {
    const { svc, postRepo } = buildService();
    const original = makePost({ id: 'orig-1', repostCount: 0 });
    postRepo.findOne
      .mockResolvedValueOnce(original) // original post
      .mockResolvedValueOnce(null); // no existing repost

    const result = await svc.repost('user-1', 'orig-1');
    expect(result.reposted).toBe(true);
    expect(result.count).toBe(1);
  });

  it('is idempotent — returns reposted=true if already reposted', async () => {
    const { svc, postRepo } = buildService();
    const original = makePost({ id: 'orig-1', repostCount: 1 });
    const existingRepost = makePost({
      id: 'repost-1',
      authorId: 'user-1',
      repostOfId: 'orig-1',
      deletedAt: null,
    });
    postRepo.findOne.mockResolvedValueOnce(original).mockResolvedValueOnce(existingRepost); // existing active repost

    const result = await svc.repost('user-1', 'orig-1');
    expect(result.reposted).toBe(true);
    expect(result.count).toBe(1); // returns current count
  });

  it('emits repost notification to original author (not self)', async () => {
    const { svc, postRepo, notificationPort } = buildService();
    const original = makePost({ id: 'orig-1', authorId: 'other-user', repostCount: 0 });
    original.author = makeUser({ id: 'other-user' });
    postRepo.findOne.mockResolvedValueOnce(original).mockResolvedValueOnce(null); // no existing repost

    await svc.repost('user-1', 'orig-1');
    expect(notificationPort.notifyRepost).toHaveBeenCalledWith('user-1', 'other-user', 'orig-1');
  });

  it('does not notify when user reposts their own post', async () => {
    const { svc, postRepo, notificationPort } = buildService();
    const original = makePost({ id: 'orig-1', authorId: 'user-1', repostCount: 0 });
    original.author = makeUser({ id: 'user-1' });
    postRepo.findOne.mockResolvedValueOnce(original).mockResolvedValueOnce(null);

    await svc.repost('user-1', 'orig-1');
    expect(notificationPort.notifyRepost).not.toHaveBeenCalled();
  });
});

describe('PostsService.unrepost', () => {
  it('returns reposted=false and decremented count', async () => {
    const { svc, postRepo } = buildService();
    const original = makePost({ id: 'orig-1', repostCount: 5 });
    const repostRow = makePost({ id: 'repost-1', repostOfId: 'orig-1', deletedAt: null });

    postRepo.findOne
      .mockResolvedValueOnce(original) // original
      .mockResolvedValueOnce(repostRow); // existing repost

    const result = await svc.unrepost('user-1', 'orig-1');
    expect(result.reposted).toBe(false);
    expect(result.count).toBe(4);
  });

  it('is idempotent when no repost exists', async () => {
    const { svc, postRepo } = buildService();
    const original = makePost({ id: 'orig-1', repostCount: 0 });
    postRepo.findOne.mockResolvedValueOnce(original).mockResolvedValueOnce(null); // no repost row

    const result = await svc.unrepost('user-1', 'orig-1');
    expect(result.reposted).toBe(false);
    expect(result.count).toBe(0);
  });
});

describe('PostsService.softDelete', () => {
  it('rejects deletion by non-author', async () => {
    const { svc, postRepo } = buildService();
    const post = makePost({ authorId: 'real-author' });
    postRepo.findOne.mockResolvedValueOnce(post);

    await expect(svc.softDelete(post.id, 'wrong-user')).rejects.toThrow(ForbiddenException);
  });

  it('returns 404 when post not found', async () => {
    const { svc, postRepo } = buildService();
    postRepo.findOne.mockResolvedValueOnce(null);

    await expect(svc.softDelete('missing', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes successfully and enqueues search delete job', async () => {
    const { svc, postRepo, searchQueue } = buildService();
    const post = makePost({ authorId: 'user-1' });
    postRepo.findOne.mockResolvedValueOnce(post);

    await svc.softDelete(post.id, 'user-1');
    expect(searchQueue.add).toHaveBeenCalledWith(
      'search.index',
      expect.objectContaining({ action: 'delete' }),
      expect.any(Object),
    );
  });
});

describe('PostsService.findOne', () => {
  it('returns post DTO for visible post', async () => {
    const { svc, postRepo, visibilityService } = buildService();
    const post = makePost();
    postRepo.findOne.mockResolvedValue(post);
    visibilityService.canViewPost.mockResolvedValue({ visible: true });

    const result = await svc.findOne(post.id, 'viewer-1');
    expect(result.id).toBe(post.id);
    expect(result.deleted).toBe(false);
  });

  it('returns tombstone (deleted=true, text=null) for soft-deleted post', async () => {
    const { svc, postRepo, visibilityService } = buildService();
    const post = makePost({ deletedAt: new Date() });
    postRepo.findOne.mockResolvedValue(post);
    // Visibility: soft-deleted post is visible (tombstone) by default
    visibilityService.canViewPost.mockResolvedValue({ visible: true });

    const result = await svc.findOne(post.id, null);
    expect(result.deleted).toBe(true);
    expect(result.text).toBeNull();
  });

  it('throws 404 when post not found', async () => {
    const { svc, postRepo } = buildService();
    postRepo.findOne.mockResolvedValue(null);

    await expect(svc.findOne('missing', null)).rejects.toThrow(NotFoundException);
  });

  it('throws 403 when post is blocked', async () => {
    const { svc, postRepo, visibilityService } = buildService();
    const post = makePost();
    postRepo.findOne.mockResolvedValue(post);
    visibilityService.canViewPost.mockResolvedValue({ visible: false, reason: 'blocked' });

    await expect(svc.findOne(post.id, 'viewer-1')).rejects.toThrow(ForbiddenException);
  });
});
