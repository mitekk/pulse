/**
 * UsersService unit tests — follow state machine, block/mute, counter logic.
 *
 * All external dependencies mocked via vi.fn() objects. No real DB or Redis.
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../../../src/modules/users/users.service';
import { User } from '../../../src/modules/users/user.entity';
import { Follow } from '../../../src/modules/users/follow.entity';
import { Block } from '../../../src/modules/users/block.entity';
import { VisibilityService } from '../../../src/modules/users/visibility.service';

// ── Test fixture factories ────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'user-uuid-1';
  u.handle = 'alice';
  u.displayName = 'Alice';
  u.email = 'alice@example.com';
  u.passwordHash = 'hashed';
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
  u.createdAt = new Date('2026-01-01T00:00:00Z');
  u.updatedAt = new Date('2026-01-01T00:00:00Z');
  u.deletedAt = null;
  return Object.assign(u, overrides);
}

function makeFollow(overrides: Partial<Follow> = {}): Follow {
  const f = new Follow();
  f.followerId = 'follower-id';
  f.followeeId = 'followee-id';
  f.state = 'active';
  f.createdAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(f, overrides);
}

// ── Build testable UsersService with all deps mocked ─────────────────────────

function buildService() {
  const publicUser = makeUser({ id: 'target-id', handle: 'bob', isPrivate: false });
  const privateUser = makeUser({ id: 'private-id', handle: 'carol', isPrivate: true });

  const userRepo = {
    findOne: vi.fn(),
    findOneOrFail: vi.fn(),
    save: vi.fn(),
  };

  const followRepo = {
    findOne: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const blockRepo = {
    findOne: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  };

  const muteRepo = {
    findOne: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  };

  // DataSource with a transaction mock
  const dataSource = {
    transaction: vi.fn(async (cb: (em: unknown) => Promise<unknown>) => {
      const em = {
        insert: vi.fn(),
        delete: vi.fn(),
        findOne: vi.fn(),
        update: vi.fn(),
        query: vi.fn(),
      };
      return cb(em);
    }),
  };

  const visibilityService = {
    canViewProfile: vi.fn(),
    isBlocked: vi.fn(),
    isActiveFollower: vi.fn(),
  } as unknown as VisibilityService;

  const notificationPort = {
    notifyFollow: vi.fn().mockResolvedValue(undefined),
    notifyFollowRequest: vi.fn().mockResolvedValue(undefined),
    notifyFollowAccepted: vi.fn().mockResolvedValue(undefined),
  };

  const service = new UsersService(
    userRepo as never,
    followRepo as never,
    blockRepo as never,
    muteRepo as never,
    dataSource as never,
    visibilityService as never,
    notificationPort as never,
  );

  return {
    service,
    userRepo,
    followRepo,
    blockRepo,
    muteRepo,
    dataSource,
    visibilityService,
    notificationPort,
    publicUser,
    privateUser,
  };
}

// ── Follow state machine ──────────────────────────────────────────────────────

describe('UsersService.follow()', () => {
  it('returns active state immediately for a public account', async () => {
    const { service, userRepo, followRepo, visibilityService } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob', isPrivate: false }));
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    followRepo.findOne.mockResolvedValue(null); // not yet following

    const result = await service.follow('alice-id', 'bob');

    expect(result.state).toBe('active');
  });

  it('returns pending state for a private account', async () => {
    const { service, userRepo, followRepo, visibilityService } = buildService();

    userRepo.findOne.mockResolvedValue(
      makeUser({ id: 'carol-id', handle: 'carol', isPrivate: true }),
    );
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    followRepo.findOne.mockResolvedValue(null);

    const result = await service.follow('alice-id', 'carol');

    expect(result.state).toBe('pending');
  });

  it('is idempotent — returns existing state if follow row already exists', async () => {
    const { service, userRepo, followRepo, visibilityService } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob', isPrivate: false }));
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    followRepo.findOne.mockResolvedValue(makeFollow({ state: 'active' }));

    const result = await service.follow('alice-id', 'bob');

    expect(result.state).toBe('active');
    // transaction should NOT have been called since row already exists
  });

  it('throws ForbiddenException when block exists in either direction', async () => {
    const { service, userRepo, followRepo, visibilityService } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob', isPrivate: false }));
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    followRepo.findOne.mockResolvedValue(null);

    await expect(service.follow('alice-id', 'bob')).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when following self', async () => {
    const { service, userRepo } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'alice-id', handle: 'alice' }));

    await expect(service.follow('alice-id', 'alice')).rejects.toThrow(BadRequestException);
  });

  it('increments counters for public follow', async () => {
    const { service, userRepo, followRepo, visibilityService, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob', isPrivate: false }));
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    followRepo.findOne.mockResolvedValue(null);

    await service.follow('alice-id', 'bob');

    // The transaction fn should have been called
    expect(dataSource.transaction).toHaveBeenCalledOnce();

    // Capture what the em.query calls were
    const txCallback = (dataSource.transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const emQueries: string[] = [];
    const em = {
      insert: vi.fn(),
      delete: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      query: vi.fn((...args: unknown[]) => emQueries.push(args[0] as string)),
    };
    await txCallback(em);

    expect(emQueries).toHaveLength(2);
    expect(emQueries[0]).toContain('followers_count = followers_count + 1');
    expect(emQueries[1]).toContain('following_count = following_count + 1');
  });

  it('does NOT increment counters for pending (private account) follow', async () => {
    const { service, userRepo, followRepo, visibilityService, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(
      makeUser({ id: 'carol-id', handle: 'carol', isPrivate: true }),
    );
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    followRepo.findOne.mockResolvedValue(null);

    await service.follow('alice-id', 'carol');

    const txCallback = (dataSource.transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const emQueries: string[] = [];
    const em = {
      insert: vi.fn(),
      delete: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      query: vi.fn((...args: unknown[]) => emQueries.push(args[0] as string)),
    };
    await txCallback(em);

    // Only insert — no counter updates for pending state
    expect(em.insert).toHaveBeenCalledOnce();
    expect(emQueries).toHaveLength(0);
  });

  it('emits follow notification for public follow', async () => {
    const { service, userRepo, followRepo, visibilityService, notificationPort } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob', isPrivate: false }));
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    followRepo.findOne.mockResolvedValue(null);

    await service.follow('alice-id', 'bob');

    expect(notificationPort.notifyFollow).toHaveBeenCalledWith('alice-id', 'bob-id');
    expect(notificationPort.notifyFollowRequest).not.toHaveBeenCalled();
  });

  it('emits follow_request notification for private account', async () => {
    const { service, userRepo, followRepo, visibilityService, notificationPort } = buildService();

    userRepo.findOne.mockResolvedValue(
      makeUser({ id: 'carol-id', handle: 'carol', isPrivate: true }),
    );
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    followRepo.findOne.mockResolvedValue(null);

    await service.follow('alice-id', 'carol');

    expect(notificationPort.notifyFollowRequest).toHaveBeenCalledWith('alice-id', 'carol-id');
    expect(notificationPort.notifyFollow).not.toHaveBeenCalled();
  });
});

// ── Unfollow ──────────────────────────────────────────────────────────────────

describe('UsersService.unfollow()', () => {
  it('removes an active follow and decrements counters', async () => {
    const { service, userRepo, followRepo, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob' }));
    followRepo.findOne.mockResolvedValue(makeFollow({ state: 'active' }));

    await service.unfollow('alice-id', 'bob');

    expect(dataSource.transaction).toHaveBeenCalledOnce();
  });

  it('is idempotent when not following', async () => {
    const { service, userRepo, followRepo, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob' }));
    followRepo.findOne.mockResolvedValue(null); // already not following

    await service.unfollow('alice-id', 'bob');

    // No transaction needed
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('removes a pending follow without decrementing counters', async () => {
    const { service, userRepo, followRepo, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'carol-id', handle: 'carol' }));
    followRepo.findOne.mockResolvedValue(makeFollow({ state: 'pending' }));

    await service.unfollow('alice-id', 'carol');

    const txCallback = (dataSource.transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const emQueries: string[] = [];
    const em = {
      insert: vi.fn(),
      delete: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      query: vi.fn((...args: unknown[]) => emQueries.push(args[0] as string)),
    };
    await txCallback(em);

    expect(em.delete).toHaveBeenCalledOnce(); // row deleted
    expect(emQueries).toHaveLength(0); // no counter updates
  });
});

// ── Block removes follows in both directions ───────────────────────────────────

describe('UsersService.block()', () => {
  it('inserts a block row', async () => {
    const { service, userRepo, blockRepo, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob' }));
    blockRepo.findOne.mockResolvedValue(null); // not already blocked

    await service.block('alice-id', 'bob');

    // The transaction should be called
    expect(dataSource.transaction).toHaveBeenCalledOnce();
  });

  it('removes follow in both directions when block is applied', async () => {
    const { service, userRepo, blockRepo, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob' }));
    blockRepo.findOne.mockResolvedValue(null);

    await service.block('alice-id', 'bob');

    const txCallback = (dataSource.transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const emDeletes: unknown[] = [];
    const em = {
      insert: vi.fn(),
      delete: vi.fn((...args: unknown[]) => emDeletes.push(args)),
      findOne: vi
        .fn()
        .mockResolvedValueOnce(
          makeFollow({ followerId: 'alice-id', followeeId: 'bob-id', state: 'active' }),
        ) // blocker→target
        .mockResolvedValueOnce(
          makeFollow({ followerId: 'bob-id', followeeId: 'alice-id', state: 'active' }),
        ), // target→blocker
      update: vi.fn(),
      query: vi.fn(),
    };
    await txCallback(em);

    // 2 follow deletes + 1 block insert
    expect(em.delete).toHaveBeenCalledTimes(2);
    expect(em.insert).toHaveBeenCalledOnce(); // block row
  });

  it('decrements counters for both active follows removed during block', async () => {
    const { service, userRepo, blockRepo, dataSource } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob' }));
    blockRepo.findOne.mockResolvedValue(null);

    await service.block('alice-id', 'bob');

    const txCallback = (dataSource.transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const emQueries: string[] = [];
    const em = {
      insert: vi.fn(),
      delete: vi.fn(),
      findOne: vi
        .fn()
        .mockResolvedValueOnce(makeFollow({ state: 'active' }))
        .mockResolvedValueOnce(makeFollow({ state: 'active' })),
      update: vi.fn(),
      query: vi.fn((...args: unknown[]) => emQueries.push(args[0] as string)),
    };
    await txCallback(em);

    // 4 counter updates: 2 per follow direction
    expect(emQueries).toHaveLength(4);
    expect(emQueries.every((q) => q.includes('count'))).toBe(true);
  });

  it('is idempotent — returns blocked:true if already blocked', async () => {
    const { service, userRepo, blockRepo } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob' }));
    blockRepo.findOne.mockResolvedValue(new Block()); // already blocked

    const result = await service.block('alice-id', 'bob');

    expect(result.blocked).toBe(true);
  });

  it('re-follow after block throws ForbiddenException', async () => {
    const { service, userRepo, followRepo, visibilityService } = buildService();

    userRepo.findOne.mockResolvedValue(makeUser({ id: 'bob-id', handle: 'bob', isPrivate: false }));
    (visibilityService.isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    followRepo.findOne.mockResolvedValue(null);

    await expect(service.follow('alice-id', 'bob')).rejects.toThrow(ForbiddenException);
  });
});

// ── Follow request accept / decline ──────────────────────────────────────────

describe('UsersService.acceptFollowRequest()', () => {
  it('transitions pending → active and increments counters', async () => {
    const { service, followRepo, dataSource } = buildService();

    followRepo.findOne.mockResolvedValue(
      makeFollow({ followerId: 'alice-id', followeeId: 'carol-id', state: 'pending' }),
    );

    const result = await service.acceptFollowRequest('carol-id', 'alice-id:carol-id');

    expect(result.state).toBe('active');
    expect(dataSource.transaction).toHaveBeenCalledOnce();
  });

  it('increments counters on accept', async () => {
    const { service, followRepo, dataSource, notificationPort } = buildService();

    followRepo.findOne.mockResolvedValue(
      makeFollow({ followerId: 'alice-id', followeeId: 'carol-id', state: 'pending' }),
    );

    await service.acceptFollowRequest('carol-id', 'alice-id:carol-id');

    const txCallback = (dataSource.transaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const emQueries: string[] = [];
    const em = {
      update: vi.fn(),
      query: vi.fn((...args: unknown[]) => emQueries.push(args[0] as string)),
    };
    await txCallback(em);

    expect(emQueries).toHaveLength(2);
    expect(emQueries[0]).toContain('followers_count = followers_count + 1');
    expect(emQueries[1]).toContain('following_count = following_count + 1');
    expect(notificationPort.notifyFollowAccepted).toHaveBeenCalledWith('alice-id', 'carol-id');
  });

  it("throws ForbiddenException when accepting another user's request", async () => {
    const { service } = buildService();

    await expect(service.acceptFollowRequest('bob-id', 'alice-id:carol-id')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException when request does not exist', async () => {
    const { service, followRepo } = buildService();

    followRepo.findOne.mockResolvedValue(null);

    await expect(service.acceptFollowRequest('carol-id', 'alice-id:carol-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('UsersService.declineFollowRequest()', () => {
  it('removes the pending follow row', async () => {
    const { service, followRepo } = buildService();

    followRepo.findOne.mockResolvedValue(
      makeFollow({ followerId: 'alice-id', followeeId: 'carol-id', state: 'pending' }),
    );

    const result = await service.declineFollowRequest('carol-id', 'alice-id:carol-id');

    expect(result.state).toBe('declined');
    expect(followRepo.delete).toHaveBeenCalledWith({
      followerId: 'alice-id',
      followeeId: 'carol-id',
    });
  });

  it("throws ForbiddenException when declining another user's request", async () => {
    const { service } = buildService();

    await expect(service.declineFollowRequest('bob-id', 'alice-id:carol-id')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
