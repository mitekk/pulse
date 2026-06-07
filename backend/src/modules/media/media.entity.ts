import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';

export type MediaType = 'image' | 'gif' | 'video';
export type MediaStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface MediaVariants {
  thumb?: string;
  small?: string;
  medium?: string;
  large?: string;
  mp4?: string;
  poster?: string;
}

@Entity('media')
export class Media {
  /** Snowflake BIGINT stored as string */
  @PrimaryColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ type: 'varchar', length: 10 })
  type!: MediaType;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: MediaStatus;

  @Column({ name: 'storage_key', type: 'varchar', length: 512, nullable: true })
  storageKey!: string | null;

  @Column({ type: 'varchar', length: 127 })
  mime!: string;

  @Column({ type: 'integer', nullable: true })
  width!: number | null;

  @Column({ type: 'integer', nullable: true })
  height!: number | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs!: number | null;

  @Column({ name: 'alt_text', type: 'varchar', length: 1000, nullable: true })
  altText!: string | null;

  @Column({ type: 'jsonb', default: {} })
  variants!: MediaVariants;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
