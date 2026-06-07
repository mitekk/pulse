import { CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Post } from '../posts/post.entity';

/**
 * Bookmark entity — represents a user bookmarking a post.
 * Composite PK (user_id, post_id) enforces one-bookmark-per-user at DB level.
 * Bookmarks are private: only the owning user can see them.
 */
@Entity('bookmarks')
export class Bookmark {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ name: 'post_id', type: 'bigint' })
  postId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Post;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
