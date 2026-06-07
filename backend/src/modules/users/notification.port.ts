/**
 * NotificationPort — interface for emitting social graph notification events.
 *
 * Phase 7 (Realtime + Notifications) replaces NoopNotificationService with a
 * real implementation that writes notification rows + emits WS events. The
 * interface is defined here (in the users module) because follow actions are
 * the first callers; it will be moved to a shared location or the notifications
 * module in Phase 7.
 */
export const NOTIFICATION_PORT = 'NOTIFICATION_PORT';

export interface NotificationPort {
  /**
   * Notify `followeeId` that `followerId` started following them (active follow).
   */
  notifyFollow(followerId: string, followeeId: string): Promise<void>;

  /**
   * Notify `followeeId` that `followerId` sent a follow request (pending state).
   */
  notifyFollowRequest(followerId: string, followeeId: string): Promise<void>;

  /**
   * Notify `followerId` that their follow request to `followeeId` was accepted.
   */
  notifyFollowAccepted(followerId: string, followeeId: string): Promise<void>;
}
