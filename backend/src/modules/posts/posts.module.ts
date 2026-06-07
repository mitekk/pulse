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
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

/**
 * PostsModule — posts CRUD, entity extraction, thread rendering, repost toggle.
 *
 * BullMQ queues registered here as PRODUCERS ONLY:
 *   - 'fanout' — triggers home-timeline fan-out (processor added in TimelineModule, Phase 5)
 *   - 'search' — triggers FTS index update (processor added in SearchModule, Phase 8)
 *
 * EngagementModule (Phase 4) will add the likes/bookmarks tables and fill in the
 * viewer flags (liked/reposted/bookmarked) that PostsService currently stubs as false.
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
  ],
  exports: [
    PostsService,
    EntityExtractorService,
    TypeOrmModule, // export entities for EngagementModule, TimelineModule, etc.
  ],
})
export class PostsModule {}
