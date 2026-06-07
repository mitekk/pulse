import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Post } from './post.entity';
import { Mention } from './mention.entity';
import { Hashtag } from './hashtag.entity';
import { PostHashtag } from './post-hashtag.entity';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { EntityExtractorService } from './entity-extractor.service';
import { NoopPostsNotificationService } from './noop-posts-notification.service';
import { POSTS_NOTIFICATION_PORT } from './posts-notification.port';
import { NoopViewerFlagsService } from './noop-viewer-flags.service';
import { VIEWER_FLAGS_PORT } from './viewer-flags.port';
import { NoopMediaAttachService } from './noop-media-attach.service';
import { MEDIA_ATTACH_PORT } from './media-attach.port';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

/**
 * PostsModule — posts CRUD, entity extraction, thread rendering, repost toggle.
 *
 * BullMQ queues registered here as PRODUCERS ONLY:
 *   - 'fanout' — triggers home-timeline fan-out (processor added in TimelineModule, Phase 5)
 *   - 'search' — triggers FTS index update (processor added in SearchModule, Phase 8)
 *
 * VIEWER_FLAGS_PORT defaults to NoopViewerFlagsService (all flags false).
 * EngagementModule overrides this in AppModule by providing ViewerFlagsAdapter,
 * which delegates to ViewerFlagsService (Redis sets + DB fallback).
 *
 * The override pattern: PostsService injects VIEWER_FLAGS_PORT; when EngagementModule
 * is imported in AppModule after PostsModule, NestJS resolves the token to the last
 * provider. To properly override, we use module-level re-export of the token and
 * EngagementModule provides its adapter in AppModule scope.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Mention, Hashtag, PostHashtag]),
    // Queues — producer only; processors registered in their owning modules
    BullModule.registerQueue({ name: 'fanout' }),
    BullModule.registerQueue({ name: 'search' }),
    // Guards + JWT
    AuthModule,
    // VisibilityService, Follow/Block/Mute entities
    UsersModule,
  ],
  controllers: [PostsController],
  providers: [
    PostsService,
    EntityExtractorService,
    {
      provide: POSTS_NOTIFICATION_PORT,
      useClass: NoopPostsNotificationService,
    },
    {
      provide: VIEWER_FLAGS_PORT,
      useClass: NoopViewerFlagsService,
    },
    {
      provide: MEDIA_ATTACH_PORT,
      useClass: NoopMediaAttachService,
    },
  ],
  exports: [
    PostsService,
    EntityExtractorService,
    TypeOrmModule, // export entities for EngagementModule, TimelineModule, etc.
    VIEWER_FLAGS_PORT, // exported so EngagementModule can override in consuming modules
    MEDIA_ATTACH_PORT, // exported so MediaModule can override in global scope
  ],
})
export class PostsModule {}
