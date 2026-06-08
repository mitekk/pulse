import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintToNumber } from './media.entity';

/**
 * Single-row counter (id = 1) that is the source of truth for total bytes
 * reserved+committed in object storage. Enforced via an atomic compare-and-set
 * UPDATE in QuotaService so concurrent uploads can't collectively exceed the
 * global cap. Reconciled periodically against SUM(media.byte_size).
 */
@Entity('storage_usage')
export class StorageUsage {
  @PrimaryColumn({ type: 'smallint' })
  id!: number;

  @Column({ name: 'total_bytes', type: 'bigint', default: 0, transformer: bigintToNumber })
  totalBytes!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
