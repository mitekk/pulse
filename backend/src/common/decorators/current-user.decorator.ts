import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccessTokenPayload } from '../../modules/auth/auth.service';

export type AuthenticatedUser = AccessTokenPayload & { id: string };

/**
 * CurrentUser decorator — extracts the authenticated user from the request.
 * Populated by AuthGuard. Returns undefined on unauthenticated requests (OptionalAuthGuard).
 *
 * Usage:
 *   @Get('me')
 *   getMe(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
