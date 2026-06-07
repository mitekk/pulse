import { Injectable, Logger } from '@nestjs/common';
import { NotificationPort } from './notification.port';

/**
 * NoopNotificationService — no-op implementation of NotificationPort.
 *
 * Logs intent to console so notification calls are visible in dev without
 * requiring a real notifications infrastructure. Phase 7 replaces this with
 * a real implementation that writes notification rows and emits WS events.
 *
 * Swap: change `useClass: NoopNotificationService` in users.module.ts to the
 * real implementation once NotificationsModule is implemented.
 */
@Injectable()
export class NoopNotificationService implements NotificationPort {
  private readonly logger = new Logger(NoopNotificationService.name);

  async notifyFollow(followerId: string, followeeId: string): Promise<void> {
    this.logger.debug(`[noop] follow notification: ${followerId} → ${followeeId}`);
  }

  async notifyFollowRequest(followerId: string, followeeId: string): Promise<void> {
    this.logger.debug(`[noop] follow_request notification: ${followerId} → ${followeeId}`);
  }

  async notifyFollowAccepted(followerId: string, followeeId: string): Promise<void> {
    this.logger.debug(
      `[noop] follow_accepted notification: ${followerId} accepted by ${followeeId}`,
    );
  }
}
