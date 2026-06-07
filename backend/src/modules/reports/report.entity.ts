import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';

export type ReportTargetType = 'post' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'hate_speech' | 'misinformation' | 'other';

/**
 * Report entity — user-submitted abuse reports.
 *
 * id         Snowflake BIGINT (string in JS).
 * reporter   FK to users (the submitting user); ON DELETE SET NULL (preserve record).
 * target_type 'post' | 'user'
 * target_id  String ID of the reported entity (post Snowflake or user UUID).
 * reason     Enum reason code.
 * description Optional freeform context (max 500 chars).
 * created_at Timestamp.
 */
@Entity('reports')
export class Report {
  @PrimaryColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'reporter_id', type: 'uuid', nullable: true })
  reporterId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reporter_id' })
  reporter!: User | null;

  @Column({ name: 'target_type', type: 'varchar', length: 10 })
  targetType!: ReportTargetType;

  @Column({ name: 'target_id', type: 'varchar', length: 40 })
  targetId!: string;

  @Column({ type: 'varchar', length: 30 })
  reason!: ReportReason;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
