import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';
import { CursorUtil } from '../../common/utils/cursor.util';
import { RedisService } from '../../infra/redis/redis.service';
import { User } from '../users/user.entity';
import { Follow } from '../users/follow.entity';
import { Block } from '../users/block.entity';
import { Conversation } from './conversation.entity';
import { ConversationParticipant } from './conversation-participant.entity';
import { ConversationDyad } from './conversation-dyad.entity';
import { Message } from './message.entity';
import { MessageDto } from './dto/message.dto';
import { ConversationDto, ParticipantDto } from './dto/conversation.dto';
import { DM_NOTIFICATION_PORT, DmNotificationPort } from './dm-notification.port';

/** Rate-limit key for DM sends */
const DM_RATE_KEY = (userId: string) => `dm:rate:${userId}`;
/** Max DMs per day per user */
const DM_RATE_MAX = 500;
/** Rate window: 24 hours in seconds */
const DM_RATE_WINDOW_SECS = 86400;

/** Room name for a conversation — checked against connected sockets */
const CONV_ROOM = (id: string) => `conversation:${id}`;

/**
 * MessagingService — DM business logic.
 *
 * DM permission rule:
 *   - Allowed if mutual-follow OR recipient dmPrivacy='everyone'
 *   - AND neither blocks the other
 *
 * Nonce idempotency: unique constraint on messages.client_nonce.
 * On conflict, return the existing message (409 with existing payload).
 *
 * Rate limiting: 500 DMs/day per user (Redis token bucket).
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private ioServer?: { adapter?: () => { rooms?: Map<string, Set<string>> } };

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(ConversationDyad)
    private readonly dyadRepo: Repository<ConversationDyad>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Follow)
    private readonly followRepo: Repository<Follow>,
    @InjectRepository(Block)
    private readonly blockRepo: Repository<Block>,
    private readonly redisService: RedisService,
    @Inject(DM_NOTIFICATION_PORT)
    private readonly dmNotificationPort: DmNotificationPort,
  ) {}

  // ── Helper: set the Socket.IO server for room membership checks ──────────

  /**
   * Called by RealtimeGateway.afterInit() so MessagingService can check
   * whether a recipient has the conversation room open (for skip-notif logic).
   * Optional — if not set, notification is always sent.
   */
  setIoServer(io: unknown): void {
    this.ioServer = io as typeof this.ioServer;
  }

  // ── Permission check ──────────────────────────────────────────────────────

  /**
   * Check if sender is allowed to DM recipient.
   * Allowed if:
   *   (mutual-follow OR recipient.dmPrivacy='everyone') AND !blocked_either_way
   */
  async canSendDm(senderId: string, recipientId: string): Promise<boolean> {
    // Blocked check (either direction)
    const blocked = await this.blockRepo.findOne({
      where: [
        { blockerId: senderId, blockedId: recipientId },
        { blockerId: recipientId, blockedId: senderId },
      ],
    });
    if (blocked) return false;

    // Load recipient for dmPrivacy
    const recipient = await this.userRepo.findOne({ where: { id: recipientId } });
    if (!recipient) return false;

    if (recipient.dmPrivacy === 'everyone') return true;

    // Mutual follow: sender follows recipient AND recipient follows sender
    const senderFollowsRecipient = await this.followRepo.findOne({
      where: { followerId: senderId, followeeId: recipientId, state: 'active' },
    });
    const recipientFollowsSender = await this.followRepo.findOne({
      where: { followerId: recipientId, followeeId: senderId, state: 'active' },
    });

    return !!(senderFollowsRecipient && recipientFollowsSender);
  }

  // ── Conversation management ───────────────────────────────────────────────

  /**
   * Get or create a canonical 1:1 conversation via conversation_dyads.
   * Idempotent: returns existing conversation if one already exists for this pair.
   */
  async getOrCreateDm(initiatorId: string, recipientId: string): Promise<ConversationDto> {
    if (initiatorId === recipientId) {
      throw new ForbiddenException({
        error: { code: 'SELF_DM', message: 'Cannot DM yourself.' },
      });
    }

    // Permission check
    const allowed = await this.canSendDm(initiatorId, recipientId);
    if (!allowed) {
      throw new ForbiddenException({
        error: {
          code: 'DM_NOT_ALLOWED',
          message:
            'You cannot DM this user. Requires mutual follow or their DM privacy must be set to everyone.',
        },
      });
    }

    // Canonical ordering: user_lo < user_hi (UUID lexicographic)
    const [userLo, userHi] =
      initiatorId < recipientId ? [initiatorId, recipientId] : [recipientId, initiatorId];

    // Try to find existing dyad
    const existingDyad = await this.dyadRepo.findOne({
      where: { userLo, userHi },
    });

    if (existingDyad) {
      return this.getConversationDto(existingDyad.conversationId, initiatorId);
    }

    // Create new conversation + participants + dyad in a transaction
    const conversationId = SnowflakeUtil.instance.generate();

    await this.dataSource.transaction(async (em) => {
      // Create conversation
      await em.query<void>(
        `INSERT INTO conversations (id, is_group, created_at) VALUES ($1, false, NOW())`,
        [conversationId],
      );

      // Add both participants
      await em.query<void>(
        `INSERT INTO conversation_participants (conversation_id, user_id, muted, joined_at)
         VALUES ($1, $2, false, NOW()), ($1, $3, false, NOW())`,
        [conversationId, initiatorId, recipientId],
      );

      // Create dyad entry
      await em.query<void>(
        `INSERT INTO conversation_dyads (user_lo, user_hi, conversation_id)
         VALUES ($1, $2, $3)`,
        [userLo, userHi, conversationId],
      );
    });

    return this.getConversationDto(conversationId, initiatorId);
  }

  /**
   * List conversations for the current user, ordered by latest message.
   * Cursor-paginated by conversation ID descending.
   */
  async listConversations(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: ConversationDto[]; cursor: string | null; hasMore: boolean }> {
    const take = Math.min(limit, 100);
    let afterId: string | null = null;
    if (cursor) {
      const decoded = CursorUtil.decode(cursor);
      if (decoded.type === 'id') afterId = decoded.id;
    }

    const rows = await this.dataSource.query<Array<{ conversation_id: string }>>(
      `SELECT cp.conversation_id
       FROM conversation_participants cp
       WHERE cp.user_id = $1
         ${afterId ? `AND cp.conversation_id < $3` : ''}
       ORDER BY cp.conversation_id DESC
       LIMIT $2`,
      afterId ? [userId, take + 1, afterId] : [userId, take + 1],
    );

    const hasMore = rows.length > take;
    const page = rows.slice(0, take);

    const items = await Promise.all(
      page.map((r) => this.getConversationDto(r.conversation_id, userId)),
    );

    const nextCursor =
      hasMore && page.length > 0
        ? CursorUtil.encodeId(page[page.length - 1].conversation_id)
        : null;

    return { items, cursor: nextCursor, hasMore };
  }

  /**
   * Get messages in a conversation (participant-only access).
   * Cursor-paginated by message ID descending (newest first).
   */
  async getMessages(
    userId: string,
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: MessageDto[]; cursor: string | null; hasMore: boolean }> {
    // Verify participation
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    if (!participant) {
      throw new ForbiddenException({
        error: {
          code: 'NOT_PARTICIPANT',
          message: 'You are not a participant in this conversation.',
        },
      });
    }

    const take = Math.min(limit, 100);
    let beforeId: string | null = null;
    if (cursor) {
      const decoded = CursorUtil.decode(cursor);
      if (decoded.type === 'id') beforeId = decoded.id;
    }

    const rows = await this.dataSource.query<Message[]>(
      `SELECT id, conversation_id, sender_id, text, media_id, client_nonce, created_at
       FROM messages
       WHERE conversation_id = $1
         AND deleted_at IS NULL
         ${beforeId ? `AND id < $3` : ''}
       ORDER BY id DESC
       LIMIT $2`,
      beforeId ? [conversationId, take + 1, beforeId] : [conversationId, take + 1],
    );

    const hasMore = rows.length > take;
    const page = rows.slice(0, take);

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(String(page[page.length - 1].id)) : null;

    return {
      items: page.map((m) => this.toMessageDto(m)),
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Send a DM message (REST endpoint and WS handler use this).
   * Nonce idempotency: if a message with the same client_nonce exists, return it.
   * Rate limited: 500 DMs per day per user.
   */
  async sendMessage(
    senderId: string,
    conversationId: string,
    body: { text?: string; mediaId?: string; clientNonce: string },
  ): Promise<MessageDto> {
    // Verify sender is a participant
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId: senderId },
    });
    if (!participant) {
      throw new ForbiddenException({
        error: {
          code: 'NOT_PARTICIPANT',
          message: 'You are not a participant in this conversation.',
        },
      });
    }

    // Nonce idempotency check — return existing message if nonce already used
    const existing = await this.messageRepo.findOne({
      where: { clientNonce: body.clientNonce },
    });
    if (existing) {
      return this.toMessageDto(existing);
    }

    // Validate content (text or mediaId required)
    if (!body.text && !body.mediaId) {
      throw new ForbiddenException({
        error: { code: 'EMPTY_MESSAGE', message: 'Message must have text or media.' },
      });
    }

    // Rate limit check
    await this.checkDmRateLimit(senderId);

    // Persist the message
    const messageId = SnowflakeUtil.instance.generate();

    try {
      await this.dataSource.query<void>(
        `INSERT INTO messages (id, conversation_id, sender_id, text, media_id, client_nonce, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          messageId,
          conversationId,
          senderId,
          body.text ?? null,
          body.mediaId ?? null,
          body.clientNonce,
        ],
      );
    } catch (err: unknown) {
      // Handle unique constraint violation on client_nonce (race condition)
      const pgErr = err as { code?: string };
      if (pgErr?.code === '23505') {
        const race = await this.messageRepo.findOne({ where: { clientNonce: body.clientNonce } });
        if (race) return this.toMessageDto(race);
      }
      throw err;
    }

    // Increment rate limit counter
    await this.incrementDmRateLimit(senderId);

    // Build DTO
    const messageDto: MessageDto = {
      id: messageId,
      conversationId,
      senderId,
      text: body.text ?? null,
      media: null,
      clientNonce: body.clientNonce,
      createdAt: new Date().toISOString(),
    };

    // Load all participants to notify
    const participants = await this.participantRepo.find({ where: { conversationId } });
    const recipientIds = participants.map((p) => p.userId).filter((id) => id !== senderId);

    // Import RealtimePublisherService lazily to avoid circular dep — we call it via the port
    // The publish is done by the caller (MessagingController) via a direct import after save

    // Notify each recipient that is NOT in the conversation room
    for (const recipientId of recipientIds) {
      const inRoom = this.isUserInConversationRoom(recipientId, conversationId);
      if (!inRoom) {
        await this.dmNotificationPort.notifyDm(senderId, recipientId, conversationId, messageId);
      }
    }

    return messageDto;
  }

  /**
   * Mark messages as read for a participant.
   * Updates last_read_message_id and publishes dm.read event.
   */
  async markRead(userId: string, conversationId: string, lastReadMessageId: string): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    if (!participant) {
      throw new ForbiddenException({
        error: { code: 'NOT_PARTICIPANT', message: 'Not a participant.' },
      });
    }

    await this.dataSource.query<void>(
      `UPDATE conversation_participants
       SET last_read_message_id = $1
       WHERE conversation_id = $2 AND user_id = $3`,
      [lastReadMessageId, conversationId, userId],
    );
  }

  /**
   * Mute a conversation for the current user.
   */
  async muteConversation(userId: string, conversationId: string): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    if (!participant) {
      throw new ForbiddenException({
        error: { code: 'NOT_PARTICIPANT', message: 'Not a participant.' },
      });
    }
    await this.dataSource.query<void>(
      `UPDATE conversation_participants SET muted = true WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
  }

  /**
   * Unmute a conversation for the current user.
   */
  async unmuteConversation(userId: string, conversationId: string): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    if (!participant) {
      throw new ForbiddenException({
        error: { code: 'NOT_PARTICIPANT', message: 'Not a participant.' },
      });
    }
    await this.dataSource.query<void>(
      `UPDATE conversation_participants SET muted = false WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
  }

  /**
   * Check if a user is a participant in a conversation.
   * Used by the gateway for typing indicator validation.
   */
  async isParticipant(userId: string, conversationId: string): Promise<boolean> {
    const participant = await this.participantRepo.findOne({
      where: { conversationId, userId },
    });
    return !!participant;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Build ConversationDto for a conversation from the perspective of viewerId.
   * Includes unread count computed from messages.id > last_read_message_id.
   */
  private async getConversationDto(
    conversationId: string,
    viewerId: string,
  ): Promise<ConversationDto> {
    // Load conversation
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException({
        error: { code: 'CONV_NOT_FOUND', message: 'Conversation not found.' },
      });
    }

    // Load participants with user data
    const participants = await this.dataSource.query<
      Array<{
        user_id: string;
        handle: string;
        display_name: string;
        avatar_media_id: string | null;
        is_verified: boolean;
        is_private: boolean;
        last_read_message_id: string | null;
        muted: boolean;
      }>
    >(
      `SELECT cp.user_id, u.handle, u.display_name, u.avatar_media_id,
              u.is_verified, u.is_private, cp.last_read_message_id, cp.muted
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.conversation_id = $1`,
      [conversationId],
    );

    const viewerParticipant = participants.find((p) => p.user_id === viewerId);
    const muted = viewerParticipant?.muted ?? false;

    // Compute unread count for viewer
    let unreadCount = 0;
    const lastReadId = viewerParticipant?.last_read_message_id ?? null;
    if (lastReadId) {
      const countResult = await this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM messages WHERE conversation_id = $1 AND id > $2 AND deleted_at IS NULL`,
        [conversationId, lastReadId],
      );
      unreadCount = parseInt(countResult[0]?.count ?? '0', 10);
    } else {
      // No last read — count all messages
      const countResult = await this.dataSource.query<Array<{ count: string }>>(
        `SELECT COUNT(*) AS count FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL`,
        [conversationId],
      );
      unreadCount = parseInt(countResult[0]?.count ?? '0', 10);
    }

    // Load last message
    const lastMsgRows = await this.dataSource.query<Message[]>(
      `SELECT id, conversation_id, sender_id, text, media_id, client_nonce, created_at
       FROM messages
       WHERE conversation_id = $1 AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [conversationId],
    );
    const lastMessage = lastMsgRows.length > 0 ? this.toMessageDto(lastMsgRows[0]) : null;

    const participantDtos: ParticipantDto[] = participants.map((p) => ({
      id: p.user_id,
      handle: p.handle,
      displayName: p.display_name,
      avatarUrl: p.avatar_media_id
        ? `media:${p.avatar_media_id}` // Resolved by media module; placeholder here
        : null,
      isVerified: p.is_verified,
      isPrivate: p.is_private,
    }));

    return {
      id: conv.id,
      participants: participantDtos,
      lastMessage,
      unreadCount,
      muted,
      createdAt: conv.createdAt.toISOString(),
    };
  }

  private toMessageDto(m: Message | Record<string, unknown>): MessageDto {
    const row = m as Record<string, unknown>;
    return {
      id: String(row['id']),
      conversationId: String(row['conversation_id'] ?? row['conversationId']),
      senderId: String(row['sender_id'] ?? row['senderId']),
      text: (row['text'] as string | null) ?? null,
      media: null,
      clientNonce: String(row['client_nonce'] ?? row['clientNonce']),
      createdAt: row['created_at']
        ? new Date(row['created_at'] as string).toISOString()
        : row['createdAt']
          ? (row['createdAt'] as Date).toISOString()
          : new Date().toISOString(),
    };
  }

  /**
   * Check DM rate limit via Redis sliding counter.
   * Throws 429 if limit exceeded.
   */
  private async checkDmRateLimit(userId: string): Promise<void> {
    const key = DM_RATE_KEY(userId);
    const current = await this.redisService.client.get(key);
    if (current && parseInt(current, 10) >= DM_RATE_MAX) {
      throw new ConflictException({
        error: {
          code: 'DM_RATE_LIMIT_EXCEEDED',
          message: `DM rate limit exceeded. Maximum ${DM_RATE_MAX} DMs per day.`,
        },
      });
    }
  }

  private async incrementDmRateLimit(userId: string): Promise<void> {
    const key = DM_RATE_KEY(userId);
    const pipeline = this.redisService.client.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, DM_RATE_WINDOW_SECS);
    await pipeline.exec();
  }

  /**
   * Check if a user is currently in a conversation room.
   * Uses Socket.IO adapter rooms if available; defaults to false if not.
   */
  private isUserInConversationRoom(userId: string, conversationId: string): boolean {
    if (!this.ioServer) return false;
    try {
      const adapter = this.ioServer.adapter?.();
      const rooms = adapter?.rooms;
      if (!rooms) return false;
      const convRoom = rooms.get(CONV_ROOM(conversationId));
      if (!convRoom) return false;
      // Check user:{userId} room intersection — socket in both rooms means user is there
      const userRoom = rooms.get(`user:${userId}`);
      if (!userRoom) return false;
      for (const socketId of convRoom) {
        if (userRoom.has(socketId)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
