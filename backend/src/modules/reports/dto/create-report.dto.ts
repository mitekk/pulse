import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ReportReason, ReportTargetType } from '../report.entity';

export class CreateReportDto {
  @IsEnum(['post', 'user'])
  targetType!: ReportTargetType;

  @IsString()
  @MaxLength(40)
  targetId!: string;

  @IsEnum(['spam', 'harassment', 'hate_speech', 'misinformation', 'other'])
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
