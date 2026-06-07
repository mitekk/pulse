import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../../infra/redis/redis.service';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../users/user.entity';
import { Post } from '../posts/post.entity';
import { NotificationDto } from './dto/notification.dto';
import { UserCardDto } from '../users/dto/user-card.dto';
import { PostDto, PostAuthorDto } from '../posts/dto/post.dto';
import { CursorUtil } from '../../common/utils/cursor.util';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';

/** Redis key for unread notification badge */
export const NOTIF_UNREAD_KEY = (userId: string) => `notif:unread:${userId}`;

/** Dedup window: suppress duplicate (recipient, type, post, actor) within this many ms */
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Aggregation window: group notifications of same (type, post_id) within this many ms */
const AGGREGATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Types that aggregate by (type, post_id) */
const AGGREGATABLE_TYPES: Set<NotificationType> = new Set([
  'like',
  'repost',
  'quote',
  'reply',
  'mention',
]);

/**
 * NotificationsService — creates, delivers, and aggregates notifications.
 *
 * Creation rules:
 *   - Suppress self-notifications (actor === recipient)
 *   - Suppress if recipient has muted or blocked actor
 *   - Deduplicate: if same (recipient, type, post_id, actor) row exists within
 *     DEDUP_WINDOW_MS, skip insert (avoids spam from re-like/unlike cycles)
 *
 * Delivery flow:
 *   create() → write row → enqueue notify.deliver job
 *   notify.deliver worker → publishNotification WS + incr Redis unread badge
 *
 * Aggregation at read time:
 *   GET /api/v1/notifications groups rows by (type, post_id) within
 *   AGGREGATION_WINDOW_MS, returning up to 3 actors + otherCount.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    @InjectQueue('notify')
    private readonly notifyQueue: Queue,
  ) {}

  // ── Public creation API ────────────────────────────────────────────────────

  /**
   * Create a 'like' notification.
   * Called by EngagementService when a user likes a post.
   */
  async notifyLike(actorId: string, recipientId: string, postId: string): Promise<void> {
    await this.createNotification({
      type: 'like',
      actorId,
      recipientId,
      postId,
    });
  }

  /**
   * Create a 'reply' notification.
   * Called by PostsService when a reply is created.
   */
  async notifyReply(actorId: string, recipientId: string, postId: string): Promise<void> {
    await this.createNotification({
      type: 'reply',
      actorId,
      recipientId,
      postId,
    });
  }

  /**
   * Create a 'repost' notification.
   * Called by PostsService when a post is reposted.
   */
  async notifyRepost(actorId: string, recipientId: string, postId: string): Promise<void> {
    await this.createNotification({
      type: 'repost',
      actorId,
      recipientId,
      postId,
    });
  }

  /**
   * Create a 'quote' notification.
   * Called by PostsService when a post is quoted.
   */
  async notifyQuote(actorId: string, recipientId: string, postId: string): Promise<void> {
    await this.createNotification({
      type: 'quote',
      actorId,
      recipientId,
      postId,
    });
  }

  /**
   * Create a 'mention' notification.
   * Called by PostsService for each mentioned user.
   */
  async notifyMention(actorId: string, recipientId: string, postId: string): Promise<void> {
    await this.createNotification({
      type: 'mention',
      actorId,
      recipientId,
      postId,
    });
  }

  /**
   * Create a 'follow' notification.
   * Called by UsersService when a follow goes active.
   */
  async notifyFollow(actorId: string, recipientId: string): Promise<void> {
    await this.createNotification({
      type: 'follow',
      actorId,
      recipientId,
      postId: null,
    });
  }

  /**
   * Create a 'follow_request' notification.
   * Called by UsersService when a follow request is sent to a private account.
   */
  async notifyFollowRequest(actorId: string, recipientId: string): Promise<void> {
    await this.createNotification({
      type: 'follow_request',
      actorId,
      recipientId,
      postId: null,
    });
  }

  /**
   * Create a 'follow' notification for follow request acceptance.
   * Called by UsersService when a follow request is accepted (notifies the requester).
   * recipientId = the original requester (actor of the follow request).
   * actorId = the user who accepted (the followee).
   */
  async notifyFollowAccepted(actorId: string, recipientId: string): Promise<void> {
    await this.createNotification({
      type: 'follow',
      actorId,
      recipientId,
      postId: null,
    });
  }

  /**
   * Create a 'dm' notification.
   * Called by the DM notification adapter when a message is received and the
   * recipient is not currently in the conversation room.
   */
  async notifyDm(
    actorId: string,
    recipientId: string,
    _conversationId: string,
    _messageId: string,
  ): Promise<void> {
    await this.createNotification({
      type: 'dm',
      actorId,
      recipientId,
      postId: null,
    });
  }

  // ── Read API ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/notifications — cursor-paginated, aggregated notification list.
   *
   * Raw rows are fetched and grouped into aggregated NotificationDto items:
   *   - Aggregatable types (like, repost, quote, reply, mention) are grouped by
   *     (type, post_id) within AGGREGATION_WINDOW_MS.
   *   - Non-aggregatable types (follow, follow_request, dm) are returned as
   *     individual items.
   *
   * Cursor: by notification id DESC.
   */
  async getNotifications(
    userId: string,
    limit = 20,
    cursor?: string,
  ): Promise<{ items: NotificationDto[]; cursor: string | null; hasMore: boolean }> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const afterId = cursor ? CursorUtil.decode(cursor) : null;
    const afterIdStr = afterId && afterId.type === 'id' ? afterId.id : null;

    // Fetch raw rows (fetch more than needed to handle aggregation grouping)
    const fetchLimit = safeLimit * 5; // over-fetch to allow for grouping
    const qb = this.notifRepo
      .createQueryBuilder('n')
      .innerJoinAndSelect('n.actor', 'actor')
      .leftJoinAndSelect('n.recipient', 'recipient')
      .where('n.recipient_id = :userId', { userId });

    if (afterIdStr) {
      qb.andWhere('n.id < :afterId', { afterId: afterIdStr });
    }

    qb.orderBy('n.id', 'DESC').take(fetchLimit + 1);

    const rows = await qb.getMany();

    // Aggregate rows into NotificationDto groups
    const aggregated = await this.aggregateRows(rows, userId);

    const hasMore = aggregated.length > safeLimit;
    const page = aggregated.slice(0, safeLimit);

    const nextCursor =
      hasMore && page.length > 0 ? CursorUtil.encodeId(page[page.length - 1].id) : null;

    return { items: page, cursor: nextCursor, hasMore };
  }

  /**
   * GET /api/v1/notifications/unread-count
   *
   * Returns the unread badge count. Authoritative source is the Redis counter,
   * which is reconciled with the DB count if the Redis key is missing.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const key = NOTIF_UNREAD_KEY(userId);
    const cached = await this.redisService.client.get(key);

    if (cached !== null) {
      return parseInt(cached, 10);
    }

    // Redis key missing — reconcile from DB via raw query (TypeORM FindOptions doesn't support IS NULL)
    const result = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL`,
      [userId],
    );
    const dbCountActual = parseInt(result[0]?.count ?? '0', 10);

    // Re-seed Redis with the reconciled count (no TTL — invalidated on write)
    if (dbCountActual > 0) {
      await this.redisService.client.set(key, String(dbCountActual));
    }

    return dbCountActual;
  }

  /**
   * POST /api/v1/notifications/read
   *
   * Mark notifications as read.
   *   - If ids provided: mark specific notification IDs (must belong to userId).
   *   - If ids omitted or empty: mark ALL unread notifications for userId.
   *
   * Returns the number of rows updated.
   * Adjusts the Redis unread badge accordingly.
   */
  async markRead(userId: string, ids?: string[]): Promise<{ updated: number }> {
    const now = new Date();

    let updated: number;

    if (ids && ids.length > 0) {
      // Validate IDs are valid bigint strings
      for (const id of ids) {
        if (!/^\d+$/.test(id)) {
          throw new BadRequestException({
            error: { code: 'INVALID_ID', message: `Invalid notification id: ${id}` },
          });
        }
      }

      // TypeORM DataSource.query() with RETURNING returns [rows, rowCount] tuple.
      // rows is result[0], rowCount is result[1].
      const [rows] = await this.dataSource.query<[{ id: string }[], number]>(
        `UPDATE notifications
           SET read_at = $1
         WHERE recipient_id = $2
           AND id = ANY($3::bigint[])
           AND read_at IS NULL
         RETURNING id`,
        [now, userId, ids],
      );
      updated = Array.isArray(rows) ? rows.length : 0;
    } else {
      // Mark all unread
      // TypeORM DataSource.query() with RETURNING returns [rows, rowCount] tuple.
      const [rows] = await this.dataSource.query<[{ id: string }[], number]>(
        `UPDATE notifications
           SET read_at = $1
         WHERE recipient_id = $2
           AND read_at IS NULL
         RETURNING id`,
        [now, userId],
      );
      updated = Array.isArray(rows) ? rows.length : 0;
    }

    if (updated > 0) {
      // Decrement Redis unread badge by the number of rows updated
      // If the key doesn't exist, set it to 0 (reconcile on next read)
      const key = NOTIF_UNREAD_KEY(userId);
      const current = await this.redisService.client.get(key);
      if (current !== null) {
        const newCount = Math.max(0, parseInt(current, 10) - updated);
        await this.redisService.client.set(key, String(newCount));
      }
    }

    return { updated };
  }

  // ── Internal creation ──────────────────────────────────────────────────────

  /**
   * Core notification creation logic.
   *
   * Checks:
   *   1. Self-notify suppression (actor === recipient)
   *   2. Block suppression (recipient blocked actor)
   *   3. Mute suppression (recipient muted actor) — for non-follow types
   *   4. Duplicate dedup within DEDUP_WINDOW_MS
   *
   * On pass:
   *   - Write notification row
   *   - Increment Redis unread badge
   *   - Enqueue notify.deliver job
   */
  async createNotification(params: {
    type: NotificationType;
    actorId: string;
    recipientId: string;
    postId: string | null;
  }): Promise<Notification | null> {
    const { type, actorId, recipientId, postId } = params;

    // 1. Suppress self-notifications
    if (actorId === recipientId) {
      this.logger.debug(`[notif] suppressed self-notification type=${type} actor=${actorId}`);
      return null;
    }

    // 2. Check blocks (recipient blocked actor OR actor blocked recipient)
    const blockExists = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS(
         SELECT 1 FROM blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)
       ) AS exists`,
      [recipientId, actorId],
    );
    if (blockExists[0]?.exists) {
      this.logger.debug(
        `[notif] suppressed blocked notification type=${type} actor=${actorId} recipient=${recipientId}`,
      );
      return null;
    }

    // 3. Mute suppression for non-follow/dm types
    if (type !== 'follow' && type !== 'follow_request' && type !== 'dm') {
      const muteExists = await this.dataSource.query<{ exists: boolean }[]>(
        `SELECT EXISTS(
           SELECT 1 FROM mutes WHERE muter_id = $1 AND muted_id = $2
         ) AS exists`,
        [recipientId, actorId],
      );
      if (muteExists[0]?.exists) {
        this.logger.debug(
          `[notif] suppressed muted notification type=${type} actor=${actorId} recipient=${recipientId}`,
        );
        return null;
      }
    }

    // 4. Duplicate dedup within DEDUP_WINDOW_MS
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS);
    const dupExists = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS(
         SELECT 1 FROM notifications
         WHERE recipient_id = $1
           AND type = $2::notification_type
           AND actor_id = $3
           AND ($4::bigint IS NULL OR post_id = $4::bigint)
           AND ($4::bigint IS NOT NULL OR post_id IS NULL)
           AND created_at >= $5
       ) AS exists`,
      [recipientId, type, actorId, postId, dedupSince],
    );
    if (dupExists[0]?.exists) {
      this.logger.debug(
        `[notif] suppressed duplicate type=${type} actor=${actorId} recipient=${recipientId} postId=${postId}`,
      );
      return null;
    }

    // 5. Write notification row
    const id = SnowflakeUtil.instance.generate();
    const notif = this.notifRepo.create({
      id,
      type,
      actorId,
      recipientId,
      postId: postId ?? null,
      readAt: null,
    });

    await this.notifRepo.save(notif);

    // 6. Increment Redis unread badge (best-effort)
    const key = NOTIF_UNREAD_KEY(recipientId);
    await this.redisService.client
      .incr(key)
      .catch((e) => this.logger.warn(`Redis badge incr failed: ${String(e)}`));

    // 7. Enqueue delivery job
    await this.notifyQueue
      .add('notify.deliver', { notificationId: id, recipientId }, { jobId: `notif:${id}` })
      .catch((e) => this.logger.warn(`notify.deliver enqueue failed: ${String(e)}`));

    return notif;
  }

  // ── Aggregation helper ─────────────────────────────────────────────────────

  /**
   * Aggregate raw notification rows into NotificationDto items.
   *
   * Grouping strategy:
   *   - Aggregatable types (like, repost, quote, reply, mention): group by (type, post_id)
   *     if the rows fall within AGGREGATION_WINDOW_MS of each other.
   *   - Non-aggregatable types: one row = one NotificationDto.
   *
   * For each group:
   *   - id = most-recent row's id
   *   - actors = up to 3 most-recent unique actors
   *   - otherCount = total actors - shown actors
   *   - readAt = null if any row in the group is unread; latest readAt otherwise
   *   - createdAt = most-recent row's createdAt
   *   - post = shallow PostDto if post_id is set; null otherwise
   */
  private async aggregateRows(rows: Notification[], _userId: string): Promise<NotificationDto[]> {
    if (rows.length === 0) return [];

    // Collect post IDs that need loading
    const postIds = new Set<string>();
    for (const row of rows) {
      if (row.postId) postIds.add(row.postId);
    }

    // Batch-load posts
    const postMap = new Map<string, Post>();
    if (postIds.size > 0) {
      const posts = await this.postRepo.find({
        where: { id: In([...postIds]) },
        relations: ['author'],
        withDeleted: true,
      });
      for (const p of posts) postMap.set(p.id, p);
    }

    const result: NotificationDto[] = [];

    // Process rows in order (already sorted DESC by id)
    const processed = new Set<string>();

    for (const row of rows) {
      if (processed.has(row.id)) continue;

      if (AGGREGATABLE_TYPES.has(row.type) && row.postId) {
        // Group all rows with same (type, post_id) within AGGREGATION_WINDOW_MS of this row
        const groupKey = `${row.type}:${row.postId}`;
        const anchorTime = row.createdAt.getTime();
        const windowStart = anchorTime - AGGREGATION_WINDOW_MS;

        const groupRows = rows.filter(
          (r) =>
            !processed.has(r.id) &&
            r.type === row.type &&
            r.postId === row.postId &&
            r.createdAt.getTime() >= windowStart,
        );

        // Mark all group members as processed
        for (const r of groupRows) processed.add(r.id);

        // Deduplicate actors (a user may have multiple rows in different windows)
        const seenActors = new Set<string>();
        const uniqueActors: User[] = [];
        for (const r of groupRows) {
          if (r.actor && !seenActors.has(r.actorId)) {
            seenActors.add(r.actorId);
            uniqueActors.push(r.actor);
          }
        }

        const shownActors = uniqueActors.slice(0, 3);
        const otherCount = Math.max(0, uniqueActors.length - shownActors.length);

        // readAt: null if any row is unread; latest readAt otherwise
        const allRead = groupRows.every((r) => r.readAt !== null);
        const latestReadAt =
          allRead && groupRows.length > 0
            ? groupRows
                .map((r) => r.readAt as Date) // safe: allRead guarantees non-null
                .reduce((a, b) => (a > b ? a : b))
                .toISOString()
            : null;

        const mostRecent = groupRows[0]; // already DESC sorted
        const post = this.buildShallowPost(postMap.get(row.postId) ?? null, groupKey);

        result.push({
          id: mostRecent.id,
          type: row.type,
          actors: shownActors.map(this.toUserCard),
          otherCount,
          post,
          readAt: latestReadAt,
          createdAt: mostRecent.createdAt.toISOString(),
        });
      } else {
        // Non-aggregatable: one row, one item
        processed.add(row.id);
        const post = row.postId
          ? this.buildShallowPost(postMap.get(row.postId) ?? null, row.id)
          : null;

        const actor = row.actor;

        result.push({
          id: row.id,
          type: row.type,
          actors: actor ? [this.toUserCard(actor)] : [],
          otherCount: 0,
          post,
          readAt: row.readAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }

    return result;
  }

  private toUserCard(user: User): UserCardDto {
    return {
      id: user.id,
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: null, // media resolution deferred to media module
      isVerified: user.isVerified,
      isPrivate: user.isPrivate,
    };
  }

  private buildShallowPost(_post: Post | null, _key: string): PostDto | null {
    if (!_post) return null;

    const author: PostAuthorDto = {
      id: _post.author?.id ?? '',
      handle: _post.author?.handle ?? '',
      displayName: _post.author?.displayName ?? '',
      avatarUrl: null,
      isVerified: _post.author?.isVerified ?? false,
      isPrivate: _post.author?.isPrivate ?? false,
    };

    return {
      id: _post.id,
      author,
      text: _post.text,
      createdAt: _post.createdAt.toISOString(),
      entities: { mentions: [], hashtags: [], urls: [] },
      media: [],
      counts: {
        replies: _post.replyCount,
        reposts: _post.repostCount,
        likes: _post.likeCount,
        bookmarks: _post.bookmarkCount,
      },
      viewer: { liked: false, reposted: false, bookmarked: false },
      replyToId: _post.replyToId,
      replyPolicy: _post.replyPolicy,
      quoteOf: null,
      repostOf: null,
      repostedBy: null,
      deleted: !!_post.deletedAt,
    };
  }
}
