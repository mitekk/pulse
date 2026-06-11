import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { UsersModule } from '../users/users.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

/**
 * SeoModule — server-rendered crawler artifacts (dynamic rendering for
 * social scrapers, sitemap.xml, robots.txt).
 *
 * Imports PostsModule + UsersModule for PostsService/UsersService and the
 * re-exported Post/User repositories (via their exported TypeOrmModule).
 */
@Module({
  imports: [PostsModule, UsersModule],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
