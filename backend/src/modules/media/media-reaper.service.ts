import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Media } from './media.entity';
import { PostMedia } from './post-media.entity';
import { STORAGE_PORT, StoragePort } from '../../infra/storage/storage.port';
import { QuotaService } from './quota.service';

/** Pending uploads that never finalized (upload-url expiry 15m + 15m grace). */
const PENDING_TTL_MS = 30 * 60 * 1000;
/** Ready media never attached to a post (composed then abandoned). */
const UNATTACHED_TTL_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Reaps orphaned media so the global-cap accounting stays honest:
 *  - pending rows past TTL (upload abandoned before finalize)
 *  - ready rows with no post_media past TTL (composed but post never created)
 * Deletes objects + rows and releases the reserved bytes.
 *
 * Self-scheduled on an interval (single-node deployment). The sweep logic is a
 * public method so it can be invoked directly in tests.
 */
@Injectable()
export class MediaReaperService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MediaReaperService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(Media) private readonly mediaRepo: Repository<Media>,
    @InjectRepository(PostMedia) private readonly postMediaRepo: Repository<PostMedia>,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly quota: QuotaService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env['NODE_ENV'] === 'test') return; // tests drive sweep() directly
    this.timer = setInterval(() => {
      void this.sweep().catch((err) => this.logger.error(`Sweep failed: ${String(err)}`));
    }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One reap pass. Returns the number of media rows removed. */
  async sweep(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const pending = await this.reapPendingExpired(now);
      const unattached = await this.reapReadyUnattached(now);
      const total = pending + unattached;
      if (total > 0)
        this.logger.log(
          `Reaped ${total} orphan media (${pending} pending, ${unattached} unattached)`,
        );
      return total;
    } finally {
      this.running = false;
    }
  }

  private async reapPendingExpired(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - PENDING_TTL_MS);
    const rows = await this.mediaRepo.find({
      where: { status: 'pending', createdAt: LessThan(cutoff) },
      take: 500,
    });
    for (const m of rows) await this.purge(m);
    return rows.length;
  }

  private async reapReadyUnattached(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - UNATTACHED_TTL_MS);
    // ready media with no post_media row, older than the grace window
    const rows = await this.mediaRepo
      .createQueryBuilder('m')
      .leftJoin(PostMedia, 'pm', 'pm.media_id = m.id')
      .where('m.status = :status', { status: 'ready' })
      .andWhere('m.created_at < :cutoff', { cutoff })
      .andWhere('pm.media_id IS NULL')
      .take(500)
      .getMany();
    for (const m of rows) await this.purge(m);
    return rows.length;
  }

  /** Delete the original + all variant objects, remove the row, release bytes. */
  private async purge(media: Media): Promise<void> {
    const keys = new Set<string>();
    if (media.storageKey) keys.add(media.storageKey);
    for (const v of Object.values(media.variants ?? {})) if (v) keys.add(v);
    for (const key of keys) {
      await this.storage
        .deleteObject(key)
        .catch((err) => this.logger.warn(`Failed to delete ${key}: ${String(err)}`));
    }
    await this.mediaRepo.delete(media.id);
    await this.quota.release(media.byteSize);
  }
}
