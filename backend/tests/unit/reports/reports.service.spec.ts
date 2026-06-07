import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportsService } from '../../../src/modules/reports/reports.service';
import type { Report } from '../../../src/modules/reports/report.entity';

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: '1234567890',
    reporterId: 'user-uuid-1',
    reporter: null,
    targetType: 'post',
    targetId: '999888777',
    reason: 'spam',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Report;
}

function makeRepoMock(savedEntity: Report) {
  return {
    save: vi.fn().mockResolvedValue(savedEntity),
    findOne: vi.fn(),
  };
}

describe('ReportsService', () => {
  let service: ReportsService;
  let repoMock: ReturnType<typeof makeRepoMock>;

  beforeEach(() => {
    const report = makeReport();
    repoMock = makeRepoMock(report);
    service = new ReportsService(repoMock as never);
  });

  it('creates and returns a ReportDto on valid input', async () => {
    const report = makeReport({ id: '42' });
    repoMock.save.mockResolvedValue(report);

    const result = await service.create('user-uuid-1', {
      targetType: 'post',
      targetId: '999888777',
      reason: 'spam',
    });

    expect(result.id).toBe('42');
    expect(result.reporterId).toBe('user-uuid-1');
    expect(result.targetType).toBe('post');
    expect(result.targetId).toBe('999888777');
    expect(result.reason).toBe('spam');
    expect(result.description).toBeNull();
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('includes description when provided', async () => {
    const report = makeReport({ description: 'This is spam content' });
    repoMock.save.mockResolvedValue(report);

    const result = await service.create('user-uuid-1', {
      targetType: 'post',
      targetId: '999',
      reason: 'spam',
      description: 'This is spam content',
    });

    expect(result.description).toBe('This is spam content');
  });

  it('persists reporter_id correctly', async () => {
    const report = makeReport({ reporterId: 'reporter-uuid' });
    repoMock.save.mockResolvedValue(report);

    await service.create('reporter-uuid', {
      targetType: 'user',
      targetId: 'target-uuid',
      reason: 'harassment',
    });

    const savedArg = repoMock.save.mock.calls[0][0] as { reporterId: string };
    expect(savedArg.reporterId).toBe('reporter-uuid');
  });

  it('generates a Snowflake ID for the report', async () => {
    const report = makeReport();
    repoMock.save.mockResolvedValue(report);

    await service.create('user-uuid', {
      targetType: 'post',
      targetId: '111',
      reason: 'hate_speech',
    });

    const savedArg = repoMock.save.mock.calls[0][0] as { id: string };
    expect(savedArg.id).toBeTruthy();
    // Snowflake IDs are numeric strings
    expect(/^\d+$/.test(savedArg.id)).toBe(true);
  });

  it('works for user target type', async () => {
    const report = makeReport({ targetType: 'user', targetId: 'user-target-uuid' });
    repoMock.save.mockResolvedValue(report);

    const result = await service.create('reporter-uuid', {
      targetType: 'user',
      targetId: 'user-target-uuid',
      reason: 'misinformation',
    });

    expect(result.targetType).toBe('user');
    expect(result.targetId).toBe('user-target-uuid');
  });

  it('handles all reason codes', async () => {
    const reasons = ['spam', 'harassment', 'hate_speech', 'misinformation', 'other'] as const;

    for (const reason of reasons) {
      const report = makeReport({ reason });
      repoMock.save.mockResolvedValue(report);

      const result = await service.create('u', { targetType: 'post', targetId: '1', reason });
      expect(result.reason).toBe(reason);
    }
  });
});
