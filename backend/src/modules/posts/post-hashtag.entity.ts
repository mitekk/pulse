import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Post } from './post.entity';
import { Hashtag } from './hashtag.entity';

/**
 * PostHashtag join entity — (post_id, hashtag_id) composite PK.
 */
@Entity('post_hashtags')
export class PostHashtag {
  @PrimaryColumn({ name: 'post_id', type: 'bigint' })
  postId!: string;

  @PrimaryColumn({ name: 'hashtag_id', type: 'bigint' })
  hashtagId!: string;

  @ManyToOne(() => Post, (post) => post.postHashtags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Post;

  @ManyToOne(() => Hashtag, (hashtag) => hashtag.postHashtags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hashtag_id' })
  hashtag!: Hashtag;
}
