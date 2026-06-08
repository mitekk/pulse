import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Post } from '../posts/post.entity';
import { Hashtag } from '../posts/hashtag.entity';
import { PostHashtag } from '../posts/post-hashtag.entity';
import { User } from '../users/user.entity';
import { Follow } from '../users/follow.entity';
import { Like } from '../engagement/like.entity';
import { TimelineService } from './timeline.service';
import { TimelineController } from './timeline.controller';
import { FanoutProcessor } from './fanout.processor';
import { TimelineTrimProcessor } from './timeline-trim.processor';
import { PostCacheService } from './post-cache.service';
import { REALTIME_PUBLISHER_PORT } from './realtime-publisher.port';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { PostsModule } from '../posts/posts.module';
import { UsersModule } from '../users/users.module';
import { EngagementModule } from '../engagement/engagement.module';
import { AuthModule } from '../auth/auth.module';

/**
 * TimelineModule — home feed fan-out, user tabs, hashtag timeline, post cache.
 *
 * Queues consumed here:
 *   - 'fanout' queue: FanoutProcessor handles `fanout.post` jobs
 *   - 'timeline' queue: TimelineTrimProcessor handles `timeline.trim` jobs
 *
 * Queue 'fanout' was registered as a producer in PostsModule; consuming it
 * here does NOT cause a double-registration conflict — BullMQ/BullModule
 * registers the queue once per process and the processor is added as a worker.
 *
 * REALTIME_PUBLISHER_PORT is bound to the live RealtimePublisherService singleton
 * via `useExisting`. RealtimeModule is `@Global`, so the singleton is resolvable
 * here without importing RealtimeModule (which would create a cycle). Timeline
 * "new posts" pills are now pushed live over WebSockets.
 *
 * Exports:
 *   - TimelineService, PostCacheService
 *   - REALTIME_PUBLISHER_PORT
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Hashtag, PostHashtag, User, Follow, Like]),
    BullModule.registerQueue({ name: 'fanout' }),
    BullModule.registerQueue({ name: 'timeline' }),
    AuthModule,
    UsersModule,
    PostsModule,
    EngagementModule,
  ],
  controllers: [TimelineController],
  providers: [
    TimelineService,
    PostCacheService,
    FanoutProcessor,
    TimelineTrimProcessor,
    {
      provide: REALTIME_PUBLISHER_PORT,
      useExisting: RealtimePublisherService,
    },
  ],
  exports: [TimelineService, PostCacheService, REALTIME_PUBLISHER_PORT],
})
export class TimelineModule implements OnModuleInit {
  constructor(
    @InjectQueue('timeline')
    private readonly timelineQueue: Queue,
  ) {}

  /**
   * Register the repeatable cron job for home timeline trimming.
   * Runs daily at midnight UTC. Idempotent — BullMQ deduplicates by jobId.
   */
  async onModuleInit(): Promise<void> {
    await this.timelineQueue.add(
      'timeline.trim',
      { jobType: 'trim' },
      {
        repeat: {
          pattern: '0 0 * * *', // daily at midnight UTC
        },
        jobId: 'timeline.trim.cron',
      },
    );
  }
}
