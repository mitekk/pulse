import { Injectable, Logger } from '@nestjs/common';
import { PostsNotificationPort } from '../posts/posts-notification.port';
import { NotificationsService } from './notifications.service';

/**
 * RealPostsNotificationService — real implementation of PostsNotificationPort.
 *
 * Delegates to NotificationsService for all post-related notifications
 * (like, reply, repost, quote, mention).
 *
 * Replaces NoopPostsNotificationService which is provided by PostsModule and EngagementModule.
 * Wired in AppModule via:
 *   { provide: POSTS_NOTIFICATION_PORT, useExisting: RealPostsNotificationService }
 */
@Injectable()
export class RealPostsNotificationService implements PostsNotificationPort {
  private readonly logger = new Logger(RealPostsNotificationService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async notifyLike(actorId: string, postAuthorId: string, postId: string): Promise<void> {
    await this.notificationsService
      .notifyLike(actorId, postAuthorId, postId)
      .catch((e) => this.logger.warn(`notifyLike failed: ${String(e)}`));
  }

  async notifyReply(actorId: string, parentAuthorId: string, postId: string): Promise<void> {
    await this.notificationsService
      .notifyReply(actorId, parentAuthorId, postId)
      .catch((e) => this.logger.warn(`notifyReply failed: ${String(e)}`));
  }

  async notifyMention(actorId: string, mentionedUserId: string, postId: string): Promise<void> {
    await this.notificationsService
      .notifyMention(actorId, mentionedUserId, postId)
      .catch((e) => this.logger.warn(`notifyMention failed: ${String(e)}`));
  }

  async notifyQuote(actorId: string, originalAuthorId: string, postId: string): Promise<void> {
    await this.notificationsService
      .notifyQuote(actorId, originalAuthorId, postId)
      .catch((e) => this.logger.warn(`notifyQuote failed: ${String(e)}`));
  }

  async notifyRepost(actorId: string, originalAuthorId: string, postId: string): Promise<void> {
    await this.notificationsService
      .notifyRepost(actorId, originalAuthorId, postId)
      .catch((e) => this.logger.warn(`notifyRepost failed: ${String(e)}`));
  }
}
