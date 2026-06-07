import { Module, OnModuleInit, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Like } from './like.entity';
import { Bookmark } from './bookmark.entity';
import { Post } from '../posts/post.entity';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';
import { ViewerFlagsService } from './viewer-flags.service';
import { ViewerFlagsAdapter } from './viewer-flags.adapter';
import { CountersReconcileProcessor } from './counters-reconcile.processor';
import { NoopPostsNotificationService } from '../posts/noop-posts-notification.service';
import { POSTS_NOTIFICATION_PORT } from '../posts/posts-notification.port';
import { VIEWER_FLAGS_PORT } from '../posts/viewer-flags.port';
import { PostsModule } from '../posts/posts.module';
import { AuthModule } from '../auth/auth.module';

/**
 * EngagementModule — likes, bookmarks, viewer-flag hydration, counter reconciliation.
 *
 * @Global() so that ViewerFlagsService and the VIEWER_FLAGS_PORT override are available
 * to PostsModule (and future TimelineModule) without explicit re-imports.
 *
 * The VIEWER_FLAGS_PORT is provided here with ViewerFlagsAdapter (real implementation),
 * overriding the NoopViewerFlagsService declared in PostsModule. NestJS resolves
 * injection tokens in the module that owns the consumer — since PostsService is in
 * PostsModule scope, the global provider registered here takes precedence once this
 * module is loaded.
 *
 * Queues:
 *   - 'counters' queue: registered here with CountersReconcileProcessor.
 *     Repeatable job 'counters.reconcile' added in onModuleInit (every 10m by cron).
 *
 * Exports:
 *   - ViewerFlagsService — consumed by TimelineModule (Phase 5) for batch hydration.
 *   - EngagementService — consumed by other modules that need like/bookmark state.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Like, Bookmark, Post]),
    BullModule.registerQueue({ name: 'counters' }),
    AuthModule,
    PostsModule, // imports PostsModule to get Post entity + auth guards
  ],
  controllers: [EngagementController],
  providers: [
    EngagementService,
    ViewerFlagsService,
    ViewerFlagsAdapter,
    CountersReconcileProcessor,
    {
      provide: POSTS_NOTIFICATION_PORT,
      useClass: NoopPostsNotificationService,
    },
    // Override the noop from PostsModule — global scope means this wins
    {
      provide: VIEWER_FLAGS_PORT,
      useClass: ViewerFlagsAdapter,
    },
  ],
  exports: [ViewerFlagsService, EngagementService, VIEWER_FLAGS_PORT],
})
export class EngagementModule implements OnModuleInit {
  constructor(
    @InjectQueue('counters')
    private readonly countersQueue: Queue,
  ) {}

  /**
   * Register the repeatable cron job for counter reconciliation.
   * Runs every 10 minutes. Idempotent — BullMQ deduplicates by jobId.
   */
  async onModuleInit(): Promise<void> {
    await this.countersQueue.add(
      'counters.reconcile',
      { triggeredBy: 'cron' },
      {
        repeat: {
          pattern: '*/10 * * * *', // every 10 minutes
        },
        jobId: 'counters.reconcile.cron',
      },
    );
  }
}
