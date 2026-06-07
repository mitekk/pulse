import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TimelineService } from './timeline.service';
import type { PostDto } from '../posts/dto/post.dto';

interface AuthUser {
  id: string;
}

interface PaginatedPosts {
  items: PostDto[];
  cursor: string | null;
  hasMore: boolean;
}

// ── TimelineController ────────────────────────────────────────────────────────

/**
 * TimelineController — HTTP endpoints for timeline feeds.
 *
 * Routes (under global prefix api/v1):
 *   GET /timeline/home              — Home feed (auth required)
 *   GET /timeline/hashtag/:tag      — Hashtag timeline (optional auth)
 *   GET /users/:handle/posts        — User posts tab
 *   GET /users/:handle/replies      — User replies tab
 *   GET /users/:handle/media        — User media tab
 *   GET /users/:handle/likes        — User likes tab (privacy-gated)
 */
@Controller()
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  // ── Home timeline ─────────────────────────────────────────────────────────

  @UseGuards(AuthGuard)
  @Get('timeline/home')
  async getHomeFeed(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedPosts> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.timelineService.getHomeFeed(user.id, isNaN(limit) ? 20 : limit, cursor);
  }

  // ── Hashtag timeline ──────────────────────────────────────────────────────

  @UseGuards(OptionalAuthGuard)
  @Get('timeline/hashtag/:tag')
  async getHashtagTimeline(
    @Param('tag') tag: string,
    @CurrentUser() user: AuthUser | null,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedPosts> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.timelineService.getHashtagTimeline(
      tag,
      user?.id ?? null,
      isNaN(limit) ? 20 : limit,
      cursor,
    );
  }

  // ── User timeline tabs ────────────────────────────────────────────────────

  @UseGuards(OptionalAuthGuard)
  @Get('users/:handle/posts')
  async getUserPosts(
    @Param('handle') handle: string,
    @CurrentUser() user: AuthUser | null,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedPosts> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.timelineService.getUserPosts(
      handle,
      user?.id ?? null,
      isNaN(limit) ? 20 : limit,
      cursor,
    );
  }

  @UseGuards(OptionalAuthGuard)
  @Get('users/:handle/replies')
  async getUserReplies(
    @Param('handle') handle: string,
    @CurrentUser() user: AuthUser | null,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedPosts> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.timelineService.getUserReplies(
      handle,
      user?.id ?? null,
      isNaN(limit) ? 20 : limit,
      cursor,
    );
  }

  @UseGuards(OptionalAuthGuard)
  @Get('users/:handle/media')
  async getUserMedia(
    @Param('handle') handle: string,
    @CurrentUser() user: AuthUser | null,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedPosts> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.timelineService.getUserMedia(
      handle,
      user?.id ?? null,
      isNaN(limit) ? 20 : limit,
      cursor,
    );
  }

  @UseGuards(OptionalAuthGuard)
  @Get('users/:handle/likes')
  async getUserLikes(
    @Param('handle') handle: string,
    @CurrentUser() user: AuthUser | null,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaginatedPosts> {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.timelineService.getUserLikes(
      handle,
      user?.id ?? null,
      isNaN(limit) ? 20 : limit,
      cursor,
    );
  }
}
