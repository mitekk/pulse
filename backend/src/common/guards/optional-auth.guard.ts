import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AccessTokenPayload } from '../../modules/auth/auth.service';

interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AccessTokenPayload & { id: string };
}

/**
 * OptionalAuthGuard — extracts and validates the Bearer token if present.
 *
 * Never rejects the request — an invalid or missing token simply leaves
 * request.user undefined. Use for public endpoints that personalize when authed
 * (e.g. post detail with viewer flags).
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractBearerToken(request);

    if (!token) return true;

    try {
      const secret = this.config.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-in-production';
      const payload = this.jwtService.verify<AccessTokenPayload>(token, { secret });
      request.user = { ...payload, id: payload.sub };
    } catch {
      // Silently ignore invalid token — endpoint remains accessible
    }

    return true;
  }

  private extractBearerToken(request: FastifyRequest): string | null {
    const auth = request.headers['authorization'];
    const value = Array.isArray(auth) ? auth[0] : auth;
    if (!value?.startsWith('Bearer ')) return null;
    return value.slice(7);
  }
}
