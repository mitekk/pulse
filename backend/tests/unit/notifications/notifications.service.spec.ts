/**
 * NotificationsService unit tests.
 *
 * Covers:
 *   - Creation per type (like, reply, repost, quote, mention, follow, follow_request, dm)
 *   - Self-notification suppression (actor === recipient)
 *   - Block suppression (recipient blocked actor OR actor blocked recipient)
 *   - Mute suppression (recipient muted actor) for non-follow/dm types
 *   - Mute does NOT suppress follow/follow_request/dm types
 *   - Duplicate dedup within DEDUP_WINDOW_MS
 *   - Aggregation grouping: actors de-duplicated + otherCount computed
 *   - Unread-count: Redis hit, Redis miss with DB reconcile
 *   - Mark-read: subset by ids, all unread, Redis badge adjustment
 *   - markRead with invalid id throws BadRequestException
 */
import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service';
import { Notification } from '../../../src/modules/notifications/notification.entity';
import { User } from '../../../src/modules/users/user.entity';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RECIPIENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const POST_ID = '1000000000000001';

function makeUser(id: string): User {
  const u = new User();
  u.id = id;
  u.handle = `user_${id.slice(0, 4)}`;
  u.displayName = `User ${id.slice(0, 4)}`;
  u.isVerified = false;
  u.isPrivate = false;
  return u;
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  const n = new Notification();
  n.id = overrides.id ?? '9000000000000001';
  n.recipientId = overrides.recipientId ?? RECIPIENT_ID;
  n.type = overrides.type ?? 'like';
  n.actorId = overrides.actorId ?? ACTOR_ID;
  n.postId = overrides.postId ?? POST_ID;
  n.readAt = overrides.readAt ?? null;
  n.createdAt = overrides.createdAt ?? new Date('2026-01-01T12:00:00Z');
  n.actor = overrides.actor ?? makeUser(n.actorId);
  return Object.assign(n, overrides);
}

// ── Service factory ───────────────────────────────────────────────────────────

/**
 * Build a NotificationsService with all deps mocked via vi.fn().
 * Returns the service and the mocked dependencies so tests can set up stubs.
 */
function buildService() {
  const notifRepo = {
    create: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    findOne: vi.fn(),
    createQueryBuilder: vi.fn(),
    find: vi.fn(),
  };

  const postRepo = {
    find: vi.fn().mockResolvedValue([]),
  };

  // queryFn is the raw .query() method — mocked per test
  const queryFn = vi.fn();
  const dataSource = { query: queryFn };

  const redisGet = vi.fn().mockResolvedValue(null);
  const redisSet = vi.fn().mockResolvedValue('OK');
  const redisIncr = vi.fn().mockResolvedValue(1);
  const redisClient = { get: redisGet, set: redisSet, incr: redisIncr };
  const redisService = { client: redisClient };

  const queueAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
  const notifyQueue = { add: queueAdd };

  const service = new (NotificationsService as unknown as new (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => NotificationsService)(notifRepo, postRepo, dataSource, redisService, notifyQueue);

  return {
    service,
    notifRepo,
    postRepo,
    queryFn,
    redisGet,
    redisSet,
    redisIncr,
    redisClient,
    queueAdd,
  };
}

// ── Helper: mock createNotification path ─────────────────────────────────────

/**
 * Set up the dataSource.query mock to return "no block", "no mute", "no dup"
 * in the three sequential raw query calls made by createNotification.
 */
function mockNoBlockNoMuteNoDup(queryFn: ReturnType<typeof vi.fn>) {
  queryFn
    .mockResolvedValueOnce([{ exists: false }]) // blocks check
    .mockResolvedValueOnce([{ exists: false }]) // mutes check
    .mockResolvedValueOnce([{ exists: false }]); // dedup check
}

/**
 * Set up the dataSource.query mock for a non-mute-checked type (follow/dm):
 * only blocks + dedup (no mute query).
 */
function mockNoBlockNoDup(queryFn: ReturnType<typeof vi.fn>) {
  queryFn
    .mockResolvedValueOnce([{ exists: false }]) // blocks check
    .mockResolvedValueOnce([{ exists: false }]); // dedup check
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  describe('creation per type', () => {
    it('creates a like notification', async () => {
      const { service, notifRepo, queryFn, queueAdd } = buildService();
      mockNoBlockNoMuteNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'like' }));

      await service.notifyLike(ACTOR_ID, RECIPIENT_ID, POST_ID);

      expect(notifRepo.save).toHaveBeenCalledOnce();
      expect(queueAdd).toHaveBeenCalledWith(
        'notify.deliver',
        expect.objectContaining({ recipientId: RECIPIENT_ID }),
        expect.any(Object),
      );
    });

    it('creates a reply notification', async () => {
      const { service, notifRepo, queryFn, queueAdd } = buildService();
      mockNoBlockNoMuteNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'reply' }));

      await service.notifyReply(ACTOR_ID, RECIPIENT_ID, POST_ID);

      expect(notifRepo.save).toHaveBeenCalledOnce();
      expect(queueAdd).toHaveBeenCalledOnce();
    });

    it('creates a repost notification', async () => {
      const { service, notifRepo, queryFn } = buildService();
      mockNoBlockNoMuteNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'repost' }));

      await service.notifyRepost(ACTOR_ID, RECIPIENT_ID, POST_ID);

      expect(notifRepo.save).toHaveBeenCalledOnce();
    });

    it('creates a quote notification', async () => {
      const { service, notifRepo, queryFn } = buildService();
      mockNoBlockNoMuteNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'quote' }));

      await service.notifyQuote(ACTOR_ID, RECIPIENT_ID, POST_ID);

      expect(notifRepo.save).toHaveBeenCalledOnce();
    });

    it('creates a mention notification', async () => {
      const { service, notifRepo, queryFn } = buildService();
      mockNoBlockNoMuteNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'mention' }));

      await service.notifyMention(ACTOR_ID, RECIPIENT_ID, POST_ID);

      expect(notifRepo.save).toHaveBeenCalledOnce();
    });

    it('creates a follow notification (no mute check)', async () => {
      const { service, notifRepo, queryFn } = buildService();
      mockNoBlockNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'follow', postId: null }));

      await service.notifyFollow(ACTOR_ID, RECIPIENT_ID);

      // Only 2 query calls (block + dedup), not 3
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(notifRepo.save).toHaveBeenCalledOnce();
    });

    it('creates a follow_request notification (no mute check)', async () => {
      const { service, notifRepo, queryFn } = buildService();
      mockNoBlockNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'follow_request', postId: null }));

      await service.notifyFollowRequest(ACTOR_ID, RECIPIENT_ID);

      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(notifRepo.save).toHaveBeenCalledOnce();
    });

    it('creates a dm notification (no mute check)', async () => {
      const { service, notifRepo, queryFn } = buildService();
      mockNoBlockNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification({ type: 'dm', postId: null }));

      await service.notifyDm(ACTOR_ID, RECIPIENT_ID, 'conv-1', 'msg-1');

      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(notifRepo.save).toHaveBeenCalledOnce();
    });
  });

  describe('self-notification suppression', () => {
    it('suppresses notification when actor === recipient', async () => {
      const { service, notifRepo, queryFn } = buildService();

      const result = await service.createNotification({
        type: 'like',
        actorId: ACTOR_ID,
        recipientId: ACTOR_ID, // same as actor
        postId: POST_ID,
      });

      expect(result).toBeNull();
      expect(queryFn).not.toHaveBeenCalled();
      expect(notifRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('block suppression', () => {
    it('suppresses when recipient has blocked the actor', async () => {
      const { service, notifRepo, queryFn } = buildService();
      // Block query returns true
      queryFn.mockResolvedValueOnce([{ exists: true }]);

      const result = await service.createNotification({
        type: 'like',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: POST_ID,
      });

      expect(result).toBeNull();
      expect(notifRepo.save).not.toHaveBeenCalled();
      // Only one query (block check); no mute or dedup queries
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it('suppresses when actor has blocked the recipient', async () => {
      const { service, notifRepo, queryFn } = buildService();
      // The block query checks both directions, so returning true covers both cases
      queryFn.mockResolvedValueOnce([{ exists: true }]);

      const result = await service.createNotification({
        type: 'follow',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: null,
      });

      expect(result).toBeNull();
      expect(notifRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('mute suppression', () => {
    it('suppresses like notification when recipient has muted the actor', async () => {
      const { service, notifRepo, queryFn } = buildService();
      queryFn
        .mockResolvedValueOnce([{ exists: false }]) // block: no
        .mockResolvedValueOnce([{ exists: true }]); // mute: yes

      const result = await service.createNotification({
        type: 'like',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: POST_ID,
      });

      expect(result).toBeNull();
      expect(notifRepo.save).not.toHaveBeenCalled();
    });

    it('does NOT suppress follow notification even when actor is muted', async () => {
      const { service, notifRepo, queryFn } = buildService();
      // follow type skips mute check → only blocks + dedup
      queryFn
        .mockResolvedValueOnce([{ exists: false }]) // block: no
        .mockResolvedValueOnce([{ exists: false }]); // dedup: no
      notifRepo.create.mockReturnValue(makeNotification({ type: 'follow', postId: null }));

      const result = await service.createNotification({
        type: 'follow',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: null,
      });

      expect(result).not.toBeNull();
      expect(notifRepo.save).toHaveBeenCalledOnce();
      // mute query was NOT called (only 2 raw queries total)
      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    it('does NOT suppress dm notification even when actor is muted', async () => {
      const { service, notifRepo, queryFn } = buildService();
      queryFn
        .mockResolvedValueOnce([{ exists: false }]) // block
        .mockResolvedValueOnce([{ exists: false }]); // dedup
      notifRepo.create.mockReturnValue(makeNotification({ type: 'dm', postId: null }));

      const result = await service.createNotification({
        type: 'dm',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: null,
      });

      expect(result).not.toBeNull();
      expect(queryFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('duplicate dedup within window', () => {
    it('suppresses duplicate like within dedup window', async () => {
      const { service, notifRepo, queryFn } = buildService();
      queryFn
        .mockResolvedValueOnce([{ exists: false }]) // block
        .mockResolvedValueOnce([{ exists: false }]) // mute
        .mockResolvedValueOnce([{ exists: true }]); // dedup: duplicate found

      const result = await service.createNotification({
        type: 'like',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: POST_ID,
      });

      expect(result).toBeNull();
      expect(notifRepo.save).not.toHaveBeenCalled();
    });

    it('allows like after dedup window expires (dup check returns false)', async () => {
      const { service, notifRepo, queryFn } = buildService();
      mockNoBlockNoMuteNoDup(queryFn); // all three checks return false
      notifRepo.create.mockReturnValue(makeNotification({ type: 'like' }));

      const result = await service.createNotification({
        type: 'like',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: POST_ID,
      });

      expect(result).not.toBeNull();
      expect(notifRepo.save).toHaveBeenCalledOnce();
    });
  });

  describe('Redis unread badge', () => {
    it('increments Redis unread badge on successful creation', async () => {
      const { service, notifRepo, queryFn, redisIncr } = buildService();
      mockNoBlockNoMuteNoDup(queryFn);
      notifRepo.create.mockReturnValue(makeNotification());

      await service.createNotification({
        type: 'like',
        actorId: ACTOR_ID,
        recipientId: RECIPIENT_ID,
        postId: POST_ID,
      });

      expect(redisIncr).toHaveBeenCalledWith(`notif:unread:${RECIPIENT_ID}`);
    });

    it('does not increment badge when suppressed by self-notify', async () => {
      const { service, redisIncr } = buildService();

      await service.createNotification({
        type: 'like',
        actorId: ACTOR_ID,
        recipientId: ACTOR_ID,
        postId: POST_ID,
      });

      expect(redisIncr).not.toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('returns cached Redis value when key exists', async () => {
      const { service, redisGet, queryFn } = buildService();
      redisGet.mockResolvedValueOnce('7');

      const count = await service.getUnreadCount(RECIPIENT_ID);

      expect(count).toBe(7);
      expect(queryFn).not.toHaveBeenCalled(); // no DB query needed
    });

    it('reconciles from DB when Redis key is missing', async () => {
      const { service, redisGet, redisSet, queryFn } = buildService();
      redisGet.mockResolvedValueOnce(null); // cache miss
      queryFn.mockResolvedValueOnce([{ count: '3' }]); // DB count

      const count = await service.getUnreadCount(RECIPIENT_ID);

      expect(count).toBe(3);
      expect(redisSet).toHaveBeenCalledWith(`notif:unread:${RECIPIENT_ID}`, '3');
    });

    it('returns 0 and does not set Redis when DB count is 0', async () => {
      const { service, redisGet, redisSet, queryFn } = buildService();
      redisGet.mockResolvedValueOnce(null);
      queryFn.mockResolvedValueOnce([{ count: '0' }]);

      const count = await service.getUnreadCount(RECIPIENT_ID);

      expect(count).toBe(0);
      expect(redisSet).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('marks specific notification IDs as read', async () => {
      const { service, queryFn, redisGet, redisSet } = buildService();
      // markRead uses UPDATE ... RETURNING which returns [rows, rowCount] tuple via DataSource.query()
      queryFn.mockResolvedValueOnce([[{ id: '9000000000000001' }, { id: '9000000000000002' }], 2]);
      redisGet.mockResolvedValueOnce('5'); // current unread count

      const result = await service.markRead(RECIPIENT_ID, ['9000000000000001', '9000000000000002']);

      expect(result).toEqual({ updated: 2 });
      expect(redisSet).toHaveBeenCalledWith(`notif:unread:${RECIPIENT_ID}`, '3'); // 5 - 2
    });

    it('marks ALL unread when ids is omitted', async () => {
      const { service, queryFn, redisGet, redisSet } = buildService();
      queryFn.mockResolvedValueOnce([
        [{ id: '9000000000000001' }, { id: '9000000000000002' }, { id: '9000000000000003' }],
        3,
      ]);
      redisGet.mockResolvedValueOnce('3');

      const result = await service.markRead(RECIPIENT_ID);

      expect(result).toEqual({ updated: 3 });
      expect(redisSet).toHaveBeenCalledWith(`notif:unread:${RECIPIENT_ID}`, '0');
    });

    it('does not go below 0 on Redis badge', async () => {
      const { service, queryFn, redisGet, redisSet } = buildService();
      queryFn.mockResolvedValueOnce([[{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }], 4]);
      redisGet.mockResolvedValueOnce('2'); // Redis says 2 but DB returned 4 (drift scenario)

      await service.markRead(RECIPIENT_ID);

      // Math.max(0, 2 - 4) = 0
      expect(redisSet).toHaveBeenCalledWith(`notif:unread:${RECIPIENT_ID}`, '0');
    });

    it('returns updated: 0 and does not touch Redis when nothing is read', async () => {
      const { service, queryFn, redisGet, redisSet } = buildService();
      queryFn.mockResolvedValueOnce([[], 0]); // no rows updated — tuple with empty array

      await service.markRead(RECIPIENT_ID);

      expect(redisGet).not.toHaveBeenCalled();
      expect(redisSet).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid (non-numeric) notification id', async () => {
      const { service } = buildService();

      await expect(service.markRead(RECIPIENT_ID, ['not-a-number'])).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('aggregation grouping', () => {
    it('groups multiple like rows by same post_id into one item with up to 3 actors', async () => {
      const { service, postRepo } = buildService();
      postRepo.find.mockResolvedValue([]); // no posts needed for this test

      const actor1 = makeUser('actor-1-uuid-aaaa-aaaa-aaaaaaaaaaaa');
      const actor2 = makeUser('actor-2-uuid-bbbb-bbbb-bbbbbbbbbbbb');
      const actor3 = makeUser('actor-3-uuid-cccc-cccc-cccccccccccc');
      const actor4 = makeUser('actor-4-uuid-dddd-dddd-dddddddddddd');

      const now = new Date('2026-01-01T12:00:00Z');

      const rows: Notification[] = [
        makeNotification({
          id: '9004',
          type: 'like',
          postId: POST_ID,
          actorId: actor4.id,
          actor: actor4,
          createdAt: new Date(now.getTime() - 100),
        }),
        makeNotification({
          id: '9003',
          type: 'like',
          postId: POST_ID,
          actorId: actor3.id,
          actor: actor3,
          createdAt: new Date(now.getTime() - 200),
        }),
        makeNotification({
          id: '9002',
          type: 'like',
          postId: POST_ID,
          actorId: actor2.id,
          actor: actor2,
          createdAt: new Date(now.getTime() - 300),
        }),
        makeNotification({
          id: '9001',
          type: 'like',
          postId: POST_ID,
          actorId: actor1.id,
          actor: actor1,
          createdAt: new Date(now.getTime() - 400),
        }),
      ];

      // Access the private method via type cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aggregated = await (service as any).aggregateRows(rows, RECIPIENT_ID);

      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].type).toBe('like');
      expect(aggregated[0].actors).toHaveLength(3);
      expect(aggregated[0].otherCount).toBe(1); // 4 total - 3 shown = 1
      expect(aggregated[0].id).toBe('9004'); // most recent
    });

    it('does NOT group like rows beyond AGGREGATION_WINDOW_MS (25h apart)', async () => {
      const { service, postRepo } = buildService();
      postRepo.find.mockResolvedValue([]);

      const actor1 = makeUser('actor-1-uuid-aaaa-aaaa-aaaaaaaaaaaa');
      const actor2 = makeUser('actor-2-uuid-bbbb-bbbb-bbbbbbbbbbbb');

      const recentTime = new Date('2026-01-02T12:00:00Z');
      const oldTime = new Date('2026-01-01T11:00:00Z'); // 25h before recentTime

      const rows: Notification[] = [
        makeNotification({
          id: '9002',
          type: 'like',
          postId: POST_ID,
          actorId: actor1.id,
          actor: actor1,
          createdAt: recentTime,
        }),
        makeNotification({
          id: '9001',
          type: 'like',
          postId: POST_ID,
          actorId: actor2.id,
          actor: actor2,
          createdAt: oldTime,
        }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aggregated = await (service as any).aggregateRows(rows, RECIPIENT_ID);

      // Old row (9001) is > 24h before the anchor (9002), so it's outside the window
      // It should appear as a separate item
      expect(aggregated.length).toBeGreaterThanOrEqual(1);
      // The recent row (9002) should be its own group
      const recentItem = aggregated.find((a: { id: string }) => a.id === '9002');
      expect(recentItem).toBeDefined();
      expect(recentItem.actors).toHaveLength(1);
    });

    it('does not group follow notifications (non-aggregatable type)', async () => {
      const { service, postRepo } = buildService();
      postRepo.find.mockResolvedValue([]);

      const actor1 = makeUser('actor-1-uuid-aaaa-aaaa-aaaaaaaaaaaa');
      const actor2 = makeUser('actor-2-uuid-bbbb-bbbb-bbbbbbbbbbbb');

      const rows: Notification[] = [
        makeNotification({
          id: '9002',
          type: 'follow',
          postId: null,
          actorId: actor1.id,
          actor: actor1,
          createdAt: new Date('2026-01-01T12:01:00Z'),
        }),
        makeNotification({
          id: '9001',
          type: 'follow',
          postId: null,
          actorId: actor2.id,
          actor: actor2,
          createdAt: new Date('2026-01-01T12:00:00Z'),
        }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aggregated = await (service as any).aggregateRows(rows, RECIPIENT_ID);

      // Each follow is its own item
      expect(aggregated).toHaveLength(2);
      expect(aggregated[0].actors).toHaveLength(1);
      expect(aggregated[1].actors).toHaveLength(1);
      expect(aggregated[0].otherCount).toBe(0);
    });

    it('sets readAt to null when any row in group is unread', async () => {
      const { service, postRepo } = buildService();
      postRepo.find.mockResolvedValue([]);

      const actor1 = makeUser('actor-1-uuid-aaaa-aaaa-aaaaaaaaaaaa');
      const actor2 = makeUser('actor-2-uuid-bbbb-bbbb-bbbbbbbbbbbb');

      const readDate = new Date('2026-01-01T10:00:00Z');
      const rows: Notification[] = [
        makeNotification({
          id: '9002',
          type: 'like',
          postId: POST_ID,
          actorId: actor1.id,
          actor: actor1,
          readAt: readDate,
          createdAt: new Date('2026-01-01T12:01:00Z'),
        }),
        makeNotification({
          id: '9001',
          type: 'like',
          postId: POST_ID,
          actorId: actor2.id,
          actor: actor2,
          readAt: null, // unread!
          createdAt: new Date('2026-01-01T12:00:00Z'),
        }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aggregated = await (service as any).aggregateRows(rows, RECIPIENT_ID);

      expect(aggregated[0].readAt).toBeNull();
    });

    it('sets readAt to latest when ALL rows in group are read', async () => {
      const { service, postRepo } = buildService();
      postRepo.find.mockResolvedValue([]);

      const actor1 = makeUser('actor-1-uuid-aaaa-aaaa-aaaaaaaaaaaa');
      const actor2 = makeUser('actor-2-uuid-bbbb-bbbb-bbbbbbbbbbbb');

      const readDate1 = new Date('2026-01-01T10:00:00Z');
      const readDate2 = new Date('2026-01-01T11:00:00Z');

      const rows: Notification[] = [
        makeNotification({
          id: '9002',
          type: 'like',
          postId: POST_ID,
          actorId: actor1.id,
          actor: actor1,
          readAt: readDate2,
          createdAt: new Date('2026-01-01T12:01:00Z'),
        }),
        makeNotification({
          id: '9001',
          type: 'like',
          postId: POST_ID,
          actorId: actor2.id,
          actor: actor2,
          readAt: readDate1,
          createdAt: new Date('2026-01-01T12:00:00Z'),
        }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aggregated = await (service as any).aggregateRows(rows, RECIPIENT_ID);

      expect(aggregated[0].readAt).toBe(readDate2.toISOString()); // latest
    });
  });
});
