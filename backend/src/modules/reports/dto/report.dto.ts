import type { ReportReason, ReportTargetType } from '../report.entity';

export interface ReportDto {
  id: string;
  reporterId: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description: string | null;
  createdAt: string;
}
