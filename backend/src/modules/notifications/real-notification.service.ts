import { Injectable, Logger } from '@nestjs/common';
import { NotificationPort } from '../users/notification.port';
import { NotificationsService } from './notifications.service';

/**
 * RealNotificationService — real implementation of NotificationPort.
 *
 * Delegates to NotificationsService for all follow-related notifications.
 * Replaces NoopNotificationService which is provided by UsersModule.
 * Wired in AppModule via:
 *   { provide: NOTIFICATION_PORT, useExisting: RealNotificationService }
 */
@Injectable()
export class RealNotificationService implements NotificationPort {
  private readonly logger = new Logger(RealNotificationService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async notifyFollow(followerId: string, followeeId: string): Promise<void> {
    await this.notificationsService
      .notifyFollow(followerId, followeeId)
      .catch((e) => this.logger.warn(`notifyFollow failed: ${String(e)}`));
  }

  async notifyFollowRequest(followerId: string, followeeId: string): Promise<void> {
    await this.notificationsService
      .notifyFollowRequest(followerId, followeeId)
      .catch((e) => this.logger.warn(`notifyFollowRequest failed: ${String(e)}`));
  }

  async notifyFollowAccepted(followerId: string, followeeId: string): Promise<void> {
    // When a follow request is accepted:
    //   - followerId = original requester (they get notified that their request was accepted)
    //   - followeeId = the user who accepted (they are the actor)
    // So: actor = followeeId, recipient = followerId
    await this.notificationsService
      .notifyFollowAccepted(followeeId, followerId)
      .catch((e) => this.logger.warn(`notifyFollowAccepted failed: ${String(e)}`));
  }
}
