import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SEARCH_PORT } from './search.port';
import { PostgresSearchAdapter } from './postgres-search.adapter';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchIndexProcessor } from './search.index.processor';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PostsModule } from '../posts/posts.module';
import { TimelineModule } from '../timeline/timeline.module';

/**
 * SearchModule — FTS search, typeahead, search.index BullMQ processor.
 *
 * Queue: `search` — processor for `search.index` jobs.
 * The queue is registered as a producer in PostsModule; registering it here
 * as a consumer does NOT cause a conflict.
 *
 * SearchPort bound to PostgresSearchAdapter (swap seam per ADR-0005).
 *
 * Exports:
 *   - SearchService — in case other modules need search capability
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'search' }),
    AuthModule,
    UsersModule,
    PostsModule,
    TimelineModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchIndexProcessor,
    {
      provide: SEARCH_PORT,
      useClass: PostgresSearchAdapter,
    },
  ],
  exports: [SearchService],
})
export class SearchModule {}
