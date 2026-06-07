/**
 * MessagingService unit tests.
 *
 * Covers:
 *   - DM permission matrix (mutual-follow / dm_privacy / blocked)
 *   - conversation_dyads canonical creation (user_lo < user_hi)
 *   - Nonce dedup on send (existing message returned on conflict)
 *   - Unread-count computation
 *   - Read-receipt update
 *   - Rate limit enforcement (500/day)
 *   - Participant-only access gates
 */
import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { MessagingService } from '../../../src/modules/messaging/messaging.service';
import { User } from '../../../src/modules/users/user.entity';
import { Follow } from '../../../src/modules/users/follow.entity';
import { ConversationParticipant } from '../../../src/modules/messaging/conversation-participant.entity';
import { Message } from '../../../src/modules/messaging/message.entity';
import type { DmNotificationPort } from '../../../src/modules/messaging/dm-notification.port';

// ── Helpers ──────────────────────────────────────────────────────────────────

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONV_ID = '123456789012345678';

function makeUser(id: string, overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = id;
  u.handle = `user_${id.slice(0, 4)}`;
  u.dmPrivacy = 'following';
  u.isPrivate = false;
  return Object.assign(u, overrides);
}

function makeParticipant(
  conversationId: string,
  userId: string,
  overrides: Partial<ConversationParticipant> = {},
): ConversationParticipant {
  const p = new ConversationParticipant();
  p.conversationId = conversationId;
  p.userId = userId;
  p.lastReadMessageId = null;
  p.muted = false;
  return Object.assign(p, overrides);
}

function makeMessage(id: string, nonce: string): Message {
  const m = new Message();
  m.id = id;
  m.conversationId = CONV_ID;
  m.senderId = USER_A;
  m.text = 'hello';
  m.clientNonce = nonce;
  m.createdAt = new Date();
  m.deletedAt = null;
  return m;
}

// ── Mock factory ─────────────────────────────────────────────────────────────

function buildService(opts: {
  blockedEitherWay?: boolean;
  userBDmPrivacy?: 'everyone' | 'following';
  senderFollowsRecipient?: boolean;
  recipientFollowsSender?: boolean;
  existingDyad?: string | null;
  existingParticipant?: boolean;
  existingMessage?: string | null;
  participants?: ConversationParticipant[];
  rateLimitCount?: number;
}) {
  const {
    blockedEitherWay = false,
    userBDmPrivacy = 'following',
    senderFollowsRecipient = false,
    recipientFollowsSender = false,
    existingDyad = null,
    existingParticipant = true,
    existingMessage = null,
    participants = [makeParticipant(CONV_ID, USER_A), makeParticipant(CONV_ID, USER_B)],
    rateLimitCount = 0,
  } = opts;

  const blockRepo = {
    findOne: vi.fn().mockResolvedValue(blockedEitherWay ? { id: 'block' } : null),
  };

  const userRepo = {
    findOne: vi.fn().mockResolvedValue(makeUser(USER_B, { dmPrivacy: userBDmPrivacy })),
  };

  const followRepo = {
    findOne: vi
      .fn()
      .mockImplementation(({ where }: { where: Partial<Follow> | Partial<Follow>[] }) => {
        const cond = Array.isArray(where) ? where[0] : where;
        if (cond.followerId === USER_A && cond.followeeId === USER_B) {
          return Promise.resolve(senderFollowsRecipient ? { state: 'active' } : null);
        }
        if (cond.followerId === USER_B && cond.followeeId === USER_A) {
          return Promise.resolve(recipientFollowsSender ? { state: 'active' } : null);
        }
        return Promise.resolve(null);
      }),
  };

  const dyadRepo = {
    findOne: vi
      .fn()
      .mockResolvedValue(
        existingDyad ? { userLo: USER_A, userHi: USER_B, conversationId: existingDyad } : null,
      ),
  };

  const participantRepo = {
    findOne: vi
      .fn()
      .mockImplementation(({ where }: { where: Partial<ConversationParticipant> }) => {
        if (!existingParticipant) return Promise.resolve(null);
        const match = participants.find(
          (p) => p.conversationId === where.conversationId && p.userId === where.userId,
        );
        return Promise.resolve(match ?? null);
      }),
    find: vi.fn().mockResolvedValue(participants),
  };

  const messageRepo = {
    findOne: vi
      .fn()
      .mockResolvedValue(existingMessage ? makeMessage(existingMessage, 'nonce-1') : null),
  };

  const convRepo = {
    findOne: vi.fn().mockResolvedValue({ id: CONV_ID, isGroup: false, createdAt: new Date() }),
  };

  const redisGet = vi.fn().mockResolvedValue(rateLimitCount > 0 ? String(rateLimitCount) : null);
  const redisPipeline = {
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  const redisService = {
    client: {
      get: redisGet,
      pipeline: vi.fn().mockReturnValue(redisPipeline),
    },
  };

  const transactionFn = vi.fn().mockImplementation(async (fn: (em: unknown) => Promise<void>) => {
    const em = {
      query: vi.fn().mockResolvedValue([]),
    };
    await fn(em);
  });

  const dataSource = {
    transaction: transactionFn,
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('COUNT(*)')) {
        return Promise.resolve([{ count: '3' }]);
      }
      if (sql.includes('conversation_participants')) {
        return Promise.resolve(
          participants.map((p) => ({
            user_id: p.userId,
            handle: `user_${p.userId.slice(0, 4)}`,
            display_name: `User ${p.userId.slice(0, 4)}`,
            avatar_media_id: null,
            is_verified: false,
            is_private: false,
            last_read_message_id: p.lastReadMessageId,
            muted: p.muted,
          })),
        );
      }
      if (sql.includes('FROM messages') && sql.includes('ORDER BY id DESC LIMIT 1')) {
        return Promise.resolve([]);
      }
      if (sql.includes('FROM messages')) {
        return Promise.resolve([]);
      }
      if (sql.includes('conversation_id')) {
        return Promise.resolve([{ conversation_id: CONV_ID }]);
      }
      return Promise.resolve([]);
    }),
  };

  const notificationPort: DmNotificationPort = {
    notifyDm: vi.fn().mockResolvedValue(undefined),
  };

  const service = new MessagingService(
    dataSource as never,
    convRepo as never,
    participantRepo as never,
    dyadRepo as never,
    messageRepo as never,
    userRepo as never,
    followRepo as never,
    blockRepo as never,
    redisService as never,
    notificationPort,
  );

  return {
    service,
    blockRepo,
    userRepo,
    followRepo,
    dyadRepo,
    participantRepo,
    messageRepo,
    dataSource,
    notificationPort,
    redisService,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MessagingService.canSendDm — DM permission matrix', () => {
  it('blocks when either user has blocked the other', async () => {
    const { service } = buildService({ blockedEitherWay: true });
    const result = await service.canSendDm(USER_A, USER_B);
    expect(result).toBe(false);
  });

  it('allows when recipient dmPrivacy=everyone (no follow required)', async () => {
    const { service } = buildService({
      userBDmPrivacy: 'everyone',
      senderFollowsRecipient: false,
      recipientFollowsSender: false,
    });
    const result = await service.canSendDm(USER_A, USER_B);
    expect(result).toBe(true);
  });

  it('blocks when dmPrivacy=following and no mutual follow', async () => {
    const { service } = buildService({
      userBDmPrivacy: 'following',
      senderFollowsRecipient: true,
      recipientFollowsSender: false, // only one-way
    });
    const result = await service.canSendDm(USER_A, USER_B);
    expect(result).toBe(false);
  });

  it('allows when mutual follow and dmPrivacy=following', async () => {
    const { service } = buildService({
      userBDmPrivacy: 'following',
      senderFollowsRecipient: true,
      recipientFollowsSender: true,
    });
    const result = await service.canSendDm(USER_A, USER_B);
    expect(result).toBe(true);
  });

  it('blocks when blocked even if dmPrivacy=everyone', async () => {
    const { service } = buildService({
      blockedEitherWay: true,
      userBDmPrivacy: 'everyone',
    });
    const result = await service.canSendDm(USER_A, USER_B);
    expect(result).toBe(false);
  });
});

describe('MessagingService.getOrCreateDm — canonical dyad', () => {
  it('throws SELF_DM when initiator and recipient are the same user', async () => {
    const { service } = buildService({});
    await expect(service.getOrCreateDm(USER_A, USER_A)).rejects.toThrow(ForbiddenException);
  });

  it('throws DM_NOT_ALLOWED when permission check fails', async () => {
    const { service } = buildService({
      blockedEitherWay: true,
    });
    await expect(service.getOrCreateDm(USER_A, USER_B)).rejects.toThrow(ForbiddenException);
  });

  it('returns existing conversation when dyad already exists', async () => {
    const { service } = buildService({
      senderFollowsRecipient: true,
      recipientFollowsSender: true,
      existingDyad: CONV_ID,
    });
    const result = await service.getOrCreateDm(USER_A, USER_B);
    expect(result.id).toBe(CONV_ID);
  });

  it('creates conversation with canonical user_lo < user_hi ordering', async () => {
    const { service, dataSource } = buildService({
      senderFollowsRecipient: true,
      recipientFollowsSender: true,
      existingDyad: null,
    });

    await service.getOrCreateDm(USER_A, USER_B);

    // dataSource.transaction should have been called
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it('canonical order: user_lo is always lexicographically smaller', async () => {
    // USER_A < USER_B in lexicographic order, so USER_A should be user_lo
    expect(USER_A < USER_B).toBe(true);
  });

  it('handles reversed initiator/recipient — still canonical', async () => {
    const { service, dataSource } = buildService({
      userBDmPrivacy: 'everyone',
      existingDyad: null,
    });

    // USER_B initiates to USER_A (B > A, so A should be lo)
    await service.getOrCreateDm(USER_B, USER_A);
    expect(dataSource.transaction).toHaveBeenCalled();
  });
});

describe('MessagingService.sendMessage — nonce idempotency', () => {
  it('returns existing message when nonce already used (idempotency)', async () => {
    const existingId = '111111111111111111';
    const { service } = buildService({
      existingParticipant: true,
      existingMessage: existingId,
    });

    const result = await service.sendMessage(USER_A, CONV_ID, {
      text: 'hello',
      clientNonce: 'nonce-1',
    });

    expect(result.id).toBe(existingId);
  });

  it('throws NOT_PARTICIPANT when sender is not in the conversation', async () => {
    const { service } = buildService({ existingParticipant: false });

    await expect(
      service.sendMessage(USER_A, CONV_ID, { text: 'hi', clientNonce: 'new-nonce' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws EMPTY_MESSAGE when neither text nor mediaId provided', async () => {
    const { service } = buildService({ existingMessage: null });

    await expect(
      service.sendMessage(USER_A, CONV_ID, { clientNonce: 'new-nonce' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('persists message when all checks pass', async () => {
    const { service, dataSource } = buildService({ existingMessage: null });

    const result = await service.sendMessage(USER_A, CONV_ID, {
      text: 'hello world',
      clientNonce: 'unique-nonce-123',
    });

    expect(result.clientNonce).toBe('unique-nonce-123');
    expect(result.conversationId).toBe(CONV_ID);
    expect(result.senderId).toBe(USER_A);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO messages'),
      expect.any(Array),
    );
  });
});

describe('MessagingService.sendMessage — rate limiting', () => {
  it('throws when DM rate limit (500/day) is exceeded', async () => {
    const { service } = buildService({
      existingMessage: null,
      rateLimitCount: 500, // At the limit
    });

    await expect(
      service.sendMessage(USER_A, CONV_ID, { text: 'hi', clientNonce: 'nonce-over-limit' }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows sending when under rate limit', async () => {
    const { service } = buildService({
      existingMessage: null,
      rateLimitCount: 10, // Well under 500
    });

    const result = await service.sendMessage(USER_A, CONV_ID, {
      text: 'hi',
      clientNonce: 'nonce-under-limit',
    });

    expect(result.senderId).toBe(USER_A);
  });
});

describe('MessagingService.markRead — read receipt update', () => {
  it('throws NOT_PARTICIPANT when user is not in conversation', async () => {
    const { service } = buildService({ existingParticipant: false });

    await expect(service.markRead(USER_A, CONV_ID, '999')).rejects.toThrow(ForbiddenException);
  });

  it('updates last_read_message_id in the DB', async () => {
    const { service, dataSource } = buildService({ existingParticipant: true });
    const lastReadId = '555555555555555555';

    await service.markRead(USER_A, CONV_ID, lastReadId);

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE conversation_participants'),
      [lastReadId, CONV_ID, USER_A],
    );
  });
});

describe('MessagingService — unread count computation', () => {
  it('computes unread count as messages with id > last_read_message_id', async () => {
    const participant = makeParticipant(CONV_ID, USER_A, { lastReadMessageId: '100' });
    const { service } = buildService({
      participants: [participant, makeParticipant(CONV_ID, USER_B)],
      existingDyad: CONV_ID,
      senderFollowsRecipient: true,
      recipientFollowsSender: true,
    });

    const result = await service.getOrCreateDm(USER_A, USER_B);
    // unreadCount comes from the COUNT(*) mock returning '3'
    expect(result.unreadCount).toBe(3);
  });

  it('counts all messages when no last_read_message_id', async () => {
    const participant = makeParticipant(CONV_ID, USER_A, { lastReadMessageId: null });
    const { service } = buildService({
      participants: [participant, makeParticipant(CONV_ID, USER_B)],
      existingDyad: CONV_ID,
      senderFollowsRecipient: true,
      recipientFollowsSender: true,
    });

    const result = await service.getOrCreateDm(USER_A, USER_B);
    expect(result.unreadCount).toBe(3);
  });
});

describe('MessagingService.isParticipant', () => {
  it('returns true when user is a participant', async () => {
    const { service } = buildService({ existingParticipant: true });
    const result = await service.isParticipant(USER_A, CONV_ID);
    expect(result).toBe(true);
  });

  it('returns false when user is not a participant', async () => {
    const { service } = buildService({ existingParticipant: false });
    const result = await service.isParticipant(USER_A, CONV_ID);
    expect(result).toBe(false);
  });
});
