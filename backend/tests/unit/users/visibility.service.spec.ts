/**
 * VisibilityService unit tests — profile/post visibility matrix.
 *
 * Tests the core §3.6 visibility rules:
 *   - Blocked (either direction) → hidden
 *   - Private account + non-follower → hidden
 *   - Self view → always visible
 *   - Muted → visible on direct visit (suppressed from home timeline only)
 *   - Deleted post → tombstone (visible) unless suppressDeleted
 */
import { describe, it, expect, vi } from 'vitest';
import {
  VisibilityService,
  AuthorContext,
  PostContext,
} from '../../../src/modules/users/visibility.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAuthor(overrides: Partial<AuthorContext> = {}): AuthorContext {
  return {
    id: 'author-id',
    isPrivate: false,
    deletedAt: null,
    ...overrides,
  };
}

function makePost(overrides: Partial<PostContext> = {}): PostContext {
  const author = makeAuthor(overrides.author);
  return {
    authorId: author.id,
    author,
    deletedAt: null,
    ...overrides,
  };
}

// ── Build VisibilityService with mocked repos ─────────────────────────────────

function buildService() {
  const blockRepo = {
    createQueryBuilder: vi.fn(),
    findOne: vi.fn(),
  };

  const followRepo = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const muteRepo = {
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  // Helper to configure block mock (either-direction query)
  const setBlock = (exists: boolean) => {
    const mockQb = {
      where: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(exists ? 1 : 0),
    };
    blockRepo.createQueryBuilder.mockReturnValue(mockQb);
  };

  // Helper to configure follow mock
  const setFollow = (state: 'active' | 'pending' | null) => {
    followRepo.findOne.mockResolvedValue(state ? { state } : null);
  };

  // Helper to configure mute mock
  const setMute = (exists: boolean) => {
    muteRepo.findOne.mockResolvedValue(exists ? { muterId: 'viewer', mutedId: 'author' } : null);
  };

  const service = new VisibilityService(blockRepo as never, followRepo as never, muteRepo as never);

  return { service, blockRepo, followRepo, muteRepo, setBlock, setFollow, setMute };
}

// ── Profile visibility ────────────────────────────────────────────────────────

describe('VisibilityService.canViewProfile()', () => {
  it('allows self-view unconditionally', async () => {
    const { service, blockRepo } = buildService();
    const author = makeAuthor({ id: 'alice' });

    const result = await service.canViewProfile('alice', author);

    expect(result.visible).toBe(true);
    // Block check should not be called for self
    expect(blockRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('blocks when block exists in either direction', async () => {
    const { service, setBlock } = buildService();
    const author = makeAuthor({ id: 'bob', isPrivate: false });
    setBlock(true);

    const result = await service.canViewProfile('alice', author);

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('blocked');
  });

  it('allows non-blocked public profile', async () => {
    const { service, setBlock, setFollow } = buildService();
    const author = makeAuthor({ id: 'bob', isPrivate: false });
    setBlock(false);
    setFollow(null);

    const result = await service.canViewProfile('alice', author);

    expect(result.visible).toBe(true);
  });

  it('hides private account from anonymous viewer', async () => {
    const { service } = buildService();
    const author = makeAuthor({ id: 'carol', isPrivate: true });

    const result = await service.canViewProfile(null, author);

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('private');
  });

  it('hides private account from non-follower', async () => {
    const { service, setBlock, setFollow } = buildService();
    const author = makeAuthor({ id: 'carol', isPrivate: true });
    setBlock(false);
    setFollow(null);

    const result = await service.canViewProfile('alice', author);

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('private');
  });

  it('allows active follower to view private account', async () => {
    const { service, setBlock, setFollow } = buildService();
    const author = makeAuthor({ id: 'carol', isPrivate: true });
    setBlock(false);
    setFollow('active');

    const result = await service.canViewProfile('alice', author);

    expect(result.visible).toBe(true);
  });

  it('hides private account from pending (not yet accepted) follower', async () => {
    const { service, setBlock, followRepo } = buildService();
    const author = makeAuthor({ id: 'carol', isPrivate: true });
    setBlock(false);
    // isActiveFollower queries with state='active' filter — pending row does NOT satisfy it
    // so the repo should return null (no active follow found)
    followRepo.findOne.mockResolvedValue(null);

    const result = await service.canViewProfile('alice', author);

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('private');
  });

  it('allows anonymous viewer of public profile', async () => {
    const { service } = buildService();
    const author = makeAuthor({ id: 'bob', isPrivate: false });

    const result = await service.canViewProfile(null, author);

    expect(result.visible).toBe(true);
  });
});

// ── Post visibility ───────────────────────────────────────────────────────────

describe('VisibilityService.canViewPost()', () => {
  it('allows author to always see their own post', async () => {
    const { service, blockRepo } = buildService();
    const post = makePost({ authorId: 'alice', author: makeAuthor({ id: 'alice' }) });

    const result = await service.canViewPost('alice', post);

    expect(result.visible).toBe(true);
    expect(blockRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns tombstone (visible: true) for soft-deleted post by default', async () => {
    const { service, setBlock } = buildService();
    const post = makePost({ deletedAt: new Date() });
    setBlock(false);

    const result = await service.canViewPost('viewer', post);

    expect(result.visible).toBe(true); // tombstone survives
  });

  it('suppresses soft-deleted post when suppressDeleted=true', async () => {
    const { service } = buildService();
    const post = makePost({ deletedAt: new Date() });

    const result = await service.canViewPost('viewer', post, { suppressDeleted: true });

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('deleted');
  });

  it('blocks post when block exists in either direction', async () => {
    const { service, setBlock } = buildService();
    const post = makePost({ authorId: 'bob', author: makeAuthor({ id: 'bob' }) });
    setBlock(true);

    const result = await service.canViewPost('alice', post);

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('blocked');
  });

  it('hides post from private author to non-follower', async () => {
    const { service, setBlock, setFollow } = buildService();
    const post = makePost({
      authorId: 'carol',
      author: makeAuthor({ id: 'carol', isPrivate: true }),
    });
    setBlock(false);
    setFollow(null); // alice is not following carol

    const result = await service.canViewPost('alice', post);

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('private');
  });

  it('allows active follower to see private author post', async () => {
    const { service, setBlock, setFollow } = buildService();
    const post = makePost({
      authorId: 'carol',
      author: makeAuthor({ id: 'carol', isPrivate: true }),
    });
    setBlock(false);
    setFollow('active');

    const result = await service.canViewPost('alice', post);

    expect(result.visible).toBe(true);
  });

  it('hides post from private author to anonymous viewer', async () => {
    const { service } = buildService();
    const post = makePost({
      authorId: 'carol',
      author: makeAuthor({ id: 'carol', isPrivate: true }),
    });

    const result = await service.canViewPost(null, post);

    expect(result.visible).toBe(false);
    expect((result as { reason: string }).reason).toBe('private');
  });

  it('muted author post is visible on direct visit', async () => {
    const { service, setBlock, setFollow } = buildService();
    const post = makePost({
      authorId: 'bob',
      author: makeAuthor({ id: 'bob', isPrivate: false }),
    });
    setBlock(false);
    setFollow(null);
    // isMuted is not called by canViewPost — muted = visible on direct visit

    const result = await service.canViewPost('alice', post);

    expect(result.visible).toBe(true);
  });
});

// ── isMuted helper ────────────────────────────────────────────────────────────

describe('VisibilityService.isMuted()', () => {
  it('returns true when viewer has muted the author', async () => {
    const { service, setMute } = buildService();
    setMute(true);

    const result = await service.isMuted('alice', 'bob');

    expect(result).toBe(true);
  });

  it('returns false when viewer has not muted the author', async () => {
    const { service, setMute } = buildService();
    setMute(false);

    const result = await service.isMuted('alice', 'bob');

    expect(result).toBe(false);
  });
});

// ── filterPostPage batch helper ───────────────────────────────────────────────

describe('VisibilityService.filterPostPage()', () => {
  it('returns empty array for empty input', async () => {
    const { service } = buildService();
    const result = await service.filterPostPage('alice', []);
    expect(result).toHaveLength(0);
  });

  it('filters blocked author posts from page', async () => {
    const { blockRepo } = buildService();

    const mockQb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([{ blocker: 'bob', blocked: 'alice' }]),
    };
    blockRepo.createQueryBuilder.mockReturnValue(mockQb);

    // followRepo for bulk active follower check
    const { followRepo } = buildService();
    const followQb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    followRepo.createQueryBuilder.mockReturnValue(followQb);

    const posts: PostContext[] = [
      makePost({ authorId: 'bob', author: makeAuthor({ id: 'bob', isPrivate: false }) }),
      makePost({ authorId: 'carol', author: makeAuthor({ id: 'carol', isPrivate: false }) }),
    ];

    // Build a fresh service with the mocked repos wired
    const freshService = new VisibilityService(
      blockRepo as never,
      followRepo as never,
      {
        createQueryBuilder: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          getRawMany: vi.fn().mockResolvedValue([]),
        }),
      } as never,
    );

    const result = await freshService.filterPostPage('alice', posts);
    // bob is blocked → only carol's post survives
    expect(result).toHaveLength(1);
    expect(result[0].authorId).toBe('carol');
  });

  it('filters private author posts for non-followers', async () => {
    const blockQb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]), // no blocks
    };
    const blockRepo = { createQueryBuilder: vi.fn().mockReturnValue(blockQb) };

    const followQb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]), // not following carol
    };
    const followRepo = { createQueryBuilder: vi.fn().mockReturnValue(followQb) };

    const muteQb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    const muteRepo = { createQueryBuilder: vi.fn().mockReturnValue(muteQb) };

    const service = new VisibilityService(
      blockRepo as never,
      followRepo as never,
      muteRepo as never,
    );

    const posts: PostContext[] = [
      makePost({ authorId: 'carol', author: makeAuthor({ id: 'carol', isPrivate: true }) }),
      makePost({ authorId: 'bob', author: makeAuthor({ id: 'bob', isPrivate: false }) }),
    ];

    const result = await service.filterPostPage('alice', posts);
    // carol private + not following → filtered; bob public → visible
    expect(result).toHaveLength(1);
    expect(result[0].authorId).toBe('bob');
  });

  it('shows deleted post as tombstone (not suppressed by default)', async () => {
    const blockQb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    const followQb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    const muteQb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };

    const service = new VisibilityService(
      { createQueryBuilder: vi.fn().mockReturnValue(blockQb) } as never,
      { createQueryBuilder: vi.fn().mockReturnValue(followQb) } as never,
      { createQueryBuilder: vi.fn().mockReturnValue(muteQb) } as never,
    );

    const posts: PostContext[] = [
      makePost({ authorId: 'bob', deletedAt: new Date(), author: makeAuthor({ id: 'bob' }) }),
    ];

    const result = await service.filterPostPage('alice', posts);
    expect(result).toHaveLength(1); // tombstone included
  });

  it('suppresses deleted posts when suppressDeleted=true', async () => {
    const blockQb = {
      select: vi.fn().mockReturnThis(),
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    const followQb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };
    const muteQb = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawMany: vi.fn().mockResolvedValue([]),
    };

    const service = new VisibilityService(
      { createQueryBuilder: vi.fn().mockReturnValue(blockQb) } as never,
      { createQueryBuilder: vi.fn().mockReturnValue(followQb) } as never,
      { createQueryBuilder: vi.fn().mockReturnValue(muteQb) } as never,
    );

    const posts: PostContext[] = [
      makePost({ authorId: 'bob', deletedAt: new Date(), author: makeAuthor({ id: 'bob' }) }),
      makePost({ authorId: 'carol', author: makeAuthor({ id: 'carol' }) }),
    ];

    const result = await service.filterPostPage('alice', posts, { suppressDeleted: true });
    expect(result).toHaveLength(1);
    expect(result[0].authorId).toBe('carol');
  });
});
