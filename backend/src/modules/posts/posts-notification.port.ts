/**
 * PostsNotificationPort — extends the social notification seam with post-specific events.
 *
 * PostsModule declares its own injection token + interface so it stays decoupled from
 * UsersModule's NotificationPort. Phase 7 unifies both into one real implementation.
 */
export const POSTS_NOTIFICATION_PORT = 'POSTS_NOTIFICATION_PORT';

export interface PostsNotificationPort {
  /** Notify `parentAuthorId` that `actorId` replied to their post `postId`. */
  notifyReply(actorId: string, parentAuthorId: string, postId: string): Promise<void>;

  /** Notify each mentioned user that `actorId` mentioned them in `postId`. */
  notifyMention(actorId: string, mentionedUserId: string, postId: string): Promise<void>;

  /** Notify `originalAuthorId` that `actorId` quoted their post `postId`. */
  notifyQuote(actorId: string, originalAuthorId: string, postId: string): Promise<void>;

  /** Notify `originalAuthorId` that `actorId` reposted their post `postId`. */
  notifyRepost(actorId: string, originalAuthorId: string, postId: string): Promise<void>;
}
