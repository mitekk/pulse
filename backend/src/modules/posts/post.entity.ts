import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Mention } from './mention.entity';
import { PostHashtag } from './post-hashtag.entity';

export type ReplyPolicy = 'everyone' | 'following' | 'mentioned';

/**
 * Post entity — represents a single post (tweet), reply, repost, or quote.
 *
 * ID strategy: Snowflake BIGINT stored as string. The @PrimaryColumn with
 * type 'bigint' maps to Postgres BIGINT; TypeORM returns it as a string
 * because Node.js cannot safely represent 64-bit integers as Number.
 */
@Entity('posts')
export class Post {
  @PrimaryColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author!: User;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  lang!: string | null;

  // ── Thread / reply chain ───────────────────────────────────────────────────

  @Column({ name: 'reply_to_id', type: 'bigint', nullable: true })
  replyToId!: string | null;

  @ManyToOne(() => Post, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reply_to_id' })
  replyTo!: Post | null;

  @Column({ name: 'reply_root_id', type: 'bigint', nullable: true })
  replyRootId!: string | null;

  @Column({ name: 'conversation_id', type: 'bigint', nullable: true })
  conversationId!: string | null;

  // ── Repost / quote ─────────────────────────────────────────────────────────

  @Column({ name: 'repost_of_id', type: 'bigint', nullable: true })
  repostOfId!: string | null;

  @ManyToOne(() => Post, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'repost_of_id' })
  repostOf!: Post | null;

  @Column({ name: 'quote_of_id', type: 'bigint', nullable: true })
  quoteOfId!: string | null;

  @ManyToOne(() => Post, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quote_of_id' })
  quoteOf!: Post | null;

  // ── Reply policy ───────────────────────────────────────────────────────────

  @Column({
    name: 'reply_policy',
    type: 'varchar',
    length: 10,
    default: 'everyone',
  })
  replyPolicy!: ReplyPolicy;

  // ── Denorm counters ────────────────────────────────────────────────────────

  @Column({ name: 'reply_count', type: 'integer', default: 0 })
  replyCount!: number;

  @Column({ name: 'repost_count', type: 'integer', default: 0 })
  repostCount!: number;

  @Column({ name: 'like_count', type: 'integer', default: 0 })
  likeCount!: number;

  @Column({ name: 'bookmark_count', type: 'integer', default: 0 })
  bookmarkCount!: number;

  @Column({ name: 'view_count', type: 'integer', default: 0 })
  viewCount!: number;

  // ── Timestamps ─────────────────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;

  // ── Relations ──────────────────────────────────────────────────────────────

  @OneToMany(() => Mention, (mention) => mention.post)
  mentions!: Mention[];

  @OneToMany(() => PostHashtag, (ph) => ph.post)
  postHashtags!: PostHashtag[];
}
