import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';
import { RedisService } from '../../infra/redis/redis.service';
import { EmailVerificationToken } from './email-verification-token.entity';
import { MAILER_PORT, MailerPort } from './mailer.port';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserDto } from './dto/user.dto';
import { SessionDto } from './dto/session.dto';

export interface AccessTokenPayload {
  sub: string; // user.id (UUID)
  handle: string;
  sessionId: string; // session.id (Snowflake string)
}

export interface TokenPair {
  accessToken: string;
  /** Raw (un-hashed) refresh token — deliver to client in httpOnly cookie */
  rawRefreshToken: string;
  session: Session;
}

/** How long a verification token stays valid */
const EMAIL_TOKEN_EXPIRY_MINUTES = 60;

/** Parse a JWT-style duration ('15m', '30d', '900s', '1h') to seconds. */
function parseDurationSeconds(value: string, fallback: number): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return fallback;
  const n = Number(match[1]);
  const unit = match[2] ?? 's';
  const mult = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;
  return n * mult;
}

/**
 * argon2id options (cost factor ≥ 12 per security.md + ADR-0003).
 * memoryCost in KiB, timeCost in iterations.
 */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly accessExpiry: string;
  private readonly refreshExpiry: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(EmailVerificationToken)
    private readonly evtRepo: Repository<EmailVerificationToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @Inject(MAILER_PORT)
    private readonly mailer: MailerPort,
  ) {
    this.accessSecret = this.config.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-in-production';
    this.accessExpiry = this.config.get<string>('JWT_ACCESS_EXPIRY') ?? '15m';
    this.refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRY') ?? '30d';
    // Denylist TTL must cover the access-token lifetime so a revoked session's
    // still-unexpired access token can't be replayed after logout.
    this.revokedSessionTtl = parseDurationSeconds(this.accessExpiry, 900);
  }

  private readonly revokedSessionTtl: number;

  private static readonly REVOKED_SESSION_PREFIX = 'auth:revoked-session:';

  /**
   * Add a session to the Redis revocation denylist. The AuthGuard consults this
   * on every request, so a revoked session's (still-unexpired) access JWT is
   * rejected immediately rather than working until its natural expiry.
   */
  private async denylistSession(sessionId: string): Promise<void> {
    try {
      await this.redis.client.set(
        `${AuthService.REVOKED_SESSION_PREFIX}${sessionId}`,
        '1',
        'EX',
        this.revokedSessionTtl,
      );
    } catch (err) {
      this.logger.error(`Failed to denylist session ${sessionId}: ${String(err)}`);
    }
  }

  /** True if the session has been revoked (logout / explicit revoke). */
  async isSessionRevoked(sessionId: string): Promise<boolean> {
    try {
      const hit = await this.redis.client.exists(
        `${AuthService.REVOKED_SESSION_PREFIX}${sessionId}`,
      );
      return hit === 1;
    } catch (err) {
      // Fail open: don't take down auth if Redis hiccups — the short-lived access
      // token still expires on its own.
      this.logger.warn(`Session revocation check failed (fail-open): ${String(err)}`);
      return false;
    }
  }

  // ── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ user: UserDto; tokens: TokenPair }> {
    const displayName = dto.displayName ?? dto.handle;

    // Check uniqueness before hashing (fast fail). The DB also enforces uniqueness
    // with a UNIQUE constraint, so concurrent inserts can't slip through.
    const existing = await this.userRepo
      .createQueryBuilder('u')
      .where('u.email = :email OR u.handle = :handle', {
        email: dto.email,
        handle: dto.handle,
      })
      .getOne();

    if (existing) {
      if (existing.email.toLowerCase() === dto.email.toLowerCase()) {
        throw new ConflictException({
          error: {
            code: 'EMAIL_TAKEN',
            message: 'An account with this email already exists.',
          },
        });
      }
      throw new ConflictException({
        error: {
          code: 'HANDLE_TAKEN',
          message: 'This handle is already taken.',
        },
      });
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = this.userRepo.create({
      handle: dto.handle,
      displayName,
      email: dto.email,
      passwordHash,
    });

    try {
      await this.userRepo.save(user);
    } catch (err: unknown) {
      // Handle race-condition duplicates caught by DB constraint
      const e = err as { code?: string };
      if (e?.code === '23505') {
        throw new ConflictException({
          error: { code: 'DUPLICATE_ENTRY', message: 'Email or handle already taken.' },
        });
      }
      throw err;
    }

    // Issue email verification token (fire-and-forget; never block registration)
    void this.issueEmailVerificationToken(user);

    const tokens = await this.issueTokenPair(user, null, null);
    return { user: UserDto.fromEntity(user), tokens };
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    userAgent: string | null,
    ip: string | null,
  ): Promise<{ user: UserDto; tokens: TokenPair }> {
    // Find by email OR handle (citext handles case-insensitivity at DB level)
    const isEmail = dto.emailOrHandle.includes('@');
    const user = await this.userRepo.findOne({
      where: isEmail ? { email: dto.emailOrHandle } : { handle: dto.emailOrHandle },
    });

    // Verify password — always run argon2 to prevent timing-based user enumeration
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder';
    const valid = user
      ? await argon2.verify(user.passwordHash, dto.password, ARGON2_OPTIONS)
      : await argon2.verify(dummyHash, dto.password, ARGON2_OPTIONS).catch(() => false);

    if (!user || !valid) {
      // Generic message: do not reveal whether email/handle exists (security.md)
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid credentials.',
        },
      });
    }

    const tokens = await this.issueTokenPair(user, userAgent, ip);
    return { user: UserDto.fromEntity(user), tokens };
  }

  // ── Refresh (rotate) ────────────────────────────────────────────────────────

  async refresh(
    rawToken: string,
    userAgent: string | null,
    ip: string | null,
  ): Promise<{ accessToken: string; tokens: TokenPair }> {
    const hash = this.hashToken(rawToken);

    const session = await this.sessionRepo.findOne({
      where: { refreshHash: hash },
      relations: ['user'],
    });

    if (!session || !session.user) {
      // Token not found — could be theft; we cannot revoke a family without knowing it
      throw new UnauthorizedException({
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token.' },
      });
    }

    const now = new Date();

    // Reuse detection: if session is already revoked, someone reused an old token.
    // Revoke the entire session family.
    if (session.revokedAt !== null) {
      this.logger.warn(
        `Refresh token reuse detected [familyId=${session.familyId}] [userId=${session.userId}]`,
      );
      await this.sessionRepo
        .createQueryBuilder()
        .update(Session)
        .set({ revokedAt: now })
        .where('family_id = :familyId AND revoked_at IS NULL', { familyId: session.familyId })
        .execute();

      throw new UnauthorizedException({
        error: {
          code: 'REFRESH_TOKEN_REUSE',
          message: 'Refresh token reuse detected. All sessions revoked for security.',
        },
      });
    }

    // Expired?
    if (session.expiresAt < now) {
      throw new UnauthorizedException({
        error: { code: 'REFRESH_TOKEN_EXPIRED', message: 'Refresh token has expired.' },
      });
    }

    // Revoke the current session (rotate)
    session.revokedAt = now;
    await this.sessionRepo.save(session);

    // Issue new token pair in the same family
    const tokens = await this.issueTokenPair(session.user, userAgent, ip, session.familyId);
    return { accessToken: tokens.accessToken, tokens };
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(sessionId: string): Promise<void> {
    await this.sessionRepo
      .createQueryBuilder()
      .update(Session)
      .set({ revokedAt: new Date() })
      .where('id = :id AND revoked_at IS NULL', { id: sessionId })
      .execute();
    await this.denylistSession(sessionId);
  }

  // ── Me ──────────────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    return UserDto.fromEntity(user);
  }

  // ── Sessions list ────────────────────────────────────────────────────────────

  async listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    // Use QueryBuilder for IS NULL condition (TypeORM find() can't express this cleanly)
    const now = new Date();
    const sessions = await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.revoked_at IS NULL')
      .andWhere('s.expires_at > :now', { now })
      .orderBy('s.created_at', 'DESC')
      .getMany();

    return sessions.map((s) => SessionDto.fromEntity(s, currentSessionId));
  }

  // ── Session revocation ───────────────────────────────────────────────────────

  async revokeSession(sessionId: string, requestingUserId: string): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.userId !== requestingUserId) {
      throw new NotFoundException({
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.' },
      });
    }
    session.revokedAt = new Date();
    await this.sessionRepo.save(session);
    await this.denylistSession(sessionId);
  }

  // ── Email verification ───────────────────────────────────────────────────────

  async verifyEmail(rawToken: string): Promise<void> {
    const hash = this.hashToken(rawToken);

    const record = await this.evtRepo.findOne({
      where: { tokenHash: hash },
      relations: ['user'],
    });

    const now = new Date();

    if (!record || record.usedAt !== null || record.expiresAt < now) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_VERIFICATION_TOKEN',
          message: 'Invalid, expired, or already used verification token.',
        },
      });
    }

    // Mark token used and update user
    record.usedAt = now;
    await this.evtRepo.save(record);

    await this.userRepo.update(record.userId, { emailVerifiedAt: now });
  }

  // ── User lookup (for AuthGuard) ──────────────────────────────────────────────

  async findUserById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  /** Issue access JWT + raw refresh token + persist session */
  async issueTokenPair(
    user: User,
    userAgent: string | null,
    ip: string | null,
    existingFamilyId?: string,
  ): Promise<TokenPair> {
    const familyId = existingFamilyId ?? uuidv4();
    const sessionId = SnowflakeUtil.instance.generate();

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = this.hashToken(rawRefreshToken);

    const expiresAt = this.parseExpiry(this.refreshExpiry);

    const session = this.sessionRepo.create({
      id: sessionId,
      userId: user.id,
      refreshHash,
      familyId,
      userAgent,
      ip,
      expiresAt,
      revokedAt: null,
    });
    await this.sessionRepo.save(session);

    const payload: AccessTokenPayload = {
      sub: user.id,
      handle: user.handle,
      sessionId,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessToken = this.jwtService.sign(payload as any, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiry as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    return { accessToken, rawRefreshToken, session };
  }

  /** SHA-256 hex hash of a raw token */
  hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /** Parse expiry string like '30d', '15m', '1h' into a Date */
  parseExpiry(expiry: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiry);
    if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const ms: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return new Date(Date.now() + value * ms[unit]);
  }

  /** Issue and persist an email verification token, then send via mailer */
  private async issueEmailVerificationToken(user: User): Promise<void> {
    try {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(rawToken);
      const expiresAt = new Date(Date.now() + EMAIL_TOKEN_EXPIRY_MINUTES * 60_000);

      const evt = this.evtRepo.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        usedAt: null,
      });
      await this.evtRepo.save(evt);

      await this.mailer.sendEmailVerification({
        to: user.email,
        handle: user.handle,
        token: rawToken,
        expiresInMinutes: EMAIL_TOKEN_EXPIRY_MINUTES,
      });
    } catch (err) {
      // Log but never surface — verification email failure must not block registration
      this.logger.error('Failed to issue email verification token', err);
    }
  }
}
