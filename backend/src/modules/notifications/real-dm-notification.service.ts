import { Injectable, Logger } from '@nestjs/common';
import { DmNotificationPort } from '../messaging/dm-notification.port';
import { NotificationsService } from './notifications.service';

/**
 * RealDmNotificationService — real implementation of DmNotificationPort.
 *
 * Delegates to NotificationsService.notifyDm() which:
 *   - Checks self-notify suppression
 *   - Checks block/mute suppression
 *   - Writes the notification row
 *   - Increments Redis unread badge
 *   - Enqueues notify.deliver job
 *
 * Replaces NoopDmNotificationService in MessagingModule.
 * Wired in AppModule via:
 *   { provide: DM_NOTIFICATION_PORT, useExisting: RealDmNotificationService }
 */
@Injectable()
export class RealDmNotificationService implements DmNotificationPort {
  private readonly logger = new Logger(RealDmNotificationService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async notifyDm(
    senderId: string,
    recipientId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await this.notificationsService
      .notifyDm(senderId, recipientId, conversationId, messageId)
      .catch((e) => this.logger.warn(`notifyDm failed: ${String(e)}`));
  }
}
