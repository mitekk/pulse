import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitConfig } from '../decorators/rate-limit.decorator';
import { RedisService } from '../../infra/redis/redis.service';

interface FastifyRequest {
  user?: { id?: string };
  ip?: string;
  url?: string;
  method?: string;
}

/**
 * RateLimitGuard — Redis token-bucket rate limiter.
 *
 * Key scheme:
 *   - Authenticated user: rl:{prefix}:user:{userId}
 *   - Unauthenticated / IP-based: rl:{prefix}:ip:{ip}
 *
 * Algorithm: sliding window using INCR + EXPIRE.
 * Specific rate limits per route are applied via @RateLimit() decorator.
 * When no decorator is present the guard is a no-op (pass through).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @RateLimit() on this route — pass through
    if (!config) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const key = this.buildKey(config, request);

    const redis = this.redisService.client;

    const current = await redis.incr(key);
    if (current === 1) {
      // First request in window — set the expiry
      await redis.expire(key, config.windowSecs);
    }

    if (current > config.max) {
      this.logger.warn(`Rate limit exceeded [key=${key}] [count=${current}] [max=${config.max}]`);

      // Get remaining TTL so we can return Retry-After
      const ttl = await redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : config.windowSecs;

      // Attach Retry-After header to the response
      const response = context.switchToHttp().getResponse<{
        header?: (name: string, value: string) => void;
        setHeader?: (name: string, value: string) => void;
      }>();
      const setHeader = response.header ?? response.setHeader;
      if (setHeader) {
        setHeader.call(response, 'Retry-After', String(retryAfter));
      }

      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Maximum ${config.max} requests per ${config.windowSecs} seconds.`,
            details: [{ field: 'retryAfter', message: `Retry after ${retryAfter} seconds` }],
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private buildKey(config: RateLimitConfig, request: FastifyRequest): string {
    const prefix = config.keyPrefix ?? 'default';
    const userId = request.user?.id;

    if (userId) {
      return `rl:${prefix}:user:${userId}`;
    }

    // Fall back to IP — Fastify populates req.ip
    const ip = request.ip ?? 'unknown';
    return `rl:${prefix}:ip:${ip}`;
  }
}
