import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { PostHashtag } from './post-hashtag.entity';

/**
 * Hashtag entity — one row per unique tag (citext UNIQUE).
 * ID is a Snowflake BIGINT (generated at upsert time by PostsService).
 */
@Entity('hashtags')
export class Hashtag {
  @PrimaryColumn({ type: 'bigint' })
  id!: string;

  /**
   * Stored as citext — case-insensitive dedup at DB level.
   * TypeORM maps this as 'varchar' because citext is a Postgres extension type.
   * The UNIQUE constraint on the column ensures no duplicates.
   */
  @Column({ type: 'varchar', unique: true })
  tag!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => PostHashtag, (ph) => ph.hashtag)
  postHashtags!: PostHashtag[];
}
