import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  max: number;
  /** Window duration in seconds */
  windowSecs: number;
  /** Optional key prefix to scope limits to specific route groups */
  keyPrefix?: string;
}

/**
 * RateLimit decorator — attaches rate-limit config to a route.
 * RateLimitGuard reads this metadata to enforce token-bucket limits.
 *
 * Usage:
 *   @RateLimit({ max: 10, windowSecs: 600 })  // 10 req / 10 min
 *   @Post('login')
 */
export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);
