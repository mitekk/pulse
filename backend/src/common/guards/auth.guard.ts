import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AccessTokenPayload } from '../../modules/auth/auth.service';
import { AuthService } from '../../modules/auth/auth.service';

interface FastifyRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AccessTokenPayload & { id: string };
}

/**
 * AuthGuard — verifies the Bearer access JWT on every protected route.
 *
 * Routes decorated with @Public() bypass this guard entirely.
 * On success, attaches the decoded payload + user.id to request.user so
 * @CurrentUser() can extract it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() bypass
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException({
        error: { code: 'MISSING_TOKEN', message: 'Authentication required.' },
      });
    }

    try {
      const secret = this.config.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-in-production';
      const payload = this.jwtService.verify<AccessTokenPayload>(token, { secret });

      // Reject access tokens whose session was revoked (logout / session revoke),
      // even though the JWT signature is still cryptographically valid.
      if (await this.authService.isSessionRevoked(payload.sessionId)) {
        throw new UnauthorizedException({
          error: { code: 'SESSION_REVOKED', message: 'Session has been revoked.' },
        });
      }

      // Attach to request so @CurrentUser() can extract it
      request.user = { ...payload, id: payload.sub };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.debug(`JWT verification failed: ${String(err)}`);
      throw new UnauthorizedException({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired access token.' },
      });
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
