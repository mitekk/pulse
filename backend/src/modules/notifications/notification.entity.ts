import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export type NotificationType =
  | 'like'
  | 'reply'
  | 'repost'
  | 'quote'
  | 'follow'
  | 'mention'
  | 'follow_request'
  | 'dm';

/**
 * Notification entity — one raw row per notification event.
 *
 * Aggregation (grouping multiple actors for the same post/type) is done at read
 * time in NotificationsService, not at write time.
 *
 * The `type` column is a Postgres ENUM (notification_type) created in migration 8.
 *
 * Constraints (enforced in migration):
 *   - recipient_id FK→users ON DELETE CASCADE
 *   - actor_id FK→users ON DELETE CASCADE
 *   - CHECK recipient_id <> actor_id (DB-level self-notify guard)
 *   - INDEX (recipient_id, id DESC) — paginated list queries
 *   - PARTIAL INDEX (recipient_id) WHERE read_at IS NULL — unread-count queries
 */
@Entity('notifications')
@Index('idx_notifications_recipient_id', ['recipientId', 'id'])
export class Notification {
  @PrimaryColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false, nullable: false })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: User;

  @Column({
    type: 'enum',
    enum: ['like', 'reply', 'repost', 'quote', 'follow', 'mention', 'follow_request', 'dm'],
    enumName: 'notification_type',
  })
  type!: NotificationType;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false, nullable: false })
  @JoinColumn({ name: 'actor_id' })
  actor?: User;

  @Column({ name: 'post_id', type: 'bigint', nullable: true })
  postId!: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
