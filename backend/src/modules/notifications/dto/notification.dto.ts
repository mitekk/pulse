import type { NotificationType } from '../notification.entity';
import type { UserCardDto } from '../../users/dto/user-card.dto';
import type { PostDto } from '../../posts/dto/post.dto';

/**
 * NotificationDto — aggregated shape returned by GET /api/v1/notifications.
 *
 * Multiple raw notification rows can be grouped into one NotificationDto when they
 * share the same (type, post_id) within a recent time window:
 *
 *   "Alice, Bob, and 4 others liked your post"
 *   → { type: 'like', actors: [alice, bob], otherCount: 4, post: ... }
 *
 * Fields:
 *   id        - ID of the most-recent raw notification row in the group
 *   type      - notification type
 *   actors    - up to 3 most-recent actors (sorted by notification.created_at DESC)
 *   otherCount - number of additional actors beyond the shown array
 *   post      - shallow PostDto when relevant (like, reply, quote, mention, repost); null otherwise
 *   readAt    - null if any row in the group is unread; earliest read_at otherwise
 *   createdAt - created_at of the most-recent row in the group
 */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  actors: UserCardDto[];
  otherCount: number;
  post: PostDto | null;
  readAt: string | null;
  createdAt: string;
}
