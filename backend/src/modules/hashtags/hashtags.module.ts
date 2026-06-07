import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { TrendsService } from './trends.service';
import { TrendsController } from './trends.controller';
import { TrendsRecomputeProcessor } from './trends-recompute.processor';
import { AuthModule } from '../auth/auth.module';

/**
 * HashtagsModule — trending hashtag counters, recompute cron, trends endpoint.
 *
 * Queue: `trends` (registered here as both producer and consumer)
 *   - `trends.recompute` cron job runs every 5 minutes
 *
 * Exports:
 *   - TrendsService — injected by PostsModule (via AppModule) to call incrementTags()
 *                     on post create inside entity extraction.
 *
 * TrendsService.incrementTags() is called from AppModule scope (or via a port)
 * to avoid a circular dependency with PostsModule.
 * The cleanest pattern: PostsModule emits a BullMQ job; HashtagsModule processes it.
 * For simplicity here, TrendsService is exported and injected into the entity-extractor
 * path via the PostsModule (which imports HashtagsModule, creating a one-way dep).
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'trends' }), AuthModule],
  controllers: [TrendsController],
  providers: [TrendsService, TrendsRecomputeProcessor],
  exports: [TrendsService],
})
export class HashtagsModule implements OnModuleInit {
  constructor(
    @InjectQueue('trends')
    private readonly trendsQueue: Queue,
  ) {}

  /**
   * Register the `trends.recompute` repeatable cron job.
   * Runs every 5 minutes. Idempotent — BullMQ deduplicates by jobId.
   */
  async onModuleInit(): Promise<void> {
    await this.trendsQueue.add(
      'trends.recompute',
      { jobType: 'recompute' },
      {
        repeat: {
          pattern: '*/5 * * * *', // every 5 minutes
        },
        jobId: 'trends.recompute.cron',
      },
    );
  }
}
