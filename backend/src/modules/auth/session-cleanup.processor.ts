import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Job } from 'bullmq';
import { Session } from './session.entity';

export interface SessionCleanupJobData {
  jobType: 'cleanup';
}

/**
 * SessionCleanupProcessor — BullMQ processor for the `sessions` queue.
 *
 * Handles `session.cleanup` job (cron, every 6 hours).
 *
 * Deletes sessions that are either:
 *   1. Expired (expires_at < NOW())
 *   2. Revoked more than 30 days ago (revoked_at < NOW() - 30 days)
 *
 * Keeps active sessions and recently-revoked sessions (needed for
 * token-reuse detection: a revoked session must exist to detect reuse).
 */
@Processor('sessions')
export class SessionCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(SessionCleanupProcessor.name);

  /** Keep revoked sessions for 30 days (token-reuse detection window) */
  private static readonly REVOKED_RETENTION_DAYS = 30;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
  ) {
    super();
  }

  async process(job: Job<SessionCleanupJobData>): Promise<void> {
    if (job.name !== 'session.cleanup') {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const now = new Date();
    const revokedCutoff = new Date(
      now.getTime() - SessionCleanupProcessor.REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    // Delete expired sessions (regardless of revocation status)
    const expiredResult = await this.sessionRepo
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now })
      .execute();

    // Delete old revoked sessions (already passed the retention window)
    const revokedResult = await this.sessionRepo
      .createQueryBuilder()
      .delete()
      .where('revoked_at IS NOT NULL')
      .andWhere('revoked_at < :cutoff', { cutoff: revokedCutoff })
      .execute();

    const expiredCount = expiredResult.affected ?? 0;
    const revokedCount = revokedResult.affected ?? 0;

    this.logger.log(
      `Session cleanup: deleted ${expiredCount} expired + ${revokedCount} old-revoked sessions`,
    );
  }
}
