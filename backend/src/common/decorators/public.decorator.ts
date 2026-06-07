import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Public decorator — marks a route as publicly accessible.
 * AuthGuard (Phase 2) checks this metadata to skip token validation.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
