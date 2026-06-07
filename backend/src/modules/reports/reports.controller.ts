import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

interface AuthUser {
  id: string;
  handle: string;
  sessionId: string;
}

@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * POST /api/v1/reports
   *
   * Submit an abuse report. Store-only.
   * Rate limit: 10 reports per hour per user (prevents spam reports).
   */
  @Post('reports')
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit({ max: 10, windowSecs: 3600, keyPrefix: 'report' })
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    const report = await this.reportsService.create(user.id, dto);
    return { report };
  }
}
