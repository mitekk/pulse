import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { UploadUrlDto } from './dto/upload-url.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/auth.service';
import type { MediaDto } from './dto/media.dto';
import type { PresignedPost } from '../../infra/storage/storage.port';

@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * POST /api/v1/media/upload-url
   * Reserve quota, create a pending media row, return a presigned POST (policy
   * enforces per-file size + content-type at the edge).
   */
  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  async createUploadUrl(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UploadUrlDto,
  ): Promise<{ mediaId: string; upload: PresignedPost }> {
    return this.mediaService.createUploadUrl(user.sub, dto);
  }

  /**
   * POST /api/v1/media/:id/finalize
   * Owner-only. Enqueue media.process job. Returns current MediaDto.
   */
  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  async finalize(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<{ media: MediaDto }> {
    const media = await this.mediaService.finalize(id, user.sub);
    return { media };
  }

  /**
   * GET /api/v1/media/:id
   * Owner-only. Returns current MediaDto (check status to poll readiness).
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ): Promise<{ media: MediaDto }> {
    const media = await this.mediaService.findOne(id, user.sub);
    return { media };
  }

  /**
   * PATCH /api/v1/media/:id
   * Owner-only. Update alt text.
   */
  @Patch(':id')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateMediaDto,
  ): Promise<{ media: MediaDto }> {
    const media = await this.mediaService.updateAltText(id, user.sub, dto);
    return { media };
  }
}
