/**
 * AuthService unit tests
 *
 * All external dependencies mocked via vi.fn() / vi.spyOn().
 * No real DB, Redis, or JWT infrastructure is involved.
 */
import { describe, it, expect, vi } from 'vitest';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { User } from '../../../src/modules/users/user.entity';
import { Session } from '../../../src/modules/auth/session.entity';
import { EmailVerificationToken } from '../../../src/modules/auth/email-verification-token.entity';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'user-uuid-1';
  u.handle = 'alice';
  u.displayName = 'Alice';
  u.email = 'alice@example.com';
  u.passwordHash = '$argon2id$v=19$placeholder'; // will be replaced in hash tests
  u.bio = null;
  u.location = null;
  u.website = null;
  u.avatarMediaId = null;
  u.bannerMediaId = null;
  u.isVerified = false;
  u.isPrivate = false;
  u.dmPrivacy = 'following';
  u.followersCount = 0;
  u.followingCount = 0;
  u.postsCount = 0;
  u.emailVerifiedAt = null;
  u.createdAt = new Date('2026-01-01T00:00:00Z');
  u.updatedAt = new Date('2026-01-01T00:00:00Z');
  u.deletedAt = null;
  return Object.assign(u, overrides);
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const s = new Session();
  s.id = '1234567890';
  s.userId = 'user-uuid-1';
  s.refreshHash = 'abc123';
  s.familyId = 'family-uuid-1';
  s.userAgent = 'TestAgent/1.0';
  s.ip = '127.0.0.1';
  s.createdAt = new Date();
  s.expiresAt = new Date(Date.now() + 86_400_000 * 30);
  s.revokedAt = null;
  return Object.assign(s, overrides);
}

// ── Build a testable AuthService with all repos mocked ────────────────────────

function buildService() {
  const userRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    createQueryBuilder: vi.fn(),
  };

  const sessionRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
    find: vi.fn(),
  };

  const evtRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const jwtService = {
    sign: vi.fn().mockReturnValue('mock.access.token'),
    verify: vi.fn(),
  };

  const config = {
    get: vi.fn((key: string) => {
      const vals: Record<string, string | number> = {
        JWT_ACCESS_SECRET: 'test-secret',
        JWT_ACCESS_EXPIRY: '15m',
        JWT_REFRESH_EXPIRY: '30d',
      };
      return vals[key] ?? undefined;
    }),
  };

  const mailer = {
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  };

  // Wire up QBs to return chainable builder
  const makeQb = (returnValue: unknown = null) => {
    const qb = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orWhere: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({ affected: 1 }),
      getOne: vi.fn().mockResolvedValue(returnValue),
      getMany: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn().mockReturnThis(),
      relations: vi.fn().mockReturnThis(),
    };
    return qb;
  };

  userRepo.createQueryBuilder.mockReturnValue(makeQb(null));
  sessionRepo.createQueryBuilder.mockReturnValue(makeQb(null));

  const service = new AuthService(
    userRepo as never,
    sessionRepo as never,
    evtRepo as never,
    jwtService as never,
    config as never,
    mailer,
  );

  return { service, userRepo, sessionRepo, evtRepo, jwtService, config, mailer, makeQb };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  // ── hashToken ──────────────────────────────────────────────────────────────

  describe('hashToken', () => {
    it('returns SHA-256 hex of the input', () => {
      const { service } = buildService();
      const raw = 'hello-world';
      const expected = crypto.createHash('sha256').update(raw).digest('hex');
      expect(service.hashToken(raw)).toBe(expected);
    });

    it('produces a 64-char hex string', () => {
      const { service } = buildService();
      expect(service.hashToken('anything')).toHaveLength(64);
    });

    it('is deterministic — same input, same output', () => {
      const { service } = buildService();
      expect(service.hashToken('abc')).toBe(service.hashToken('abc'));
    });

    it('produces different hashes for different inputs', () => {
      const { service } = buildService();
      expect(service.hashToken('aaa')).not.toBe(service.hashToken('bbb'));
    });
  });

  // ── parseExpiry ────────────────────────────────────────────────────────────

  describe('parseExpiry', () => {
    it('parses 15m correctly', () => {
      const { service } = buildService();
      const before = Date.now();
      const result = service.parseExpiry('15m');
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
      expect(result.getTime()).toBeLessThanOrEqual(after + 15 * 60_000);
    });

    it('parses 30d correctly', () => {
      const { service } = buildService();
      const d = service.parseExpiry('30d');
      const diffMs = d.getTime() - Date.now();
      // Allow 2s delta
      expect(diffMs).toBeGreaterThan(30 * 86_400_000 - 2000);
      expect(diffMs).toBeLessThan(30 * 86_400_000 + 2000);
    });

    it('throws on invalid format', () => {
      const { service } = buildService();
      expect(() => service.parseExpiry('invalid')).toThrow();
    });
  });

  // ── password hashing ───────────────────────────────────────────────────────

  describe('password hashing (argon2id)', () => {
    it('argon2.hash produces an argon2id hash', async () => {
      const hash = await argon2.hash('password123', { type: argon2.argon2id });
      expect(hash).toMatch(/^\$argon2id/);
    });

    it('argon2.verify returns true for correct password', async () => {
      const hash = await argon2.hash('secret', { type: argon2.argon2id });
      expect(await argon2.verify(hash, 'secret')).toBe(true);
    });

    it('argon2.verify returns false for wrong password', async () => {
      const hash = await argon2.hash('secret', { type: argon2.argon2id });
      expect(await argon2.verify(hash, 'wrong')).toBe(false);
    });

    it('two hashes of the same password are different (random salt)', async () => {
      const h1 = await argon2.hash('same', { type: argon2.argon2id });
      const h2 = await argon2.hash('same', { type: argon2.argon2id });
      expect(h1).not.toBe(h2);
    });
  });

  // ── issueTokenPair ─────────────────────────────────────────────────────────

  describe('issueTokenPair', () => {
    it('returns an accessToken and rawRefreshToken', async () => {
      const { service, sessionRepo } = buildService();
      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const user = makeUser();
      const result = await service.issueTokenPair(user, 'UA', '1.2.3.4');

      expect(result.accessToken).toBe('mock.access.token');
      expect(typeof result.rawRefreshToken).toBe('string');
      expect(result.rawRefreshToken.length).toBe(64); // 32 bytes hex
    });

    it('stores a hashed refresh token (not the raw value)', async () => {
      const { service, sessionRepo } = buildService();
      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const user = makeUser();
      const result = await service.issueTokenPair(user, null, null);

      const expectedHash = service.hashToken(result.rawRefreshToken);
      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ refreshHash: expectedHash }),
      );
    });

    it('uses existing familyId when provided (rotation)', async () => {
      const { service, sessionRepo } = buildService();
      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const user = makeUser();
      const familyId = 'existing-family-id';
      await service.issueTokenPair(user, null, null, familyId);

      expect(sessionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ familyId }));
    });

    it('generates a new familyId when none provided (fresh login)', async () => {
      const { service, sessionRepo } = buildService();
      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const user = makeUser();
      await service.issueTokenPair(user, null, null);

      const call = sessionRepo.create.mock.calls[0][0] as { familyId: string };
      expect(typeof call.familyId).toBe('string');
      expect(call.familyId.length).toBeGreaterThan(0);
    });
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a user and returns UserDto + tokens', async () => {
      const { service, userRepo, sessionRepo } = buildService();
      const qb = {
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(null), // no existing user
      };
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const user = makeUser();
      userRepo.create.mockReturnValue(user);
      userRepo.save.mockResolvedValue(user);

      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const result = await service.register({
        email: 'alice@example.com',
        handle: 'alice',
        password: 'securepassword',
      });

      expect(result.user.handle).toBe('alice');
      expect(result.tokens.accessToken).toBe('mock.access.token');
    });

    it('throws ConflictException when email already exists', async () => {
      const { service, userRepo } = buildService();
      const existingUser = makeUser({ email: 'alice@example.com' });
      const qb = {
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(existingUser),
      };
      userRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.register({
          email: 'alice@example.com',
          handle: 'new_handle',
          password: 'pass1234',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when handle already exists', async () => {
      const { service, userRepo } = buildService();
      const existingUser = makeUser({ handle: 'alice', email: 'other@example.com' });
      const qb = {
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(existingUser),
      };
      userRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.register({ email: 'new@example.com', handle: 'alice', password: 'pass1234' }),
      ).rejects.toThrow(ConflictException);
    });

    it('uses displayName from dto when provided', async () => {
      const { service, userRepo, sessionRepo } = buildService();
      const qb = {
        where: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(null),
      };
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const user = makeUser({ displayName: 'Alice W.' });
      userRepo.create.mockReturnValue(user);
      userRepo.save.mockResolvedValue(user);

      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      await service.register({
        email: 'a@b.com',
        handle: 'alice',
        password: 'pass1234',
        displayName: 'Alice W.',
      });

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Alice W.' }),
      );
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('logs in with email and correct password', async () => {
      const { service, userRepo, sessionRepo } = buildService();

      // Create a real argon2 hash for the test password
      const realHash = await argon2.hash('correct_pass', { type: argon2.argon2id });
      const user = makeUser({ email: 'alice@example.com', passwordHash: realHash });
      userRepo.findOne.mockResolvedValue(user);

      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const result = await service.login(
        { emailOrHandle: 'alice@example.com', password: 'correct_pass' },
        'UA',
        '1.2.3.4',
      );

      expect(result.user.email).toBe('alice@example.com');
      expect(result.tokens.accessToken).toBe('mock.access.token');
    });

    it('logs in with handle and correct password', async () => {
      const { service, userRepo, sessionRepo } = buildService();

      const realHash = await argon2.hash('correct_pass', { type: argon2.argon2id });
      const user = makeUser({ handle: 'alice', passwordHash: realHash });
      userRepo.findOne.mockResolvedValue(user);

      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      const result = await service.login(
        { emailOrHandle: 'alice', password: 'correct_pass' },
        null,
        null,
      );

      expect(result.user.handle).toBe('alice');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const { service, userRepo } = buildService();

      const realHash = await argon2.hash('correct_pass', { type: argon2.argon2id });
      const user = makeUser({ passwordHash: realHash });
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.login({ emailOrHandle: 'alice@example.com', password: 'wrong_pass' }, null, null),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for unknown email (no user enumeration)', async () => {
      const { service, userRepo } = buildService();
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ emailOrHandle: 'unknown@example.com', password: 'anything' }, null, null),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('routes to email lookup when emailOrHandle contains @', async () => {
      const { service, userRepo, sessionRepo } = buildService();
      const realHash = await argon2.hash('pass', { type: argon2.argon2id });
      const user = makeUser({ passwordHash: realHash });
      userRepo.findOne.mockResolvedValue(user);

      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      await service.login({ emailOrHandle: 'user@test.com', password: 'pass' }, null, null);

      expect(userRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'user@test.com' } }),
      );
    });

    it('routes to handle lookup when emailOrHandle has no @', async () => {
      const { service, userRepo, sessionRepo } = buildService();
      const realHash = await argon2.hash('pass', { type: argon2.argon2id });
      const user = makeUser({ passwordHash: realHash });
      userRepo.findOne.mockResolvedValue(user);

      const session = makeSession();
      sessionRepo.create.mockReturnValue(session);
      sessionRepo.save.mockResolvedValue(session);

      await service.login({ emailOrHandle: 'alice', password: 'pass' }, null, null);

      expect(userRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { handle: 'alice' } }),
      );
    });
  });

  // ── refresh + reuse detection ──────────────────────────────────────────────

  describe('refresh', () => {
    it('rotates the refresh token and returns a new access token', async () => {
      const { service, sessionRepo } = buildService();
      const rawToken = 'raw-refresh-token-abc';
      const hash = service.hashToken(rawToken);

      const user = makeUser();
      const session = makeSession({ refreshHash: hash, user });
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockResolvedValue({ ...session, revokedAt: new Date() });

      // Mock new session creation
      const newSession = makeSession({ id: '9999', refreshHash: 'new-hash' });
      sessionRepo.create.mockReturnValue(newSession);
      sessionRepo.save
        .mockResolvedValueOnce({ ...session, revokedAt: new Date() }) // revoke old
        .mockResolvedValueOnce(newSession); // create new

      const result = await service.refresh(rawToken, null, null);

      expect(result.accessToken).toBe('mock.access.token');
      expect(typeof result.tokens.rawRefreshToken).toBe('string');
    });

    it('revokes entire session family on reuse detection', async () => {
      const { service, sessionRepo, makeQb } = buildService();
      const rawToken = 'reused-token';
      const hash = service.hashToken(rawToken);

      // Session already revoked → reuse
      const session = makeSession({ refreshHash: hash, revokedAt: new Date(), user: makeUser() });
      sessionRepo.findOne.mockResolvedValue(session);

      const qb = makeQb();
      sessionRepo.createQueryBuilder.mockReturnValue(qb);
      // chain: .update().set().where().execute()
      qb.update = vi.fn().mockReturnValue(qb);
      qb.set = vi.fn().mockReturnValue(qb);
      qb.where = vi.fn().mockReturnValue(qb);
      qb.execute = vi.fn().mockResolvedValue({ affected: 2 });

      await expect(service.refresh(rawToken, null, null)).rejects.toThrow(UnauthorizedException);

      // Verify family-wide revocation query was called
      expect(sessionRepo.createQueryBuilder).toHaveBeenCalled();
    });

    it('throws UnauthorizedException for unknown token', async () => {
      const { service, sessionRepo } = buildService();
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.refresh('unknown-token', null, null)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for expired session', async () => {
      const { service, sessionRepo } = buildService();
      const rawToken = 'valid-but-expired';
      const hash = service.hashToken(rawToken);

      const session = makeSession({
        refreshHash: hash,
        expiresAt: new Date(Date.now() - 1000), // in the past
        revokedAt: null,
        user: makeUser(),
      });
      sessionRepo.findOne.mockResolvedValue(session);

      await expect(service.refresh(rawToken, null, null)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── verifyEmail ────────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('marks token as used and updates emailVerifiedAt', async () => {
      const { service, evtRepo, userRepo } = buildService();
      const rawToken = 'valid-verify-token';
      const hash = service.hashToken(rawToken);

      const user = makeUser();
      const evt = new EmailVerificationToken();
      evt.id = 'evt-1';
      evt.userId = user.id;
      evt.tokenHash = hash;
      evt.expiresAt = new Date(Date.now() + 60_000);
      evt.usedAt = null;
      evt.createdAt = new Date();
      evt.user = user;

      evtRepo.findOne.mockResolvedValue(evt);
      evtRepo.save.mockResolvedValue({ ...evt, usedAt: new Date() });
      userRepo.update.mockResolvedValue(undefined);

      await service.verifyEmail(rawToken);

      expect(evtRepo.save).toHaveBeenCalled();
      expect(userRepo.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      );
    });

    it('throws UnauthorizedException for unknown token', async () => {
      const { service, evtRepo } = buildService();
      evtRepo.findOne.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for already-used token', async () => {
      const { service, evtRepo } = buildService();
      const rawToken = 'used-token';
      const hash = service.hashToken(rawToken);

      const evt = new EmailVerificationToken();
      evt.tokenHash = hash;
      evt.expiresAt = new Date(Date.now() + 60_000);
      evt.usedAt = new Date(); // already used

      evtRepo.findOne.mockResolvedValue(evt);

      await expect(service.verifyEmail(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired token', async () => {
      const { service, evtRepo } = buildService();
      const rawToken = 'expired-token';
      const hash = service.hashToken(rawToken);

      const evt = new EmailVerificationToken();
      evt.tokenHash = hash;
      evt.expiresAt = new Date(Date.now() - 1000); // past
      evt.usedAt = null;

      evtRepo.findOne.mockResolvedValue(evt);

      await expect(service.verifyEmail(rawToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── getMe ─────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('returns UserDto for valid userId', async () => {
      const { service, userRepo } = buildService();
      const user = makeUser();
      userRepo.findOne.mockResolvedValue(user);

      const dto = await service.getMe(user.id);

      expect(dto.id).toBe(user.id);
      expect(dto.handle).toBe('alice');
      expect(dto.email).toBe('alice@example.com');
    });

    it('throws NotFoundException for unknown userId', async () => {
      const { service, userRepo } = buildService();
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.getMe('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── revokeSession ─────────────────────────────────────────────────────────

  describe('revokeSession', () => {
    it('sets revokedAt on the session', async () => {
      const { service, sessionRepo } = buildService();
      const session = makeSession({ userId: 'user-uuid-1' });
      sessionRepo.findOne.mockResolvedValue(session);
      sessionRepo.save.mockResolvedValue({ ...session, revokedAt: new Date() });

      await service.revokeSession(session.id, 'user-uuid-1');

      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws NotFoundException when session belongs to different user', async () => {
      const { service, sessionRepo } = buildService();
      const session = makeSession({ userId: 'other-user-id' });
      sessionRepo.findOne.mockResolvedValue(session);

      await expect(service.revokeSession(session.id, 'attacker-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when session does not exist', async () => {
      const { service, sessionRepo } = buildService();
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(service.revokeSession('ghost-session', 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
