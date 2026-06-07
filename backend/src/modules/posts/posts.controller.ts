import {
  Body,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';

interface AuthUser {
  id: string;
  handle: string;
  sessionId: string;
}

@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // ── POST /api/v1/posts ─────────────────────────────────────────────────────

  @Post('posts')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ max: 300, windowSecs: 10800, keyPrefix: 'post' })
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    const post = await this.postsService.create(user.id, dto);
    return { post };
  }

  // ── GET /api/v1/posts/:id ──────────────────────────────────────────────────

  @Get('posts/:id')
  @UseGuards(OptionalAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const post = await this.postsService.findOne(id, user?.id ?? null);
    return { post };
  }

  // ── DELETE /api/v1/posts/:id ───────────────────────────────────────────────

  @Delete('posts/:id')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<void> {
    await this.postsService.softDelete(id, user.id);
  }

  // ── GET /api/v1/posts/:id/thread ──────────────────────────────────────────

  @Get('posts/:id/thread')
  @UseGuards(OptionalAuthGuard)
  async getThread(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const lim = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.postsService.getThread(id, user?.id ?? null, lim, cursor);
  }

  // ── GET /api/v1/posts/:id/replies ─────────────────────────────────────────

  @Get('posts/:id/replies')
  @UseGuards(OptionalAuthGuard)
  async getReplies(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const lim = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.postsService.getReplies(id, user?.id ?? null, lim, cursor);
  }

  // ── GET /api/v1/posts/:id/reposts ─────────────────────────────────────────

  @Get('posts/:id/reposts')
  @UseGuards(OptionalAuthGuard)
  async getReposts(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const lim = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.postsService.getReposts(id, user?.id ?? null, lim, cursor);
  }

  // ── GET /api/v1/posts/:id/quotes ──────────────────────────────────────────

  @Get('posts/:id/quotes')
  @UseGuards(OptionalAuthGuard)
  async getQuotes(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const lim = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.postsService.getQuotes(id, user?.id ?? null, lim, cursor);
  }

  // ── GET /api/v1/posts/:id/likes ───────────────────────────────────────────

  @Get('posts/:id/likes')
  @UseGuards(OptionalAuthGuard)
  async getLikes(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const lim = Math.min(parseInt(limit ?? '20', 10) || 20, 100);
    return this.postsService.getLikes(id, user?.id ?? null, lim, cursor);
  }

  // ── POST /api/v1/posts/:id/repost ─────────────────────────────────────────

  @Post('posts/:id/repost')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async repost(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.postsService.repost(user.id, id);
  }

  // ── DELETE /api/v1/posts/:id/repost ───────────────────────────────────────

  @Delete('posts/:id/repost')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async unrepost(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.postsService.unrepost(user.id, id);
  }
}
