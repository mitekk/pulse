import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Media } from './media.entity';
import { StorageUsage } from './storage-usage.entity';
import { MediaLimits } from './media-limits';

/** Statuses that count toward the global cap (reserved or committed, not failed). */
const LIVE_STATUSES = ['pending', 'processing', 'ready'];

/**
 * Source of truth for total bytes in object storage: a single counter row
 * (storage_usage id=1) mutated by atomic SQL. `reserve` is a compare-and-set so
 * concurrent uploads cannot collectively exceed the cap. Periodically reconciled
 * against SUM(media.byte_size) to correct drift from crashes.
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    @InjectRepository(StorageUsage) private readonly usageRepo: Repository<StorageUsage>,
    @InjectRepository(Media) private readonly mediaRepo: Repository<Media>,
    private readonly limits: MediaLimits,
  ) {}

  /**
   * Atomically reserve `bytes` against the global cap. Rejects with 507 if the
   * reservation would exceed the cap. Logs a soft-warning past the threshold.
   */
  async reserve(bytes: number): Promise<void> {
    const cap = this.limits.globalCapBytes;
    const rows: Array<{ total_bytes: string }> = await this.usageRepo.query(
      `UPDATE storage_usage
          SET total_bytes = total_bytes + $1, updated_at = NOW()
        WHERE id = 1 AND total_bytes + $1 <= $2
      RETURNING total_bytes`,
      [bytes, cap],
    );

    if (rows.length === 0) {
      throw new HttpException(
        {
          error: {
            code: 'STORAGE_CAP_EXCEEDED',
            message: 'Storage capacity reached. Please try again later.',
          },
        },
        HttpStatus.INSUFFICIENT_STORAGE, // 507
      );
    }

    const total = Number(rows[0].total_bytes);
    if (total >= this.limits.softThresholdBytes) {
      this.logger.warn(`Storage at ${Math.round((total / cap) * 100)}% (${total}/${cap} bytes)`);
    }
  }

  /** Apply a signed delta to the counter (e.g. commit actual−reserved); clamped at ≥ 0. */
  async adjust(deltaBytes: number): Promise<void> {
    if (deltaBytes === 0) return;
    await this.usageRepo.query(
      `UPDATE storage_usage
          SET total_bytes = GREATEST(0, total_bytes + $1), updated_at = NOW()
        WHERE id = 1`,
      [deltaBytes],
    );
  }

  /** Release previously reserved/committed bytes. */
  async release(bytes: number): Promise<void> {
    if (bytes > 0) await this.adjust(-bytes);
  }

  async currentUsage(): Promise<number> {
    const row = await this.usageRepo.findOne({ where: { id: 1 } });
    return row?.totalBytes ?? 0;
  }

  /** Recompute the counter from live media rows — drift correction / backup seam. */
  async reconcile(): Promise<number> {
    const raw = await this.mediaRepo
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.byte_size), 0)', 'sum')
      .where('m.status IN (:...statuses)', { statuses: LIVE_STATUSES })
      .getRawOne<{ sum: string }>();
    const total = Number(raw?.sum ?? 0);
    await this.usageRepo.query(
      `UPDATE storage_usage SET total_bytes = $1, updated_at = NOW() WHERE id = 1`,
      [total],
    );
    this.logger.log(`Reconciled storage usage to ${total} bytes`);
    return total;
  }
}
