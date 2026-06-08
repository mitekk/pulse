import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { QuotaService } from '../../../src/modules/media/quota.service';
import { MediaLimits } from '../../../src/modules/media/media-limits';

describe('QuotaService', () => {
  const usageRepo = { query: vi.fn(), findOne: vi.fn() };
  const mediaRepo = { createQueryBuilder: vi.fn() };
  // defaults: 500 MB cap, 80% soft threshold
  const limits = new MediaLimits({ get: () => undefined } as unknown as ConfigService);
  let quota: QuotaService;

  beforeEach(() => {
    vi.clearAllMocks();
    quota = new QuotaService(usageRepo as never, mediaRepo as never, limits);
  });

  it('reserve resolves and CAS-updates when under the cap', async () => {
    usageRepo.query.mockResolvedValue([{ total_bytes: '1000' }]);
    await expect(quota.reserve(1000)).resolves.toBeUndefined();
    expect(usageRepo.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE storage_usage'), [
      1000,
      limits.globalCapBytes,
    ]);
  });

  it('reserve throws 507 when the cap would be exceeded (no row updated)', async () => {
    usageRepo.query.mockResolvedValue([]); // conditional UPDATE matched nothing
    await expect(quota.reserve(limits.globalCapBytes + 1)).rejects.toBeInstanceOf(HttpException);
  });

  it('release decrements with a clamped negative delta', async () => {
    usageRepo.query.mockResolvedValue([]);
    await quota.release(500);
    expect(usageRepo.query).toHaveBeenCalledWith(expect.stringContaining('GREATEST(0'), [-500]);
  });

  it('release is a no-op for zero/negative bytes', async () => {
    await quota.release(0);
    expect(usageRepo.query).not.toHaveBeenCalled();
  });

  it('reconcile recomputes the counter from the live media sum', async () => {
    mediaRepo.createQueryBuilder.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue({ sum: '4242' }),
    });
    usageRepo.query.mockResolvedValue([]);
    const total = await quota.reconcile();
    expect(total).toBe(4242);
    expect(usageRepo.query).toHaveBeenCalledWith(
      expect.stringContaining('SET total_bytes = $1'),
      [4242],
    );
  });
});
