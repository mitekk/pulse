import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './report.entity';
import { CreateReportDto } from './dto/create-report.dto';
import type { ReportDto } from './dto/report.dto';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
  ) {}

  /**
   * Create a new abuse report.
   * Store-only — no side effects (no notification, no automated action).
   * Deduplication note: same reporter + same target + same reason is allowed
   * (spec says store-only; admin tooling de-dupes).
   */
  async create(reporterId: string, dto: CreateReportDto): Promise<ReportDto> {
    const report = new Report();
    report.id = SnowflakeUtil.instance.generate();
    report.reporterId = reporterId;
    report.targetType = dto.targetType;
    report.targetId = dto.targetId;
    report.reason = dto.reason;
    report.description = dto.description ?? null;

    const saved = await this.reportRepo.save(report);

    this.logger.log(
      `Report created id=${saved.id} reporter=${reporterId} target=${dto.targetType}:${dto.targetId} reason=${dto.reason}`,
    );

    return this.toDto(saved);
  }

  private toDto(report: Report): ReportDto {
    return {
      id: report.id,
      reporterId: report.reporterId,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      description: report.description,
      createdAt: report.createdAt.toISOString(),
    };
  }
}
