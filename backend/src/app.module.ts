import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { validate } from './core/config';
import { DatabaseModule } from './infra/database/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { QueueModule } from './infra/queue/queue.module';
import { StorageModule } from './infra/storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PostsModule } from './modules/posts/posts.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { MediaModule } from './modules/media/media.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SearchModule } from './modules/search/search.module';
import { HashtagsModule } from './modules/hashtags/hashtags.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { REALTIME_PUBLISHER_PORT } from './modules/timeline/realtime-publisher.port';
import { RealtimePublisherService } from './modules/realtime/realtime-publisher.service';
import { NOTIFICATION_PORT } from './modules/users/notification.port';
import { POSTS_NOTIFICATION_PORT } from './modules/posts/posts-notification.port';
import { DM_NOTIFICATION_PORT } from './modules/messaging/dm-notification.port';
import { TRENDS_INCREMENT_PORT } from './modules/posts/trends-increment.port';
import { VIEWER_FLAGS_PORT } from './modules/posts/viewer-flags.port';
import { RealNotificationService } from './modules/notifications/real-notification.service';
import { RealPostsNotificationService } from './modules/notifications/real-posts-notification.service';
import { RealDmNotificationService } from './modules/notifications/real-dm-notification.service';
import { TrendsService } from './modules/hashtags/trends.service';
import { ViewerFlagsAdapter } from './modules/engagement/viewer-flags.adapter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    RedisModule,
    QueueModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PostsModule,
    EngagementModule,
    TimelineModule,
    MediaModule,
    MessagingModule,
    RealtimeModule,
    NotificationsModule,
    HashtagsModule,
    SearchModule,
    ReportsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Override the noop RealtimePublisher from TimelineModule with the real Socket.IO publisher.
    {
      provide: REALTIME_PUBLISHER_PORT,
      useExisting: RealtimePublisherService,
    },
    // Override noop notification seams with real implementations from NotificationsModule.
    // NestJS resolves AppModule-level providers last, so these win over the noop defaults
    // declared in UsersModule, PostsModule, and MessagingModule.
    {
      provide: NOTIFICATION_PORT,
      useExisting: RealNotificationService,
    },
    {
      provide: POSTS_NOTIFICATION_PORT,
      useExisting: RealPostsNotificationService,
    },
    {
      provide: DM_NOTIFICATION_PORT,
      useExisting: RealDmNotificationService,
    },
    // Override noop TrendsIncrementService with real TrendsService from HashtagsModule.
    {
      provide: TRENDS_INCREMENT_PORT,
      useExisting: TrendsService,
    },
    // Override noop ViewerFlagsService from PostsModule with the real ViewerFlagsAdapter
    // from EngagementModule. PostsModule declares a local noop provider which shadows the
    // @Global() EngagementModule export. AppModule-level providers win over child modules.
    {
      provide: VIEWER_FLAGS_PORT,
      useExisting: ViewerFlagsAdapter,
    },
  ],
})
export class AppModule {}
