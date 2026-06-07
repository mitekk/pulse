/**
 * DmNotificationPort — seam for DM notification delivery.
 *
 * Called by MessagingService when a new DM is sent and the recipient is not
 * currently in the conversation room (i.e., they need a push notification).
 *
 * Subtask 8b (NotificationsModule) replaces NoopDmNotificationService with
 * a real implementation that writes a notification row + emits WS notification.new.
 */
export const DM_NOTIFICATION_PORT = 'DM_NOTIFICATION_PORT';

export interface DmNotificationPort {
  /**
   * Create a DM notification for a recipient.
   * @param senderId      UUID of the user who sent the message
   * @param recipientId   UUID of the recipient user
   * @param conversationId  Snowflake ID of the conversation
   * @param messageId     Snowflake ID of the message
   */
  notifyDm(
    senderId: string,
    recipientId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void>;
}
