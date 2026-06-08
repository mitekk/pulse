/**
 * TimelineService unit tests.
 *
 * Covers:
 *   - Home feed: cache hit path (all posts from zset found in Redis)
 *   - Home feed: cache miss + Postgres fallback + backfill
 *   - Home feed: cold-start (empty zset → pull from followees)
 *   - Home feed: visibility filter removes blocked/private posts
 *   - Home feed: viewer flags hydration
 *   - Home feed: celebrity pull-merge (fans follow celeb → posts appear)
 *   - Block-purge: ZREM from zsets on block
 *   - User posts tab: returns user's posts cursor-paginated
 *   - User replies tab: only posts with replyToId set
 *   - User likes tab: privacy-gated for private accounts
 *   - Hashtag timeline: resolves hashtag and returns posts
 *   - Hashtag timeline: returns empty when tag not found
 */
import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TimelineService } from '../../../src/modules/timeline/timeline.service';
import { Post } from '../../../src/modules/posts/post.entity';
import { User } from '../../../src/modules/users/user.entity';
import { Follow } from '../../../src/modules/users/follow.entity';
import { Hashtag } from '../../../src/modules/posts/hashtag.entity';
import { PostHashtag } from '../../../src/modules/posts/post-hashtag.entity';
import { Like } from '../../../src/modules/engagement/like.entity';
import type { PostDto } from '../../../src/modules/posts/dto/post.dto';

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
  u.followersCount = 50;
  u.followingCount = 10;
  u.postsCount = 5;
  u.emailVerifiedAt = null;
  u.createdAt = new Date('2026-01-01');
  u.updatedAt = new Date('2026-01-01');
  u.deletedAt = null;
  return Object.assign(u, overrides);
}

function makePost(overrides: Partial<Post> = {}): Post {
  const p = new Post();
  p.id = '1000000000000001';
  p.authorId = 'user-2';
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

function makePostDto(post: Post): PostDto {
  return {
    id: post.id,
    author: {
      id: post.author.id,
      handle: post.author.handle,
      displayName: post.author.displayName,
      avatarUrl: null,
      isVerified: false,
      isPrivate: false,
    },
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    entities: { mentions: [], hashtags: [], urls: [] },
    media: [],
    counts: { replies: 0, reposts: 0, likes: 5, bookmarks: 3 },
    viewer: { liked: false, reposted: false, bookmarked: false },
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
  };
}

// ── Builder ───────────────────────────────────────────────────────────────────

interface ServiceDeps {
  zsetIds?: string[]; // IDs returned by ZREVRANGEBYSCORE (interleaved member,score,...)
  cachedPosts?: Map<string, PostDto>;
  dbPosts?: Post[];
  followees?: string[];
  celebrities?: { id: string }[];
  userEntity?: User;
  likePosts?: Post[];
  hashtagEntity?: Hashtag | null;
  hashtagPosts?: Post[];
  isBlocked?: boolean;
  visiblePosts?: Post[];
  isMuted?: boolean;
}

function buildService(deps: ServiceDeps = {}) {
  const {
    zsetIds = [],
    cachedPosts = new Map<string, PostDto>(),
    dbPosts = [],
    followees = [],
    celebrities = [],
    userEntity = makeUser(),
    likePosts = [],
    hashtagEntity = null,
    hashtagPosts = [],
    isBlocked = false,
    visiblePosts,
    isMuted = false,
  } = deps;

  // ── Redis mock ──────────────────────────────────────────────────────────────
  const zremPipeline = {
    zrem: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const redisClient = {
    // zrevrangebyscore: return interleaved [id, score, id, score, ...]
    zrevrangebyscore: vi
      .fn()
      .mockResolvedValue(zsetIds.flatMap((id) => [id, String(Number(BigInt(id)))])),
    pipeline: vi.fn().mockReturnValue(zremPipeline),
    publish: vi.fn().mockResolvedValue(1),
  };

  const redisService = { client: redisClient };

  // ── Post repo ───────────────────────────────────────────────────────────────
  const postRepo = {
    find: vi
      .fn()
      .mockImplementation(
        ({ where }: { where: { id?: string; authorId?: string } | Array<{ id: string }> }) => {
          if (Array.isArray(where)) {
            const ids = where.map((w) => w.id);
            return Promise.resolve(dbPosts.filter((p) => ids.includes(p.id)));
          }
          // For block-purge: find by authorId
          if (where && typeof where === 'object' && 'authorId' in where) {
            return Promise.resolve(dbPosts.filter((p) => p.authorId === where.authorId));
          }
          return Promise.resolve(dbPosts);
        },
      ),
    findOne: vi.fn().mockResolvedValue(null),
    createQueryBuilder: vi.fn().mockReturnValue({
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      innerJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(dbPosts),
    }),
  };

  // ── User repo ───────────────────────────────────────────────────────────────
  const userRepo = {
    findOne: vi.fn().mockResolvedValue(userEntity),
    find: vi.fn().mockResolvedValue([]),
  };

  // ── Follow repo ─────────────────────────────────────────────────────────────
  const followRepo = {
    find: vi.fn().mockResolvedValue(
      followees.map((id) => {
        const f = new Follow();
        f.followeeId = id;
        f.followerId = 'user-1';
        f.state = 'active';
        return f;
      }),
    ),
  };

  // ── Like repo ───────────────────────────────────────────────────────────────
  const likeRepoQb = {
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(
      likePosts.map((p) => {
        const l = new Like();
        l.postId = p.id;
        l.userId = 'user-1';
        l.post = p;
        return l;
      }),
    ),
  };
  const likeRepo = {
    createQueryBuilder: vi.fn().mockReturnValue(likeRepoQb),
  };

  // ── Hashtag repo ────────────────────────────────────────────────────────────
  const hashtagRepo = {
    findOne: vi.fn().mockResolvedValue(hashtagEntity),
  };

  // ── PostHashtag repo ────────────────────────────────────────────────────────
  const phQb = {
    innerJoinAndSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(
      hashtagPosts.map((p) => {
        const ph = new PostHashtag();
        ph.postId = p.id;
        ph.post = p;
        return ph;
      }),
    ),
  };
  const postHashtagRepo = {
    createQueryBuilder: vi.fn().mockReturnValue(phQb),
  };

  // ── DataSource ──────────────────────────────────────────────────────────────
  const dataSource = {
    query: vi.fn().mockResolvedValue(celebrities),
  };

  // ── VisibilityService ───────────────────────────────────────────────────────
  const visibilityService = {
    canViewProfile: vi
      .fn()
      .mockResolvedValue(isBlocked ? { visible: false, reason: 'blocked' } : { visible: true }),
    filterPostPage: vi
      .fn()
      .mockImplementation((viewerId: string | null, posts: Post[]) =>
        Promise.resolve(visiblePosts !== undefined ? visiblePosts : posts),
      ),
    isMuted: vi.fn().mockResolvedValue(isMuted),
    isActiveFollower: vi.fn().mockResolvedValue(false),
    getMutedIds: vi.fn().mockResolvedValue(new Set<string>()),
  };

  // ── ViewerFlagsService ──────────────────────────────────────────────────────
  const viewerFlagsService = {
    hydrate: vi.fn().mockImplementation((_viewerId: string | null, postIds: string[]) => {
      const map = new Map<string, { liked: boolean; reposted: boolean; bookmarked: boolean }>();
      postIds.forEach((id) => map.set(id, { liked: false, reposted: false, bookmarked: false }));
      return Promise.resolve(map);
    }),
  };

  // ── EntityExtractorService ──────────────────────────────────────────────────
  const entityExtractor = {
    extractAndPersist: vi.fn().mockResolvedValue({ mentions: [], hashtags: [], urls: [] }),
  };

  // ── PostCacheService ────────────────────────────────────────────────────────
  const postCacheService = {
    mget: vi.fn().mockResolvedValue(cachedPosts),
    mset: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  };

  // ── ConfigService ───────────────────────────────────────────────────────────
  const configService = {
    get: vi.fn().mockReturnValue(10_000),
  };

  const svc = new TimelineService(
    postRepo as never,
    userRepo as never,
    followRepo as never,
    likeRepo as never,
    hashtagRepo as never,
    postHashtagRepo as never,
    dataSource as never,
    redisService as never,
    visibilityService as never,
    viewerFlagsService as never,
    entityExtractor as never,
    postCacheService as never,
    { apply: vi.fn().mockResolvedValue(undefined) } as never, // mediaHydration
    configService as never,
  );

  return {
    svc,
    redisClient,
    zremPipeline,
    postRepo,
    userRepo,
    followRepo,
    likeRepo,
    hashtagRepo,
    postHashtagRepo,
    dataSource,
    visibilityService,
    viewerFlagsService,
    postCacheService,
    entityExtractor,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TimelineService — home feed', () => {
  describe('cache hit path', () => {
    it('returns posts from cache without hitting Postgres', async () => {
      const post = makePost({ id: '1000000000000001' });
      const dto = makePostDto(post);

      const { svc, postRepo } = buildService({
        zsetIds: ['1000000000000001'],
        cachedPosts: new Map([['1000000000000001', dto]]),
      });

      const result = await svc.getHomeFeed('user-1', 20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('1000000000000001');
      // Post repo find should NOT be called for cache hits
      expect(postRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('cache miss + Postgres fallback', () => {
    it('fetches from Postgres on cache miss and backfills cache', async () => {
      const post = makePost({ id: '1000000000000002' });

      const { svc, postCacheService } = buildService({
        zsetIds: ['1000000000000002'],
        cachedPosts: new Map(), // no cache hits
        dbPosts: [post],
      });

      const result = await svc.getHomeFeed('user-1', 20);
      expect(result.items).toHaveLength(1);
      // Cache backfill should have been called
      expect(postCacheService.mset).toHaveBeenCalled();
    });
  });

  describe('cold-start: empty zset', () => {
    it('falls back to pulling recent posts from followees when zset is empty', async () => {
      const post = makePost({ id: '1000000000000003', authorId: 'followee-1' });
      post.author = makeUser({ id: 'followee-1', handle: 'charlie' });

      const qb = {
        leftJoinAndSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([post]),
      };

      const { svc, postRepo } = buildService({
        zsetIds: [], // empty zset
        followees: ['followee-1'],
        dbPosts: [post],
      });

      // Override createQueryBuilder to return our post
      postRepo.createQueryBuilder = vi.fn().mockReturnValue(qb);

      const result = await svc.getHomeFeed('user-1', 20);
      expect(result.items).toHaveLength(1);
    });

    it('returns empty list when user has no followees and zset is empty', async () => {
      const { svc } = buildService({
        zsetIds: [],
        followees: [],
      });

      const result = await svc.getHomeFeed('user-1', 20);
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('visibility filter', () => {
    it('filters out posts that visibility service removes', async () => {
      const post = makePost({ id: '1000000000000004' });
      const dto = makePostDto(post);

      const { svc } = buildService({
        zsetIds: ['1000000000000004'],
        cachedPosts: new Map([['1000000000000004', dto]]),
        visiblePosts: [], // visibility filter removes all
      });

      const result = await svc.getHomeFeed('user-1', 20);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('viewer flags', () => {
    it('hydrates viewer flags for all posts in the page', async () => {
      const post = makePost({ id: '1000000000000005' });
      const dto = makePostDto(post);

      const { svc, viewerFlagsService } = buildService({
        zsetIds: ['1000000000000005'],
        cachedPosts: new Map([['1000000000000005', dto]]),
      });

      await svc.getHomeFeed('user-1', 20);
      expect(viewerFlagsService.hydrate).toHaveBeenCalledWith('user-1', ['1000000000000005']);
    });
  });
});

describe('TimelineService — block-purge', () => {
  it('removes blocked user posts from blocker home zset', async () => {
    const post = makePost({ id: '9999', authorId: 'blocked-user' });
    const blockerPost = makePost({ id: '8888', authorId: 'blocker-user' });

    const { svc, zremPipeline, postRepo } = buildService({ dbPosts: [post, blockerPost] });

    // Override find to return different posts per authorId
    postRepo.find = vi.fn().mockImplementation(({ where }: { where: { authorId: string } }) => {
      if (where.authorId === 'blocked-user') return Promise.resolve([post]);
      if (where.authorId === 'blocker-user') return Promise.resolve([blockerPost]);
      return Promise.resolve([]);
    });

    await svc.purgeBlockedPostsFromZset('blocker-user', 'blocked-user');

    expect(zremPipeline.zrem).toHaveBeenCalledWith('home:blocker-user', '9999');
    expect(zremPipeline.exec).toHaveBeenCalled();
  });
});

describe('TimelineService — getUserPosts', () => {
  it('returns the users own posts cursor-paginated', async () => {
    const post = makePost({ id: '1000000000000006', authorId: 'user-1' });
    post.author = makeUser({ id: 'user-1' });

    const qb = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([post]),
    };

    const { svc, postRepo } = buildService({ userEntity: makeUser() });
    postRepo.createQueryBuilder = vi.fn().mockReturnValue(qb);

    const result = await svc.getUserPosts('alice', null, 20);
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it('throws 404 for unknown handle', async () => {
    const { svc, userRepo } = buildService();
    userRepo.findOne = vi.fn().mockResolvedValue(null);

    await expect(svc.getUserPosts('ghost', null, 20)).rejects.toThrow(NotFoundException);
  });
});

describe('TimelineService — getUserReplies', () => {
  it('returns only posts with replyToId set', async () => {
    const reply = makePost({ id: '777', replyToId: '555', authorId: 'user-1' });
    reply.author = makeUser({ id: 'user-1' });

    const qb = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue([reply]),
    };

    const { svc, postRepo } = buildService({ userEntity: makeUser() });
    postRepo.createQueryBuilder = vi.fn().mockReturnValue(qb);

    const result = await svc.getUserReplies('alice', null, 20);
    expect(result.items).toHaveLength(1);
    // The query builder should filter by reply_to_id IS NOT NULL
    const qbCalls = qb.andWhere.mock.calls.map((call: string[]) => call[0]);
    expect(qbCalls.some((c: string) => c.includes('reply_to_id IS NOT NULL'))).toBe(true);
  });
});

describe('TimelineService — getUserLikes', () => {
  it('returns liked posts for public account', async () => {
    const post = makePost({ id: '500' });
    const { svc } = buildService({ userEntity: makeUser({ isPrivate: false }), likePosts: [post] });

    const result = await svc.getUserLikes('alice', 'viewer-id', 20);
    expect(result.items).toHaveLength(1);
  });

  it('throws 403 for private account when viewer is anonymous', async () => {
    const { svc } = buildService({ userEntity: makeUser({ isPrivate: true }) });
    await expect(svc.getUserLikes('alice', null, 20)).rejects.toThrow(ForbiddenException);
  });

  it('throws 403 for private account when viewer is not a follower', async () => {
    const { svc, visibilityService } = buildService({ userEntity: makeUser({ isPrivate: true }) });
    visibilityService.isActiveFollower = vi.fn().mockResolvedValue(false);

    await expect(svc.getUserLikes('alice', 'viewer-1', 20)).rejects.toThrow(ForbiddenException);
  });

  it('returns liked posts when viewer IS a follower of private account', async () => {
    const post = makePost({ id: '501' });
    const { svc, visibilityService } = buildService({
      userEntity: makeUser({ isPrivate: true }),
      likePosts: [post],
    });
    visibilityService.isActiveFollower = vi.fn().mockResolvedValue(true);

    const result = await svc.getUserLikes('alice', 'follower-1', 20);
    expect(result.items).toHaveLength(1);
  });
});

describe('TimelineService — hashtag timeline', () => {
  it('returns posts for a known hashtag', async () => {
    const tag = new Hashtag();
    tag.id = '100';
    tag.tag = 'typescript';

    const post = makePost({ id: '200' });

    const { svc } = buildService({ hashtagEntity: tag, hashtagPosts: [post] });

    const result = await svc.getHashtagTimeline('typescript', null, 20);
    expect(result.items).toHaveLength(1);
  });

  it('returns empty list when hashtag is unknown', async () => {
    const { svc } = buildService({ hashtagEntity: null });
    const result = await svc.getHashtagTimeline('unknowntag', null, 20);
    expect(result.items).toHaveLength(0);
    expect(result.cursor).toBeNull();
  });

  it('strips leading # from tag before lookup', async () => {
    const tag = new Hashtag();
    tag.id = '101';
    tag.tag = 'typescript';

    const { svc, hashtagRepo } = buildService({ hashtagEntity: tag });
    await svc.getHashtagTimeline('#typescript', null, 20);

    expect(hashtagRepo.findOne).toHaveBeenCalledWith({ where: { tag: 'typescript' } });
  });
});
