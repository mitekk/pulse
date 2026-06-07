/**
 * RealtimePublisherPort — seam for the WebSocket/realtime layer.
 *
 * TimelineService calls this after fan-out completes to notify connected clients
 * that new posts are available on their home timeline. The actual Socket.IO
 * emission (subtask 8 / RealtimeModule) will replace the no-op implementation.
 *
 * Extended in subtask 8b to include publishNotification for the notify.deliver
 * BullMQ worker.
 */
export const REALTIME_PUBLISHER_PORT = 'REALTIME_PUBLISHER_PORT';

export interface RealtimePublisherPort {
  /**
   * Notify one user's connected clients that N new posts were added to their home timeline.
   * @param userId      Target user's UUID
   * @param count       Number of new post IDs added to this user's home:{userId} zset
   * @param previewIds  Up to 5 leading post IDs for client-side preview
   */
  notifyNewTimelinePosts(userId: string, count: number, previewIds: string[]): Promise<void>;

  /**
   * Publish a notification to a user's personal WS room.
   * Called by NotifyDeliverProcessor after creating a notification row.
   * @param recipientId  Target user's UUID
   * @param notification NotificationDto to emit as notification.new
   */
  publishNotification(recipientId: string, notification: unknown): Promise<void>;
}
