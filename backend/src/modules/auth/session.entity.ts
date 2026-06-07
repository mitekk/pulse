import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Session entity — one row per active or revoked refresh-token lineage.
 *
 * id           Snowflake BIGINT stored as string in JS / BIGINT in Postgres.
 * refresh_hash SHA-256 hex of the raw 256-bit refresh token.
 * family_id    Groups all tokens from a single login rotation chain.
 *              On reuse detection, every session with this family_id is revoked.
 * revoked_at   null = active session; non-null = revoked.
 */
@Entity('sessions')
export class Session {
  /** Snowflake BIGINT — stored as string in JS to avoid precision loss */
  @PrimaryColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'refresh_hash', type: 'varchar', length: 64 })
  refreshHash!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
