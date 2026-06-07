import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Post } from '../posts/post.entity';
import { Media } from './media.entity';

@Entity('post_media')
export class PostMedia {
  @PrimaryColumn({ name: 'post_id', type: 'bigint' })
  postId!: string;

  @PrimaryColumn({ name: 'media_id', type: 'bigint' })
  mediaId!: string;

  @Column({ type: 'smallint', default: 0 })
  position!: number;

  @ManyToOne(() => Post, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'post_id' })
  post!: Post;

  @ManyToOne(() => Media, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'media_id' })
  media!: Media;
}
