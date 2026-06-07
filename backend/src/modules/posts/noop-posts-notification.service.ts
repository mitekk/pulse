import { Injectable, Logger } from '@nestjs/common';
import { PostsNotificationPort } from './posts-notification.port';

/**
 * NoopPostsNotificationService — no-op implementation of PostsNotificationPort.
 * Logs intent at debug level; does nothing else.
 * Phase 7 replaces this with the real notification service.
 */
@Injectable()
export class NoopPostsNotificationService implements PostsNotificationPort {
  private readonly logger = new Logger(NoopPostsNotificationService.name);

  async notifyLike(actorId: string, postAuthorId: string, postId: string): Promise<void> {
    this.logger.debug(
      `[noop] notifyLike actor=${actorId} postAuthor=${postAuthorId} post=${postId}`,
    );
  }

  async notifyReply(actorId: string, parentAuthorId: string, postId: string): Promise<void> {
    this.logger.debug(
      `[noop] notifyReply actor=${actorId} parent=${parentAuthorId} post=${postId}`,
    );
  }

  async notifyMention(actorId: string, mentionedUserId: string, postId: string): Promise<void> {
    this.logger.debug(
      `[noop] notifyMention actor=${actorId} mentioned=${mentionedUserId} post=${postId}`,
    );
  }

  async notifyQuote(actorId: string, originalAuthorId: string, postId: string): Promise<void> {
    this.logger.debug(
      `[noop] notifyQuote actor=${actorId} original=${originalAuthorId} post=${postId}`,
    );
  }

  async notifyRepost(actorId: string, originalAuthorId: string, postId: string): Promise<void> {
    this.logger.debug(
      `[noop] notifyRepost actor=${actorId} original=${originalAuthorId} post=${postId}`,
    );
  }
}
