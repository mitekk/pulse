import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * CurrentUser decorator — extracts the authenticated user from the request.
 * Populated by AuthGuard in Phase 2. Returns undefined on unauthenticated requests.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user?: unknown }>();
  return request.user;
});
