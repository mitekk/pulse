import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { TimelineService } from './timeline.service';

/**
 * TimelineTrimProcessor — consumes `timeline.trim` jobs.
 *
 * Scheduled as a repeatable cron (daily) by TimelineModule.onModuleInit().
 * Iterates all users in batches and trims their home:{userId} zset to
 * HOME_TIMELINE_CAP (800) entries.
 *
 * This prevents memory growth from old fan-out entries. Normal fan-out
 * jobs already trim on write via ZREMRANGEBYRANK; this cron catches
 * any stragglers (e.g., entries added before the cap was enforced).
 */
@Processor('timeline')
export class TimelineTrimProcessor extends WorkerHost {
  private readonly logger = new Logger(TimelineTrimProcessor.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly timelineService: TimelineService,
  ) {
    super();
  }

  async process(job: Job<{ jobType?: string }>): Promise<void> {
    if (job.name !== 'timeline.trim') return;

    this.logger.log('timeline.trim: starting home zset cap enforcement');

    const batchSize = 500;
    let offset = 0;
    let totalTrimmed = 0;

    while (true) {
      const users = await this.userRepo.find({
        select: ['id'],
        take: batchSize,
        skip: offset,
        withDeleted: false,
      });

      if (users.length === 0) break;

      for (const u of users) {
        await this.timelineService.trimHomeZset(u.id);
        totalTrimmed++;
      }

      offset += batchSize;
      if (users.length < batchSize) break;
    }

    this.logger.log(`timeline.trim: done — trimmed ${totalTrimmed} home zsets`);
  }
}
