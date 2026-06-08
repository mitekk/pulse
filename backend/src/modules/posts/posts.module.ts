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
import { TRENDS_INCREMENT_PORT } from './trends-increment.port';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { HashtagsModule } from '../hashtags/hashtags.module';
import { TrendsService } from '../hashtags/trends.service';
import { EngagementModule } from '../engagement/engagement.module';

/**
 * PostsModule — posts CRUD, entity extraction, thread rendering, repost toggle.
 *
 * BullMQ queues registered here as PRODUCERS ONLY:
 *   - 'fanout' — triggers home-timeline fan-out (processor added in TimelineModule, Phase 5)
 *   - 'search' — triggers FTS index update (processor added in SearchModule, Phase 8)
 *
 * Port tokens resolved from @Global modules (no local bindings in providers[]):
 *   - VIEWER_FLAGS_PORT  → ViewerFlagsAdapter   (EngagementModule, imported above)
 *   - MEDIA_ATTACH_PORT  → MediaAttachAdapter   (@Global MediaModule)
 *   - POSTS_NOTIFICATION_PORT → RealPostsNotificationService (@Global NotificationsModule)
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
    // TrendsService (real TRENDS_INCREMENT_PORT impl) — no posts dependency, no cycle
    HashtagsModule,
    // Real VIEWER_FLAGS_PORT (ViewerFlagsAdapter). EngagementModule no longer
    // imports PostsModule, so this import is one-directional (no cycle).
    EngagementModule,
  ],
  controllers: [PostsController],
  providers: [
    PostsService,
    EntityExtractorService,
    // POSTS_NOTIFICATION_PORT, VIEWER_FLAGS_PORT, and MEDIA_ATTACH_PORT all resolve
    // from their respective @Global modules (NotificationsModule, EngagementModule,
    // MediaModule → MediaAttachAdapter) — no local bindings needed.
    // Real trending: increment hashtag scores in Redis on post create.
    {
      provide: TRENDS_INCREMENT_PORT,
      useExisting: TrendsService,
    },
  ],
  exports: [
    PostsService,
    EntityExtractorService,
    TypeOrmModule, // export entities for EngagementModule, TimelineModule, etc.
    TRENDS_INCREMENT_PORT,
  ],
})
export class PostsModule {}
