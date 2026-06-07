import { Controller, Get, UseGuards } from '@nestjs/common';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { TrendsService } from './trends.service';

/**
 * GET /api/v1/trends
 *
 * Returns the cached trending hashtags payload.
 * Public endpoint — no auth required.
 */
@Controller()
export class TrendsController {
  constructor(private readonly trendsService: TrendsService) {}

  @Get('trends')
  @UseGuards(OptionalAuthGuard)
  async getTrends() {
    const trends = await this.trendsService.getTrends();
    return { trends };
  }
}
