import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DmPrivacy = 'everyone' | 'following';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext', unique: true })
  handle!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 50 })
  displayName!: string;

  @Column({ type: 'citext', unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  bio!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  location!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  website!: string | null;

  /** Nullable uuid column; FK to media.id added in Phase 6 media migration */
  @Column({ name: 'avatar_media_id', type: 'uuid', nullable: true })
  avatarMediaId!: string | null;

  /** Nullable uuid column; FK to media.id added in Phase 6 media migration */
  @Column({ name: 'banner_media_id', type: 'uuid', nullable: true })
  bannerMediaId!: string | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate!: boolean;

  @Column({
    name: 'dm_privacy',
    type: 'varchar',
    length: 10,
    default: 'following',
  })
  dmPrivacy!: DmPrivacy;

  @Column({ name: 'followers_count', type: 'integer', default: 0 })
  followersCount!: number;

  @Column({ name: 'following_count', type: 'integer', default: 0 })
  followingCount!: number;

  @Column({ name: 'posts_count', type: 'integer', default: 0 })
  postsCount!: number;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt!: Date | null;
}
