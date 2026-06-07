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
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { REALTIME_PUBLISHER_PORT } from './modules/timeline/realtime-publisher.port';
import { RealtimePublisherService } from './modules/realtime/realtime-publisher.service';

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
    // Future: NotificationsModule, SearchModule, HashtagsModule
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
    // RealtimePublisherService is provided by RealtimeModule and exported; AppModule re-binds
    // the REALTIME_PUBLISHER_PORT token so FanoutProcessor and any other caller gets the real impl.
    {
      provide: REALTIME_PUBLISHER_PORT,
      useExisting: RealtimePublisherService,
    },
  ],
})
export class AppModule {}
