/**
 * Integration test app bootstrap.
 *
 * Boots the full NestJS + Fastify app against a real Postgres + Redis.
 * Overrides the DatabaseModule to use explicit entity imports (not glob)
 * to avoid CJS/ESM boundary issues with TypeORM's glob-based entity loading.
 *
 * Usage:
 *   const app = await getApp();
 *   const http = supertest(app.getHttpServer());
 *   ...
 *   await closeApp();
 */
import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import fastifyCookie from '@fastify/cookie';
import { DataSource } from 'typeorm';

// ── Entity imports (explicit, no glob) ───────────────────────────────────────
import { User } from '../../../backend/src/modules/users/user.entity';
import { Follow } from '../../../backend/src/modules/users/follow.entity';
import { Block } from '../../../backend/src/modules/users/block.entity';
import { Mute } from '../../../backend/src/modules/users/mute.entity';
import { Post } from '../../../backend/src/modules/posts/post.entity';
import { Mention } from '../../../backend/src/modules/posts/mention.entity';
import { Hashtag } from '../../../backend/src/modules/posts/hashtag.entity';
import { PostHashtag } from '../../../backend/src/modules/posts/post-hashtag.entity';
import { Like } from '../../../backend/src/modules/engagement/like.entity';
import { Bookmark } from '../../../backend/src/modules/engagement/bookmark.entity';
import { Media } from '../../../backend/src/modules/media/media.entity';
import { PostMedia } from '../../../backend/src/modules/media/post-media.entity';
import { Session } from '../../../backend/src/modules/auth/session.entity';
import { EmailVerificationToken } from '../../../backend/src/modules/auth/email-verification-token.entity';
import { Conversation } from '../../../backend/src/modules/messaging/conversation.entity';
import { ConversationParticipant } from '../../../backend/src/modules/messaging/conversation-participant.entity';
import { ConversationDyad } from '../../../backend/src/modules/messaging/conversation-dyad.entity';
import { Message } from '../../../backend/src/modules/messaging/message.entity';
import { Notification } from '../../../backend/src/modules/notifications/notification.entity';
import { Report } from '../../../backend/src/modules/reports/report.entity';

// ── App module imports ────────────────────────────────────────────────────────
import { ConfigModule } from '@nestjs/config';
import { validate } from '../../../backend/src/core/config';
import { RedisModule } from '../../../backend/src/infra/redis/redis.module';
import { QueueModule } from '../../../backend/src/infra/queue/queue.module';
import { StorageModule } from '../../../backend/src/infra/storage/storage.module';
import { HealthModule } from '../../../backend/src/health/health.module';
import { AuthModule } from '../../../backend/src/modules/auth/auth.module';
import { UsersModule } from '../../../backend/src/modules/users/users.module';
import { PostsModule } from '../../../backend/src/modules/posts/posts.module';
import { EngagementModule } from '../../../backend/src/modules/engagement/engagement.module';
import { TimelineModule } from '../../../backend/src/modules/timeline/timeline.module';
import { MediaModule } from '../../../backend/src/modules/media/media.module';
import { MessagingModule } from '../../../backend/src/modules/messaging/messaging.module';
import { RealtimeModule } from '../../../backend/src/modules/realtime/realtime.module';
import { NotificationsModule } from '../../../backend/src/modules/notifications/notifications.module';
import { SearchModule } from '../../../backend/src/modules/search/search.module';
import { HashtagsModule } from '../../../backend/src/modules/hashtags/hashtags.module';
import { ReportsModule } from '../../../backend/src/modules/reports/reports.module';
import { AllExceptionsFilter } from '../../../backend/src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../../backend/src/common/interceptors/logging.interceptor';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { NOTIFICATION_PORT } from '../../../backend/src/modules/users/notification.port';
import { POSTS_NOTIFICATION_PORT } from '../../../backend/src/modules/posts/posts-notification.port';
import { DM_NOTIFICATION_PORT } from '../../../backend/src/modules/messaging/dm-notification.port';
import { TRENDS_INCREMENT_PORT } from '../../../backend/src/modules/posts/trends-increment.port';
import { VIEWER_FLAGS_PORT } from '../../../backend/src/modules/posts/viewer-flags.port';
import { RealNotificationService } from '../../../backend/src/modules/notifications/real-notification.service';
import { RealPostsNotificationService } from '../../../backend/src/modules/notifications/real-posts-notification.service';
import { RealDmNotificationService } from '../../../backend/src/modules/notifications/real-dm-notification.service';
import { NotificationsService } from '../../../backend/src/modules/notifications/notifications.service';
import { TrendsService } from '../../../backend/src/modules/hashtags/trends.service';
import { ViewerFlagsAdapter } from '../../../backend/src/modules/engagement/viewer-flags.adapter';

// ── Env setup — must happen before ConfigModule loads ─────────────────────────

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://tweeter:tweeter@localhost:5433/tweeter_test';
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6380';

process.env['DATABASE_URL'] = DATABASE_URL;
process.env['REDIS_URL'] = REDIS_URL;
process.env['NODE_ENV'] = 'test';
process.env['WEB_ORIGIN'] = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173';
process.env['MINIO_ENDPOINT'] = process.env['MINIO_ENDPOINT'] ?? 'localhost';
process.env['MINIO_ACCESS_KEY'] = process.env['MINIO_ACCESS_KEY'] ?? 'minioadmin';
process.env['MINIO_SECRET_KEY'] = process.env['MINIO_SECRET_KEY'] ?? 'minioadmin';
process.env['JWT_ACCESS_SECRET'] = process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-integration';
process.env['JWT_REFRESH_SECRET'] = process.env['JWT_REFRESH_SECRET'] ?? 'test-refresh-secret-integration';
process.env['JWT_ACCESS_EXPIRY'] = process.env['JWT_ACCESS_EXPIRY'] ?? '15m';
process.env['JWT_REFRESH_EXPIRY'] = process.env['JWT_REFRESH_EXPIRY'] ?? '30d';

// ── All entities explicitly listed (no glob) ──────────────────────────────────
const ALL_ENTITIES = [
  User, Follow, Block, Mute,
  Post, Mention, Hashtag, PostHashtag,
  Like, Bookmark,
  Media, PostMedia,
  Session, EmailVerificationToken,
  Conversation, ConversationParticipant, ConversationDyad, Message,
  Notification,
  Report,
];

// ── Singleton app across the test suite ──────────────────────────────────────

let appInstance: NestFastifyApplication | null = null;

export async function getApp(): Promise<NestFastifyApplication> {
  if (appInstance) return appInstance;

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validate,
        envFilePath: [],
      }),
      // Override DatabaseModule with explicit entity list (no glob)
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: DATABASE_URL,
        entities: ALL_ENTITIES,
        synchronize: false,
        migrationsRun: false,
        logging: false,
      }),
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
      SearchModule,
      HashtagsModule,
      ReportsModule,
    ],
    providers: [
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
      { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    ],
  })
  // Override all ports that have local Noop implementations in their owning modules.
  // NestJS module-local providers always shadow global exports, so we must use
  // overrideProvider() to force the real implementations across all modules.
  //
  // useFactory + inject resolves dependencies from the global DI context (all exported
  // services from all imported modules are available), bypassing the local module scope.
  //
  // NOTIFICATION_PORT: UsersModule defaults to NoopNotificationService → use RealNotificationService
  .overrideProvider(NOTIFICATION_PORT)
  .useFactory({
    factory: (notifService: NotificationsService) => new RealNotificationService(notifService),
    inject: [NotificationsService],
  })
  // POSTS_NOTIFICATION_PORT: PostsModule + EngagementModule default to Noop → use RealPostsNotificationService
  .overrideProvider(POSTS_NOTIFICATION_PORT)
  .useFactory({
    factory: (notifService: NotificationsService) =>
      new RealPostsNotificationService(notifService),
    inject: [NotificationsService],
  })
  // DM_NOTIFICATION_PORT: MessagingModule defaults to NoopDmNotificationService → use RealDmNotificationService
  .overrideProvider(DM_NOTIFICATION_PORT)
  .useFactory({
    factory: (notifService: NotificationsService) =>
      new RealDmNotificationService(notifService),
    inject: [NotificationsService],
  })
  // TRENDS_INCREMENT_PORT: PostsModule defaults to NoopTrendsIncrementService → use TrendsService
  .overrideProvider(TRENDS_INCREMENT_PORT)
  .useClass(TrendsService)
  // VIEWER_FLAGS_PORT: PostsModule defaults to NoopViewerFlagsService → use ViewerFlagsAdapter
  .overrideProvider(VIEWER_FLAGS_PORT)
  .useClass(ViewerFlagsAdapter)
  .compile();

  appInstance = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false, trustProxy: true }),
  );

  // Register cookie plugin (required by auth refresh / CSRF)
  await appInstance.register(fastifyCookie);

  // Mirror production validation pipe
  appInstance.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // All routes under /api/v1, health at root
  appInstance.setGlobalPrefix('api/v1', { exclude: ['health'] });

  await appInstance.init();

  // Wait for Fastify to be ready
  await appInstance.getHttpAdapter().getInstance().ready();

  return appInstance;
}

export async function getDataSource(): Promise<DataSource> {
  const app = await getApp();
  return app.get(DataSource);
}

export async function closeApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
  }
}

/**
 * Truncate all domain tables between tests for isolation.
 * Also flushes Redis to reset rate limits and caches.
 * Order matters: FK constraints require child-before-parent deletion.
 *
 * NOTE: A 100ms settle delay is added before truncation to let any
 * fire-and-forget async operations (notification writes, etc.) complete
 * before clearing the DB. Without this, async writes racing with truncate
 * can cause FK violations or leave stale data for the next test.
 */
export async function truncateAll(): Promise<void> {
  // Settle window for fire-and-forget async operations (notifications, fanout, etc.).
  // 300ms gives async writes time to complete before DB truncation to avoid FK violations.
  await new Promise<void>((resolve) => setTimeout(resolve, 300));

  const app = await getApp();
  const ds = await getDataSource();

  // Flush Redis to reset rate-limit counters, BullMQ keys, and cached data between
  // tests. Use flushall (not flushdb) so ALL Redis databases are cleared — the test
  // Redis is dedicated, and flushdb (db 0 only) lets state survive across repeated
  // local runs, which under the allkeys-lru/256mb cap can evict live keys mid-test
  // and produce spurious failures (e.g. intermittent 404s on post creation). CI uses
  // a fresh Redis per run so was unaffected; flushall makes local runs equally clean.
  const { RedisService } = await import('../../../backend/src/infra/redis/redis.service');
  const redisService = app.get(RedisService);
  await redisService.client.flushall();

  await ds.query(`
    TRUNCATE TABLE
      reports,
      notifications,
      conversation_participants,
      messages,
      conversation_dyads,
      conversations,
      post_media,
      media,
      bookmarks,
      likes,
      post_hashtags,
      hashtags,
      mentions,
      posts,
      mutes,
      blocks,
      follows,
      email_verification_tokens,
      sessions,
      users
    RESTART IDENTITY CASCADE
  `);
}
