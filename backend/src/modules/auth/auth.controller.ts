import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CsrfUtil } from './csrf.util';

const REFRESH_COOKIE = 'refresh_token';
const CSRF_COOKIE = 'csrf_token';

@Controller('auth')
@UseGuards(AuthGuard, RateLimitGuard)
export class AuthController {
  private readonly isProduction: boolean;
  private readonly refreshExpiryMs: number;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    this.isProduction = (this.config.get<string>('NODE_ENV') ?? 'development') === 'production';
    this.refreshExpiryMs = this.parseExpiryMs(
      this.config.get<string>('JWT_REFRESH_EXPIRY') ?? '30d',
    );
  }

  // ── Register ─────────────────────────────────────────────────────────────────

  @Post('register')
  @Public()
  @RateLimit({ max: 10, windowSecs: 600, keyPrefix: 'auth:register' })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res() reply: FastifyReply) {
    const { user, tokens } = await this.authService.register(dto);
    this.setRefreshCookie(reply, tokens.rawRefreshToken);
    const csrf = this.setCsrfCookie(reply);
    return reply.status(HttpStatus.CREATED).send({ user, accessToken: tokens.accessToken, csrf });
  }

  // ── Login ─────────────────────────────────────────────────────────────────────

  @Post('login')
  @Public()
  @RateLimit({ max: 10, windowSecs: 600, keyPrefix: 'auth:login' })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    const ip = req.ip ?? null;
    const { user, tokens } = await this.authService.login(dto, userAgent, ip);
    this.setRefreshCookie(reply, tokens.rawRefreshToken);
    const csrf = this.setCsrfCookie(reply);
    return reply.status(HttpStatus.OK).send({ user, accessToken: tokens.accessToken, csrf });
  }

  // ── Refresh ───────────────────────────────────────────────────────────────────

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    // CSRF double-submit validation
    const csrfCookie = (req.cookies as Record<string, string | undefined>)[CSRF_COOKIE];
    const csrfHeader = req.headers['x-csrf-token'] as string | undefined;

    if (!CsrfUtil.validate(csrfCookie, csrfHeader)) {
      throw new ForbiddenException({
        error: { code: 'CSRF_VALIDATION_FAILED', message: 'CSRF token mismatch.' },
      });
    }

    const rawRefreshToken = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];

    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        error: { code: 'MISSING_REFRESH_TOKEN', message: 'Refresh token cookie not found.' },
      });
    }

    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    const ip = req.ip ?? null;

    const result = await this.authService.refresh(rawRefreshToken, userAgent, ip);
    this.setRefreshCookie(reply, result.tokens.rawRefreshToken);
    const csrf = this.setCsrfCookie(reply);

    return reply.status(HttpStatus.OK).send({ accessToken: result.accessToken, csrf });
  }

  // ── Logout ────────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedUser, @Res() reply: FastifyReply) {
    await this.authService.logout(user.sessionId);
    this.clearCookies(reply);
    return reply.status(HttpStatus.NO_CONTENT).send();
  }

  // ── Me ────────────────────────────────────────────────────────────────────────

  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    const userDto = await this.authService.getMe(user.id);
    return { user: userDto };
  }

  // ── Verify email ──────────────────────────────────────────────────────────────

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
    return { message: 'Email verified' };
  }

  // ── Sessions list ─────────────────────────────────────────────────────────────

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    const items = await this.authService.listSessions(user.id, user.sessionId);
    return { items, cursor: null, hasMore: false };
  }

  // ── Revoke session ────────────────────────────────────────────────────────────

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() reply: FastifyReply,
  ) {
    await this.authService.revokeSession(sessionId, user.id);
    // If revoking own current session, clear cookies too
    if (sessionId === user.sessionId) {
      this.clearCookies(reply);
    }
    return reply.status(HttpStatus.NO_CONTENT).send();
  }

  // ── Cookie helpers ────────────────────────────────────────────────────────────

  private setRefreshCookie(reply: FastifyReply, rawToken: string): void {
    reply.setCookie(REFRESH_COOKIE, rawToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: Math.floor(this.refreshExpiryMs / 1000),
    });
  }

  private setCsrfCookie(reply: FastifyReply): string {
    const token = CsrfUtil.generate();
    reply.setCookie(CSRF_COOKIE, token, {
      httpOnly: false, // must be JS-readable for double-submit
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: Math.floor(this.refreshExpiryMs / 1000),
    });
    return token;
  }

  private clearCookies(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth/refresh' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  private parseExpiryMs(expiry: string): number {
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) return 30 * 86_400_000;
    const value = parseInt(match[1], 10);
    const ms: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return value * ms[match[2]];
  }
}
