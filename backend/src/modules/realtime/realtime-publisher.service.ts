import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../../infra/redis/redis.service';
import { RealtimePublisherPort } from '../timeline/realtime-publisher.port';

/**
 * Pub/sub channel names (matching what fan-out processor publishes).
 */
const CHANNELS = {
  timelineNewPosts: 'timeline:newPosts',
  postCounters: 'post:counters',
  dmMessage: 'dm:message',
  dmRead: 'dm:read',
  notificationNew: 'notification:new',
  followUpdate: 'follow:update',
} as const;

/** Payload shapes published to Redis pub/sub channels */
export interface TimelineNewPostsPayload {
  userId: string;
  count: number;
  previewIds: string[];
}

export interface PostCountersPayload {
  postId: string;
  likes: number;
  replies: number;
  reposts: number;
}

export interface DmMessagePayload {
  conversationId: string;
  recipientIds: string[];
  message: unknown; // MessageDto shape
}

export interface DmReadPayload {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
}

export interface NotificationNewPayload {
  recipientId: string;
  notification: unknown; // NotificationDto shape
}

export interface FollowUpdatePayload {
  targetUserId: string;
  type: 'followed' | 'unfollowed' | 'requested';
  actorId: string;
}

/**
 * RealtimePublisherService — the REAL implementation of RealtimePublisherPort.
 *
 * Dual role:
 *   1. Publish domain events to Redis pub/sub channels (cross-instance broadcast).
 *   2. Subscribe to Redis pub/sub channels and re-emit to local Socket.IO rooms.
 *
 * This service wires the full fan-out path:
 *   Domain action → publish(channel, payload) → Redis pub/sub
 *   ← every instance receives → re-emit to local sockets in target room
 *
 * The Socket.IO server reference is injected via setServer() called from the
 * RealtimeGateway afterInit() lifecycle hook.
 */
@Injectable()
export class RealtimePublisherService implements RealtimePublisherPort, OnModuleInit {
  private readonly logger = new Logger(RealtimePublisherService.name);
  private io!: Server;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Called by RealtimeGateway.afterInit() to inject the Socket.IO server reference.
   * Must be called before any emit methods are invoked.
   */
  setServer(server: Server): void {
    this.io = server;
    this.logger.log('Socket.IO server reference set');
  }

  /** Subscribe to all Redis pub/sub channels on module init */
  async onModuleInit(): Promise<void> {
    const sub = this.redisService.subscriber;

    // Subscribe to all cross-instance channels
    await sub.subscribe(
      CHANNELS.timelineNewPosts,
      CHANNELS.postCounters,
      CHANNELS.dmMessage,
      CHANNELS.dmRead,
      CHANNELS.notificationNew,
      CHANNELS.followUpdate,
    );

    sub.on('message', (channel: string, message: string) => {
      this.handlePubSubMessage(channel, message);
    });

    this.logger.log('Subscribed to Redis pub/sub channels');
  }

  private handlePubSubMessage(channel: string, raw: string): void {
    if (!this.io) {
      // Gateway not yet initialized — drop the message (safe during boot)
      return;
    }

    try {
      const payload = JSON.parse(raw) as unknown;

      switch (channel) {
        case CHANNELS.timelineNewPosts: {
          const p = payload as TimelineNewPostsPayload;
          this.io.to(`user:${p.userId}`).emit('timeline.newPosts', {
            count: p.count,
            previewIds: p.previewIds,
          });
          break;
        }

        case CHANNELS.postCounters: {
          const p = payload as PostCountersPayload;
          this.io.to(`post:${p.postId}`).emit('post.counters', {
            postId: p.postId,
            likes: p.likes,
            replies: p.replies,
            reposts: p.reposts,
          });
          break;
        }

        case CHANNELS.dmMessage: {
          const p = payload as DmMessagePayload;
          // Emit to conversation room (open thread view)
          this.io.to(`conversation:${p.conversationId}`).emit('dm.message', p.message);
          // Also emit to each recipient's personal room (notification delivery)
          for (const recipientId of p.recipientIds) {
            this.io.to(`user:${recipientId}`).emit('dm.message', p.message);
          }
          break;
        }

        case CHANNELS.dmRead: {
          const p = payload as DmReadPayload;
          this.io.to(`conversation:${p.conversationId}`).emit('dm.read', {
            conversationId: p.conversationId,
            userId: p.userId,
            lastReadMessageId: p.lastReadMessageId,
          });
          break;
        }

        case CHANNELS.notificationNew: {
          const p = payload as NotificationNewPayload;
          this.io.to(`user:${p.recipientId}`).emit('notification.new', p.notification);
          break;
        }

        case CHANNELS.followUpdate: {
          const p = payload as FollowUpdatePayload;
          this.io.to(`user:${p.targetUserId}`).emit('follow.update', {
            type: p.type,
            actorId: p.actorId,
          });
          break;
        }

        default:
          this.logger.warn(`Unhandled pub/sub channel: ${channel}`);
      }
    } catch (err) {
      this.logger.error(`Failed to handle pub/sub message on ${channel}: ${String(err)}`);
    }
  }

  // ── RealtimePublisherPort implementation ──────────────────────────────────

  /**
   * Notify a user's connected clients that new posts are available on their
   * home timeline. Called by FanoutProcessor after fan-out completes.
   */
  async notifyNewTimelinePosts(userId: string, count: number, previewIds: string[]): Promise<void> {
    await this.publish<TimelineNewPostsPayload>(CHANNELS.timelineNewPosts, {
      userId,
      count,
      previewIds,
    });
  }

  // ── Public API for other services ─────────────────────────────────────────

  /**
   * Publish a DM message to the conversation room + recipient personal rooms.
   * Persist-then-publish pattern: caller must persist before calling this.
   */
  async publishDmMessage(
    conversationId: string,
    recipientIds: string[],
    message: unknown,
  ): Promise<void> {
    await this.publish<DmMessagePayload>(CHANNELS.dmMessage, {
      conversationId,
      recipientIds,
      message,
    });
  }

  /**
   * Publish a DM read receipt to the conversation room.
   */
  async publishDmRead(
    conversationId: string,
    userId: string,
    lastReadMessageId: string,
  ): Promise<void> {
    await this.publish<DmReadPayload>(CHANNELS.dmRead, {
      conversationId,
      userId,
      lastReadMessageId,
    });
  }

  /**
   * Publish post counter update to the post room (for thread views).
   */
  async publishPostCounters(payload: PostCountersPayload): Promise<void> {
    await this.publish<PostCountersPayload>(CHANNELS.postCounters, payload);
  }

  /**
   * Publish a notification to a user's personal room.
   * Called by NotificationsService (subtask 8b).
   */
  async publishNotification(recipientId: string, notification: unknown): Promise<void> {
    await this.publish<NotificationNewPayload>(CHANNELS.notificationNew, {
      recipientId,
      notification,
    });
  }

  /**
   * Publish a follow-update event to a user's personal room.
   */
  async publishFollowUpdate(
    targetUserId: string,
    type: 'followed' | 'unfollowed' | 'requested',
    actorId: string,
  ): Promise<void> {
    await this.publish<FollowUpdatePayload>(CHANNELS.followUpdate, {
      targetUserId,
      type,
      actorId,
    });
  }

  /**
   * Direct emit to a user's personal room on THIS instance only.
   * Use publish() for cross-instance delivery.
   */
  emitToUser(userId: string, event: string, data: unknown): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Direct emit to a room on THIS instance only.
   * Use publish() for cross-instance delivery.
   */
  emitToRoom(room: string, event: string, data: unknown): void {
    if (!this.io) return;
    this.io.to(room).emit(event, data);
  }

  /**
   * Publish a payload to a Redis pub/sub channel.
   * All instances (including this one) will receive and re-emit to local sockets.
   */
  async publish<T>(channel: string, payload: T): Promise<void> {
    try {
      await this.redisService.client.publish(channel, JSON.stringify(payload));
    } catch (err) {
      this.logger.error(`Failed to publish to channel ${channel}: ${String(err)}`);
    }
  }
}
