import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionCleanupProcessor } from '../../../src/modules/auth/session-cleanup.processor';

function makeQueryBuilderMock(affectedRows = 0) {
  const qb = {
    delete: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ affected: affectedRows }),
  };
  return qb;
}

function makeRepoMock(affectedRows = 0) {
  const qb = makeQueryBuilderMock(affectedRows);
  return {
    createQueryBuilder: vi.fn().mockReturnValue(qb),
    _qb: qb,
  };
}

function makeJob(name: string, data: object) {
  return { name, data } as never;
}

describe('SessionCleanupProcessor', () => {
  let processor: SessionCleanupProcessor;
  let repoMock: ReturnType<typeof makeRepoMock>;

  beforeEach(() => {
    repoMock = makeRepoMock(5);
    processor = new SessionCleanupProcessor(repoMock as never);
  });

  it('processes session.cleanup job without throwing', async () => {
    await expect(
      processor.process(makeJob('session.cleanup', { jobType: 'cleanup' })),
    ).resolves.toBeUndefined();
  });

  it('calls delete twice (expired + old-revoked)', async () => {
    await processor.process(makeJob('session.cleanup', { jobType: 'cleanup' }));
    expect(repoMock.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('filters by expires_at for expired sessions', async () => {
    await processor.process(makeJob('session.cleanup', { jobType: 'cleanup' }));
    const qb = repoMock._qb;
    // First call: expires_at < now
    const whereCalls = qb.where.mock.calls as [string][];
    expect(whereCalls.some((c) => c[0].includes('expires_at'))).toBe(true);
  });

  it('filters by revoked_at for old-revoked sessions', async () => {
    await processor.process(makeJob('session.cleanup', { jobType: 'cleanup' }));
    const qb = repoMock._qb;
    const andWhereCalls = qb.andWhere.mock.calls as [string][];
    expect(andWhereCalls.some((c) => c[0].includes('revoked_at'))).toBe(true);
  });

  it('ignores unknown job names without throwing', async () => {
    await expect(processor.process(makeJob('unknown.job', {}))).resolves.toBeUndefined();
    // No DB calls for unknown jobs
    expect(repoMock.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('handles zero affected rows gracefully', async () => {
    repoMock = makeRepoMock(0);
    processor = new SessionCleanupProcessor(repoMock as never);
    await expect(
      processor.process(makeJob('session.cleanup', { jobType: 'cleanup' })),
    ).resolves.toBeUndefined();
  });
});
