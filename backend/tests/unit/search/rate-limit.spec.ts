import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';

// ── Minimal stubs ─────────────────────────────────────────────────────────────

type MockReflector = { getAllAndOverride: ReturnType<typeof vi.fn> };
type MockRedis = {
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
};

function makeContext(overrides: {
  handler?: object;
  cls?: object;
  userId?: string;
  ip?: string;
  response?: object;
}) {
  const response = overrides.response ?? {
    header: vi.fn(),
  };
  return {
    getHandler: () => overrides.handler ?? {},
    getClass: () => overrides.cls ?? {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: overrides.userId ? { id: overrides.userId } : undefined,
        ip: overrides.ip ?? '127.0.0.1',
      }),
      getResponse: () => response,
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RateLimitGuard', () => {
  let guard: import('../../../src/common/guards/rate-limit.guard').RateLimitGuard;
  let reflectorMock: MockReflector;
  let redisMock: MockRedis;

  beforeEach(async () => {
    const { RateLimitGuard } = await import('../../../src/common/guards/rate-limit.guard');

    reflectorMock = {
      getAllAndOverride: vi.fn(),
    };

    redisMock = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(60),
    };

    const redisServiceMock = { client: redisMock };

    guard = new RateLimitGuard(reflectorMock as never, redisServiceMock as never);
  });

  it('passes through when no @RateLimit decorator is present', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(undefined);
    const ctx = makeContext({});
    const result = await guard.canActivate(ctx as never);
    expect(result).toBe(true);
    expect(redisMock.incr).not.toHaveBeenCalled();
  });

  it('allows request when count is within limit', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue({
      max: 10,
      windowSecs: 60,
      keyPrefix: 'test',
    });
    redisMock.incr.mockResolvedValue(5);

    const ctx = makeContext({ userId: 'user-1' });
    const result = await guard.canActivate(ctx as never);
    expect(result).toBe(true);
  });

  it('throws 429 when count exceeds limit', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue({
      max: 10,
      windowSecs: 60,
      keyPrefix: 'test',
    });
    redisMock.incr.mockResolvedValue(11);

    const ctx = makeContext({ userId: 'user-1' });
    await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('sets expiry only on first request (count === 1)', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue({
      max: 10,
      windowSecs: 60,
      keyPrefix: 'test',
    });
    redisMock.incr.mockResolvedValue(1);

    const ctx = makeContext({ userId: 'user-1' });
    await guard.canActivate(ctx as never);
    expect(redisMock.expire).toHaveBeenCalledOnce();
  });

  it('does not set expiry on subsequent requests (count > 1)', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue({
      max: 10,
      windowSecs: 60,
      keyPrefix: 'test',
    });
    redisMock.incr.mockResolvedValue(5);

    const ctx = makeContext({ userId: 'user-1' });
    await guard.canActivate(ctx as never);
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it('uses user ID key when authenticated', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue({
      max: 10,
      windowSecs: 60,
      keyPrefix: 'post',
    });
    redisMock.incr.mockResolvedValue(1);

    const ctx = makeContext({ userId: 'my-user-id' });
    await guard.canActivate(ctx as never);

    const key = redisMock.incr.mock.calls[0][0] as string;
    expect(key).toBe('rl:post:user:my-user-id');
  });

  it('falls back to IP key when unauthenticated', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue({
      max: 10,
      windowSecs: 60,
      keyPrefix: 'search',
    });
    redisMock.incr.mockResolvedValue(1);

    const ctx = makeContext({ ip: '192.168.1.1' });
    await guard.canActivate(ctx as never);

    const key = redisMock.incr.mock.calls[0][0] as string;
    expect(key).toBe('rl:search:ip:192.168.1.1');
  });

  it('returns RATE_LIMIT_EXCEEDED error code on 429', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue({
      max: 5,
      windowSecs: 3600,
      keyPrefix: 'follow',
    });
    redisMock.incr.mockResolvedValue(6);

    const ctx = makeContext({ userId: 'user-1' });
    let thrown: unknown;
    try {
      await guard.canActivate(ctx as never);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeDefined();
    const err = thrown as { response?: { error?: { code: string } } };
    expect(err.response?.error?.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
