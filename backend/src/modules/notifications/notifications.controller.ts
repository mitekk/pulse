import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { IsOptional, IsArray, IsString } from 'class-validator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

class MarkReadDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

/**
 * NotificationsController — REST endpoints for notifications.
 *
 * All routes require authentication.
 */
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/v1/notifications
   *
   * Returns aggregated notification items for the authenticated user.
   * Cursor-based pagination (cursor, limit query params).
   */
  @Get()
  async getNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.notificationsService.getNotifications(user.id, limit, cursor);
  }

  /**
   * GET /api/v1/notifications/unread-count
   *
   * Returns the unread notification badge count.
   * Authoritative source is Redis, reconciled from DB if cache miss.
   */
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  /**
   * POST /api/v1/notifications/read
   *
   * Mark notifications as read.
   *   - Body `{ ids: string[] }`: mark specific notification IDs.
   *   - Body `{}` or `{ ids: [] }`: mark ALL unread notifications.
   *
   * Returns `{ updated: number }`.
   */
  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Body() body: MarkReadDto) {
    return this.notificationsService.markRead(user.id, body.ids);
  }
}
