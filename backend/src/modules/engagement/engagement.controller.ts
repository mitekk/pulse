import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EngagementService } from './engagement.service';

interface AuthUser {
  id: string;
  handle: string;
  sessionId: string;
}

@Controller()
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  // ── POST /api/v1/posts/:id/like ───────────────────────────────────────────────

  /**
   * Like a post. Idempotent.
   * Rate limit: 1000/day per user (spec §15).
   */
  @Post('posts/:id/like')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ max: 1000, windowSecs: 86400, keyPrefix: 'like' })
  @HttpCode(HttpStatus.CREATED)
  async like(@Param('id') postId: string, @CurrentUser() user: AuthUser) {
    return this.engagementService.like(user.id, postId);
  }

  // ── DELETE /api/v1/posts/:id/like ────────────────────────────────────────────

  @Delete('posts/:id/like')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async unlike(@Param('id') postId: string, @CurrentUser() user: AuthUser) {
    return this.engagementService.unlike(user.id, postId);
  }

  // ── POST /api/v1/posts/:id/bookmark ──────────────────────────────────────────

  @Post('posts/:id/bookmark')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async bookmark(@Param('id') postId: string, @CurrentUser() user: AuthUser) {
    return this.engagementService.bookmark(user.id, postId);
  }

  // ── DELETE /api/v1/posts/:id/bookmark ────────────────────────────────────────

  @Delete('posts/:id/bookmark')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async unbookmark(@Param('id') postId: string, @CurrentUser() user: AuthUser) {
    return this.engagementService.unbookmark(user.id, postId);
  }

  // ── GET /api/v1/posts/:id/likes ───────────────────────────────────────────────
  // Replaces the stub in PostsController (stub still exists but is superseded
  // because EngagementModule takes over via PostsService injection below)

  @Get('posts/:id/likes')
  @UseGuards(OptionalAuthGuard)
  async getLikes(
    @Param('id') postId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const lim = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.engagementService.getLikes(postId, user?.id ?? null, lim, cursor);
  }

  // ── GET /api/v1/bookmarks ─────────────────────────────────────────────────────

  @Get('bookmarks')
  @UseGuards(AuthGuard)
  async getBookmarks(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const lim = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.engagementService.getBookmarks(user?.id ?? '', lim, cursor);
  }
}
