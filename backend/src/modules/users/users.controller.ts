import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { normalizeLimit } from '../../common/utils/pagination.util';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Profile ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/users/:handle
   * Returns the full ProfileDto including viewer relationship flags.
   * OptionalAuth: personalizes if authed, still returns public profiles if not.
   */
  @Get('users/:handle')
  @UseGuards(OptionalAuthGuard)
  async getProfile(
    @Param('handle') handle: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
  ) {
    return this.usersService.getProfile(handle, viewer?.id ?? null);
  }

  /**
   * PATCH /api/v1/users/me
   * Updates the authenticated user's profile.
   */
  @Patch('users/me')
  @UseGuards(AuthGuard)
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // ─── Followers / Following lists ───────────────────────────────────────────

  /**
   * GET /api/v1/users/:handle/followers
   */
  @Get('users/:handle/followers')
  @UseGuards(OptionalAuthGuard)
  async getFollowers(
    @Param('handle') handle: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit = 20,
  ) {
    return this.usersService.getFollowers(
      handle,
      viewer?.id ?? null,
      cursor,
      normalizeLimit(limit),
    );
  }

  /**
   * GET /api/v1/users/:handle/following
   */
  @Get('users/:handle/following')
  @UseGuards(OptionalAuthGuard)
  async getFollowing(
    @Param('handle') handle: string,
    @CurrentUser() viewer: AuthenticatedUser | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit = 20,
  ) {
    return this.usersService.getFollowing(
      handle,
      viewer?.id ?? null,
      cursor,
      normalizeLimit(limit),
    );
  }

  // ─── Follow / Unfollow ─────────────────────────────────────────────────────

  /**
   * POST /api/v1/users/:handle/follow
   * Follow a user. Returns { state: 'active' | 'pending' } 201.
   * Rate limited to ~400/day per spec §15.
   */
  @Post('users/:handle/follow')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ max: 400, windowSecs: 86400, keyPrefix: 'follow' })
  async follow(@Param('handle') handle: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.follow(user.id, handle);
  }

  /**
   * DELETE /api/v1/users/:handle/follow
   * Unfollow a user or cancel a pending follow request. Returns 204.
   */
  @Delete('users/:handle/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async unfollow(@Param('handle') handle: string, @CurrentUser() user: AuthenticatedUser) {
    await this.usersService.unfollow(user.id, handle);
  }

  // ─── Block / Unblock ───────────────────────────────────────────────────────

  /**
   * POST /api/v1/users/:handle/block
   * Block a user. Removes follow relationships in both directions. Returns 201.
   */
  @Post('users/:handle/block')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async block(@Param('handle') handle: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.block(user.id, handle);
  }

  /**
   * DELETE /api/v1/users/:handle/block
   * Unblock a user. Returns 204.
   */
  @Delete('users/:handle/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async unblock(@Param('handle') handle: string, @CurrentUser() user: AuthenticatedUser) {
    await this.usersService.unblock(user.id, handle);
  }

  // ─── Mute / Unmute ────────────────────────────────────────────────────────

  /**
   * POST /api/v1/users/:handle/mute
   * Mute a user. Returns 201.
   */
  @Post('users/:handle/mute')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  async mute(@Param('handle') handle: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.mute(user.id, handle);
  }

  /**
   * DELETE /api/v1/users/:handle/mute
   * Unmute a user. Returns 204.
   */
  @Delete('users/:handle/mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async unmute(@Param('handle') handle: string, @CurrentUser() user: AuthenticatedUser) {
    await this.usersService.unmute(user.id, handle);
  }

  // ─── Follow Requests ──────────────────────────────────────────────────────

  /**
   * GET /api/v1/follow-requests
   * Lists incoming pending follow requests for the authenticated user.
   */
  @Get('follow-requests')
  @UseGuards(AuthGuard)
  async getFollowRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit = 20,
  ) {
    return this.usersService.getFollowRequests(user.id, cursor, normalizeLimit(limit));
  }

  /**
   * POST /api/v1/follow-requests/:id/accept
   * Accept a pending follow request. Returns 200 { state: 'active' }.
   */
  @Post('follow-requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async acceptFollowRequest(
    @Param('id') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.acceptFollowRequest(user.id, requestId);
  }

  /**
   * POST /api/v1/follow-requests/:id/decline
   * Decline a pending follow request. Returns 200 { state: 'declined' }.
   */
  @Post('follow-requests/:id/decline')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async declineFollowRequest(
    @Param('id') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.declineFollowRequest(user.id, requestId);
  }
}
