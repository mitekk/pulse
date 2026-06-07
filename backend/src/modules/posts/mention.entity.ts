import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Post } from './post.entity';
import { User } from '../users/user.entity';

/**
 * Mention entity — tracks which users are @-mentioned in which posts.
 * Composite PK (post_id, mentioned_user_id).
 */
@Entity('mentions')
export class Mention {
  @PrimaryColumn({ name: 'post_id', type: 'bigint' })
  postId!: string;

  @PrimaryColumn({ name: 'mentioned_user_id', type: 'uuid' })
  mentionedUserId!: string;

  @ManyToOne(() => Post, (post) => post.mentions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Post;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentioned_user_id' })
  mentionedUser!: User;
}
