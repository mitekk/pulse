import { Injectable, Logger } from '@nestjs/common';
import { DmNotificationPort } from './dm-notification.port';

/**
 * NoopDmNotificationService — no-op implementation of DmNotificationPort.
 *
 * Logs intent to console so DM notification calls are visible in dev without
 * requiring NotificationsModule infrastructure. Subtask 8b replaces this with
 * a real implementation that writes notification rows and emits WS events.
 *
 * Swap: change `useClass: NoopDmNotificationService` in messaging.module.ts
 * to the real implementation once NotificationsModule is implemented.
 */
@Injectable()
export class NoopDmNotificationService implements DmNotificationPort {
  private readonly logger = new Logger(NoopDmNotificationService.name);

  async notifyDm(
    senderId: string,
    recipientId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    this.logger.debug(
      `[noop] dm notification: sender=${senderId} recipient=${recipientId} conv=${conversationId} msg=${messageId}`,
    );
  }
}
