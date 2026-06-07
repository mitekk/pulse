import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { TrendsService } from './trends.service';

export interface TrendsRecomputeJobData {
  jobType: 'recompute';
}

/**
 * TrendsRecomputeProcessor — BullMQ processor for the `trends` queue.
 *
 * Handles `trends.recompute` job (cron, every 5 minutes).
 * Delegates to TrendsService.recomputeTrends().
 */
@Processor('trends')
export class TrendsRecomputeProcessor extends WorkerHost {
  private readonly logger = new Logger(TrendsRecomputeProcessor.name);

  constructor(private readonly trendsService: TrendsService) {
    super();
  }

  async process(job: Job<TrendsRecomputeJobData>): Promise<void> {
    if (job.name === 'trends.recompute') {
      this.logger.log('Running trends recompute job');
      await this.trendsService.recomputeTrends();
    } else {
      this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
